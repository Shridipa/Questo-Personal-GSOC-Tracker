from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from backend.app import database, main
from backend.app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "questline-test.db")
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def test_health_check_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_allows_local_frontend(client: TestClient) -> None:
    response = client.options(
        "/api/quests",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_internal_api_errors_do_not_expose_tracebacks(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail_to_load_quests() -> list[dict[str, object]]:
        raise RuntimeError("private database detail")

    monkeypatch.setattr(main, "list_quests", fail_to_load_quests)

    response = client.get("/api/quests")

    assert response.status_code == 500
    assert "private database detail" not in response.text
    assert "Traceback" not in response.text


def test_quests_api_returns_seed_data_with_contract_shape(client: TestClient) -> None:
    response = client.get("/api/quests")

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"quests"}
    assert len(payload["quests"]) == 8
    assert set(payload["quests"][0]) == {
        "id",
        "title",
        "description",
        "category",
        "minutes",
        "xp",
        "status",
        "phase",
        "date",
    }
    assert payload["quests"][0]["id"] == "welcome"
    assert payload["quests"][0]["status"] == "available"
    assert payload["quests"][1]["status"] == "current"
    assert all(quest["status"] != "completed" for quest in payload["quests"])


def test_roadmap_api_returns_ordered_phases_and_quests(client: TestClient) -> None:
    response = client.get("/api/roadmap")

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"phases"}
    assert [phase["id"] for phase in payload["phases"]] == list(range(1, 8))
    assert set(payload["phases"][0]) == {
        "id",
        "title",
        "dates",
        "description",
        "milestone",
        "quests",
    }
    assert payload["phases"][0]["title"] == "Foundations"
    assert len(payload["phases"][0]["quests"]) == 6
    assert payload["phases"][1]["quests"][0] == "Reproduce a documented issue locally"


def test_empty_database_records_return_empty_lists(client: TestClient) -> None:
    with closing(database.get_connection()) as connection, connection:
        connection.execute("DELETE FROM quests")
        connection.execute("DELETE FROM phase_quests")
        connection.execute("DELETE FROM phases")

    quest_response = client.get("/api/quests")
    roadmap_response = client.get("/api/roadmap")

    assert quest_response.status_code == 200
    assert quest_response.json() == {"quests": []}
    assert roadmap_response.status_code == 200
    assert roadmap_response.json() == {"phases": []}


def test_database_initialization_is_repeatable(client: TestClient) -> None:
    assert database.DATABASE_PATH.is_absolute()
    assert client.get("/health").status_code == 200
    with closing(database.get_connection()) as connection, connection:
        connection.execute("UPDATE quests SET status = 'completed' WHERE id = 'git-workflow'")
    database.initialize_database()
    database.initialize_database()

    assert len(database.list_quests()) == 8
    assert len(database.list_roadmap_phases()) == 7
    assert next(
        quest for quest in database.list_quests() if quest["id"] == "git-workflow"
    )["status"] == "completed"


def test_completing_quest_awards_server_xp_and_advances_current_quest(
    client: TestClient,
) -> None:
    response = client.post("/api/quests/git-workflow/complete")

    assert response.status_code == 201
    payload = response.json()
    assert payload["quest"]["status"] == "completed"
    assert payload["quest"]["id"] == "git-workflow"
    assert payload["completion"]["xp_awarded"] == 10
    assert payload["completion"]["local_date"] == datetime.now(
        UTC
    ).astimezone(database.get_configured_timezone()).date().isoformat()
    assert payload["total_xp"] == 10
    assert payload["already_completed"] is False
    next_quest = next(quest for quest in database.list_quests() if quest["id"] == "merge-conflict")
    assert next_quest["status"] == "current"


def test_nonexistent_and_locked_quests_cannot_be_completed(client: TestClient) -> None:
    missing_response = client.post("/api/quests/not-a-quest/complete")
    locked_response = client.post("/api/quests/first-pr/complete")

    assert missing_response.status_code == 404
    assert locked_response.status_code == 409
    assert database.get_progress()["total_xp"] == 0


def test_repeated_completion_is_idempotent(client: TestClient) -> None:
    first_response = client.post("/api/quests/git-workflow/complete")
    retry_response = client.post("/api/quests/git-workflow/complete")

    assert first_response.status_code == 201
    assert retry_response.status_code == 200
    assert retry_response.json()["already_completed"] is True
    assert retry_response.json()["completion"] == first_response.json()["completion"]
    assert retry_response.json()["total_xp"] == 10
    assert len(database.list_xp_history()) == 1


def test_quest_work_is_read_without_creating_progress(client: TestClient) -> None:
    response = client.get("/api/quests/git-workflow/work")

    assert response.status_code == 200
    assert response.json() == {
        "quest_id": "git-workflow",
        "status": "not_started",
        "notes": "",
        "evidence_url": None,
        "checked_steps": [],
        "updated_at_utc": None,
    }
    with closing(database.get_connection()) as connection:
        assert connection.execute("SELECT COUNT(*) FROM quest_work_state").fetchone()[0] == 0


def test_quest_work_persists_notes_evidence_and_checklist(client: TestClient) -> None:
    payload = {
        "notes": "  Practiced branch and commit workflow.  ",
        "evidence_url": "https://github.com/example/project/pull/12",
        "checked_steps": ["review-branches", "practice-commit"],
    }

    saved = client.put("/api/quests/git-workflow/work", json=payload)
    database.initialize_database()

    assert saved.status_code == 200
    assert saved.json()["status"] == "in_progress"
    assert saved.json()["notes"] == "Practiced branch and commit workflow."
    assert saved.json()["evidence_url"] == payload["evidence_url"]
    assert saved.json()["checked_steps"] == payload["checked_steps"]
    assert saved.json()["updated_at_utc"]
    assert client.get("/api/quests/git-workflow/work").json() == saved.json()
    assert database.get_progress()["total_xp"] == 0


def test_locked_or_missing_quest_work_is_rejected(client: TestClient) -> None:
    locked = client.put("/api/quests/first-pr/work", json={"notes": "try"})
    missing_get = client.get("/api/quests/missing/work")
    missing_put = client.put("/api/quests/missing/work", json={"notes": "try"})

    assert locked.status_code == 409
    assert missing_get.status_code == 404
    assert missing_put.status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"checked_steps": ["duplicate", "duplicate"]},
        {"checked_steps": [""]},
        {"evidence_url": "not a url"},
        {"unexpected": True},
    ],
)
def test_quest_work_rejects_invalid_payloads(
    client: TestClient, payload: dict[str, object]
) -> None:
    response = client.put("/api/quests/git-workflow/work", json=payload)

    assert response.status_code == 422
    assert client.get("/api/quests/git-workflow/work").json()["status"] == "not_started"


def test_concurrent_completion_only_awards_xp_once(client: TestClient) -> None:
    with ThreadPoolExecutor(max_workers=6) as executor:
        responses = list(
            executor.map(
                lambda _: client.post("/api/quests/git-workflow/complete"),
                range(6),
            )
        )

    assert sorted(response.status_code for response in responses) == [
        200,
        200,
        200,
        200,
        200,
        201,
    ]
    assert database.get_progress()["total_xp"] == 10
    assert len(database.list_xp_history()) == 1


def test_progress_and_xp_history_are_persistent_and_accurate(client: TestClient) -> None:
    client.post("/api/quests/git-workflow/complete")
    database.initialize_database()

    progress_response = client.get("/api/progress")
    history_response = client.get("/api/progress/xp-history")

    assert progress_response.status_code == 200
    assert progress_response.json() == {
        "total_xp": 10,
        "completed_quests": 1,
        "total_quests": 8,
    }
    history = history_response.json()["entries"]
    assert len(history) == 1
    assert history[0]["quest_id"] == "git-workflow"
    assert history[0]["points"] == 10


def test_failed_ledger_insert_rolls_back_completion(client: TestClient) -> None:
    with closing(database.get_connection()) as connection, connection:
        connection.execute(
            """
            CREATE TRIGGER reject_xp
            BEFORE INSERT ON xp_ledger
            BEGIN
                SELECT RAISE(ABORT, 'ledger unavailable');
            END
            """
        )

    response = client.post("/api/quests/git-workflow/complete")

    assert response.status_code == 500
    assert "ledger unavailable" not in response.text
    assert next(
        quest for quest in database.list_quests() if quest["id"] == "git-workflow"
    )["status"] == "current"
    assert database.get_progress()["completed_quests"] == 0
    assert database.get_progress()["total_xp"] == 0


def test_completion_uses_configured_timezone_for_activity_date(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("QUESTLINE_TIMEZONE", "Asia/Kolkata")
    timestamp = datetime(2026, 10, 21, 18, 45, tzinfo=UTC)

    result = database.complete_quest("git-workflow", now_utc=timestamp)

    assert result is not None
    assert result["completion"]["completed_at_utc"] == "2026-10-21T18:45:00+00:00"
    assert result["completion"]["local_date"] == "2026-10-22"


def test_streak_calculation_counts_unique_consecutive_days() -> None:
    result = database.calculate_streaks(
        ["2026-10-18", "2026-10-19", "2026-10-19", "2026-10-21"],
        date(2026, 10, 21),
    )

    assert result == {"current_streak": 1, "longest_streak": 2}


def test_missed_day_breaks_current_streak_but_retains_longest() -> None:
    result = database.calculate_streaks(
        ["2026-10-17", "2026-10-18", "2026-10-20"],
        date(2026, 10, 21),
    )

    assert result == {"current_streak": 1, "longest_streak": 2}


def test_streak_api_uses_local_activity_dates(client: TestClient) -> None:
    with closing(database.get_connection()) as connection, connection:
        connection.execute(
            """
            INSERT INTO quest_completions (id, quest_id, completed_at_utc, local_date, xp_awarded)
            VALUES ('completion-a', 'welcome', '2026-10-20T19:00:00+00:00', '2026-10-21', 10)
            """
        )
        connection.execute(
            """
            INSERT INTO xp_ledger (id, completion_id, quest_id, points, reason, awarded_at_utc)
            VALUES ('ledger-a', 'completion-a', 'welcome', 10, 'test completion',
                    '2026-10-20T19:00:00+00:00')
            """
        )

    response = client.get("/api/progress/streaks")

    assert response.status_code == 200
    assert response.json()["timezone"] == "Asia/Kolkata"
    assert response.json()["longest_streak"] == 1


def test_reward_mapping_uses_categories_and_safe_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("QUESTLINE_XP_LEARNING", raising=False)
    monkeypatch.delenv("QUESTLINE_XP_CODING", raising=False)
    monkeypatch.delenv("QUESTLINE_XP_MILESTONE", raising=False)

    assert database.get_xp_reward("Learn") == 10
    assert database.get_xp_reward("Explore") == 10
    assert database.get_xp_reward("Practice") == 25
    assert database.get_xp_reward("Build") == 25
    assert database.get_xp_reward("Milestone") == 150
    assert database.get_xp_reward("Uncategorized") == 10


def test_reward_values_can_be_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("QUESTLINE_XP_LEARNING", "12")
    monkeypatch.setenv("QUESTLINE_XP_CODING", "27")
    monkeypatch.setenv("QUESTLINE_XP_MILESTONE", "155")

    assert database.get_xp_reward("Learn") == 12
    assert database.get_xp_reward("Practice") == 27
    assert database.get_xp_reward("Milestone") == 155
