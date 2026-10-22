from collections.abc import Iterator
from contextlib import closing
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from backend.app import database
from backend.app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "questline-phase6.db")
    monkeypatch.setenv("QUESTLINE_TIMEZONE", "Asia/Kolkata")
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def settings_payload(**overrides: object) -> dict[str, object]:
    return {
        "daily_goal_minutes": 60,
        "timezone": "Asia/Tokyo",
        "reminders_enabled": False,
        "celebrations_enabled": True,
        **overrides,
    }


def test_settings_defaults_are_returned_without_inserting_a_record(
    client: TestClient,
) -> None:
    response = client.get("/api/settings")

    assert response.status_code == 200
    assert response.json() == {
        "daily_goal_minutes": 45,
        "timezone": "Asia/Kolkata",
        "reminders_enabled": True,
        "celebrations_enabled": True,
        "updated_at_utc": None,
    }
    with closing(database.get_connection()) as connection:
        assert connection.execute("SELECT COUNT(*) FROM user_settings").fetchone()[0] == 0


def test_settings_update_persists_complete_validated_representation(
    client: TestClient,
) -> None:
    saved = client.put("/api/settings", json=settings_payload())

    assert saved.status_code == 200
    assert saved.json()["daily_goal_minutes"] == 60
    assert saved.json()["timezone"] == "Asia/Tokyo"
    assert saved.json()["reminders_enabled"] is False
    assert saved.json()["celebrations_enabled"] is True
    assert saved.json()["updated_at_utc"]
    assert client.get("/api/settings").json() == saved.json()
    assert database.get_configured_timezone().key == "Asia/Tokyo"


@pytest.mark.parametrize(
    "payload",
    [
        settings_payload(timezone="Not/A_Real_Zone"),
        settings_payload(daily_goal_minutes=0),
        settings_payload(daily_goal_minutes=45.5),
        settings_payload(unrecognized=True),
        {
            "daily_goal_minutes": 45,
            "timezone": "Asia/Kolkata",
            "reminders_enabled": True,
        },
    ],
)
def test_settings_reject_invalid_or_incomplete_values(
    client: TestClient, payload: dict[str, object]
) -> None:
    response = client.put("/api/settings", json=payload)

    assert response.status_code == 422


def test_settings_initialization_preserves_saved_preferences_and_progress(
    client: TestClient,
) -> None:
    assert client.post("/api/quests/git-workflow/complete").status_code == 201
    saved = client.put("/api/settings", json=settings_payload())

    database.initialize_database()
    database.initialize_database()

    assert client.get("/api/settings").json() == saved.json()
    assert client.get("/api/progress").json()["total_xp"] == 10
    assert next(
        quest
        for quest in client.get("/api/quests").json()["quests"]
        if quest["id"] == "git-workflow"
    )["status"] == "completed"


def test_saved_timezone_applies_to_future_completions_without_rewriting_history(
    client: TestClient,
) -> None:
    client.put("/api/settings", json=settings_payload(timezone="Asia/Tokyo"))
    completion_time = datetime(2026, 10, 21, 18, 45, tzinfo=UTC)

    result = database.complete_quest("git-workflow", now_utc=completion_time)

    assert result is not None
    assert result["completion"]["local_date"] == "2026-10-22"
    assert database.get_streaks(now_utc=completion_time)["timezone"] == "Asia/Tokyo"
    assert database.get_activity_history(1, today=date(2026, 10, 22))["days"][0][
        "date"
    ] == "2026-10-22"


def test_changing_timezone_preserves_previously_recorded_activity_date(
    client: TestClient,
) -> None:
    completion_time = datetime(2026, 10, 21, 18, 45, tzinfo=UTC)
    result = database.complete_quest("git-workflow", now_utc=completion_time)
    assert result is not None
    assert result["completion"]["local_date"] == "2026-10-22"

    response = client.put(
        "/api/settings",
        json=settings_payload(timezone="America/Los_Angeles"),
    )

    assert response.status_code == 200
    with closing(database.get_connection()) as connection:
        row = connection.execute(
            "SELECT local_date FROM quest_completions WHERE quest_id = ?",
            ("git-workflow",),
        ).fetchone()
    assert row["local_date"] == "2026-10-22"


def test_activity_dates_remain_correct_across_daylight_saving_fallback(
    client: TestClient,
) -> None:
    client.put("/api/settings", json=settings_payload(timezone="Europe/London"))
    before_fallback = datetime(2026, 10, 25, 0, 30, tzinfo=UTC)
    after_fallback = datetime(2026, 10, 25, 1, 30, tzinfo=UTC)

    assert before_fallback.astimezone(database.get_configured_timezone()).utcoffset() != (
        after_fallback.astimezone(database.get_configured_timezone()).utcoffset()
    )
    assert database.complete_quest("git-workflow", now_utc=before_fallback) is not None
    assert database.complete_quest("welcome", now_utc=after_fallback) is not None

    history = database.get_activity_history(1, today=date(2026, 10, 25))

    assert history["days"] == [
        {
            "date": "2026-10-25",
            "quests_completed": 2,
            "xp_earned": 20,
            "has_activity": True,
        }
    ]


def test_empty_activity_history_is_zero_filled_and_read_only(
    client: TestClient,
) -> None:
    before = database.get_progress()
    response = client.get("/api/progress/activity?days=7")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["days"]) == 7
    assert payload["days"][-1]["date"] == payload["end_date"]
    assert all(
        day["quests_completed"] == 0
        and day["xp_earned"] == 0
        and day["has_activity"] is False
        for day in payload["days"]
    )
    assert payload["totals"] == {
        "quests_completed": 0,
        "xp_earned": 0,
        "active_days": 0,
    }
    assert database.get_progress() == before
    assert client.get("/api/progress/activity?days=0").status_code == 422
    assert client.get("/api/progress/activity?days=367").status_code == 422


def test_activity_history_reconciles_completions_and_ledger_by_recorded_local_date(
    client: TestClient,
) -> None:
    client.put("/api/settings", json=settings_payload(timezone="Asia/Kolkata"))
    completions = [
        ("git-workflow", datetime(2026, 10, 20, 18, 45, tzinfo=UTC)),
        ("welcome", datetime(2026, 10, 20, 19, 30, tzinfo=UTC)),
        ("merge-conflict", datetime(2026, 10, 21, 19, 0, tzinfo=UTC)),
    ]
    for quest_id, completed_at in completions:
        assert database.complete_quest(quest_id, now_utc=completed_at) is not None

    history = database.get_activity_history(3, today=date(2026, 10, 23))

    assert history["start_date"] == "2026-10-21"
    assert history["end_date"] == "2026-10-23"
    assert history["timezone"] == "Asia/Kolkata"
    assert history["days"] == [
        {
            "date": "2026-10-21",
            "quests_completed": 2,
            "xp_earned": 20,
            "has_activity": True,
        },
        {
            "date": "2026-10-22",
            "quests_completed": 1,
            "xp_earned": 25,
            "has_activity": True,
        },
        {
            "date": "2026-10-23",
            "quests_completed": 0,
            "xp_earned": 0,
            "has_activity": False,
        },
    ]
    assert history["totals"] == {
        "quests_completed": 3,
        "xp_earned": 45,
        "active_days": 2,
    }
    assert database.get_progress()["completed_quests"] == 3
    assert database.get_progress()["total_xp"] == 45


def test_activity_endpoint_returns_bounded_ordered_contract(client: TestClient) -> None:
    response = client.get("/api/progress/activity?days=1")

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"start_date", "end_date", "timezone", "days", "totals"}
    assert len(payload["days"]) == 1
    assert payload["days"][0]["date"] == payload["start_date"] == payload["end_date"]
    assert set(payload["days"][0]) == {
        "date",
        "quests_completed",
        "xp_earned",
        "has_activity",
    }
