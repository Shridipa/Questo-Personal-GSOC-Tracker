from collections.abc import Iterator
from contextlib import closing
from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import UUID

import pytest
from backend.app import database
from backend.app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "planning-test.db")
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def review_payload(week_start: date | None = None) -> dict[str, str]:
    start = week_start or database.current_week_start()
    return {
        "week_start": start.isoformat(),
        "week_end": (start + timedelta(days=6)).isoformat(),
        "accomplishments": "Completed focused work.",
        "challenges": "Found a configuration issue.",
        "lessons_learned": "Small checks catch integration errors.",
        "next_priorities": "Finish and verify the feature.",
    }


def deadline_payload(due_date: date | None = None) -> dict[str, str | None]:
    return {
        "title": "Submit project notes",
        "description": "Review the final draft.",
        "due_date": (due_date or date.today() + timedelta(days=2)).isoformat(),
        "due_time": "17:30:00",
        "category": "Personal",
        "url": "https://example.com/notes",
    }


def test_weekly_review_create_current_list_and_get(client: TestClient) -> None:
    payload = review_payload()
    created = client.post("/api/reviews", json=payload)

    assert created.status_code == 201
    review = created.json()
    assert UUID(review["id"])
    assert review["week_start"] == payload["week_start"]
    assert review["week_end"] == payload["week_end"]
    assert review["accomplishments"] == payload["accomplishments"]
    assert review["created_at_utc"] == review["updated_at_utc"]
    assert client.get("/api/reviews/current").json()["review"]["id"] == review["id"]
    assert client.get("/api/reviews").json() == {"reviews": [review]}
    assert client.get(f"/api/reviews/{review['id']}").json() == review


def test_weekly_review_update_and_duplicate_week_conflict(client: TestClient) -> None:
    created = client.post("/api/reviews", json=review_payload()).json()
    payload = review_payload()
    payload["accomplishments"] = "Updated saved accomplishments."

    updated = client.put(f"/api/reviews/{created['id']}", json=payload)
    duplicate = client.post("/api/reviews", json=review_payload())

    assert updated.status_code == 200
    assert updated.json()["accomplishments"] == "Updated saved accomplishments."
    assert updated.json()["created_at_utc"] == created["created_at_utc"]
    assert updated.json()["updated_at_utc"] >= created["updated_at_utc"]
    assert duplicate.status_code == 409


@pytest.mark.parametrize(
    ("start", "end"),
    [
        ("2026-10-20", "2026-10-26"),
        ("2026-10-19", "2026-10-26"),
        ("not-a-date", "2026-10-25"),
    ],
)
def test_weekly_review_rejects_invalid_week_ranges(
    client: TestClient, start: str, end: str
) -> None:
    payload = review_payload()
    payload["week_start"] = start
    payload["week_end"] = end

    assert client.post("/api/reviews", json=payload).status_code == 422


def test_weekly_review_current_empty_and_missing_records(client: TestClient) -> None:
    assert client.get("/api/reviews/current").json()["review"] is None
    assert client.get("/api/reviews").json() == {"reviews": []}
    assert client.get("/api/reviews/00000000-0000-0000-0000-000000000001").status_code == 404
    assert (
        client.put(
            "/api/reviews/00000000-0000-0000-0000-000000000001",
            json=review_payload(),
        ).status_code
        == 404
    )
    assert client.get("/api/reviews/not-a-uuid").status_code == 422


def test_deadline_create_list_update_complete_and_delete(client: TestClient) -> None:
    created_response = client.post("/api/deadlines", json=deadline_payload())
    assert created_response.status_code == 201
    created = created_response.json()
    assert UUID(created["id"])
    assert created["status"] == "pending"
    assert created["classification"] == "upcoming"
    assert created["due_time"] == "17:30:00"
    assert client.get("/api/deadlines").json() == {"deadlines": [created]}

    payload = deadline_payload(date.today() - timedelta(days=1))
    payload["title"] = "Updated personal deadline"
    payload["status"] = "pending"
    updated = client.put(f"/api/deadlines/{created['id']}", json=payload)
    assert updated.status_code == 200
    assert updated.json()["title"] == "Updated personal deadline"
    assert updated.json()["classification"] == "overdue"

    completed = client.post(f"/api/deadlines/{created['id']}/complete")
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    assert completed.json()["classification"] == "completed"

    assert client.delete(f"/api/deadlines/{created['id']}").status_code == 204
    assert client.get("/api/deadlines").json() == {"deadlines": []}


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("due_date", "2026-02-30"),
        ("due_time", "26:15"),
        ("url", "javascript:alert(1)"),
        ("title", "   "),
        ("category", ""),
    ],
)
def test_deadline_rejects_invalid_values(
    client: TestClient, field: str, value: str
) -> None:
    payload = deadline_payload()
    payload[field] = value

    assert client.post("/api/deadlines", json=payload).status_code == 422


def test_deadline_missing_records_and_invalid_ids(client: TestClient) -> None:
    payload = deadline_payload()
    payload["status"] = "pending"
    missing_id = "00000000-0000-0000-0000-000000000001"

    assert client.put(f"/api/deadlines/{missing_id}", json=payload).status_code == 404
    assert client.post(f"/api/deadlines/{missing_id}/complete").status_code == 404
    assert client.delete(f"/api/deadlines/{missing_id}").status_code == 404
    assert client.put("/api/deadlines/not-a-uuid", json=payload).status_code == 422


def test_deadline_classification_and_review_persist_across_connections(
    client: TestClient,
) -> None:
    overdue = client.post(
        "/api/deadlines",
        json=deadline_payload(date.today() - timedelta(days=1)),
    ).json()
    upcoming_payload = deadline_payload(date.today())
    upcoming_payload["due_time"] = None
    upcoming = client.post("/api/deadlines", json=upcoming_payload).json()
    review = client.post("/api/reviews", json=review_payload()).json()

    assert overdue["classification"] == "overdue"
    assert upcoming["classification"] == "upcoming"
    with closing(database.get_connection()) as connection:
        assert connection.execute("SELECT COUNT(*) FROM deadlines").fetchone()[0] == 2
        assert connection.execute("SELECT COUNT(*) FROM weekly_reviews").fetchone()[0] == 1
    database.initialize_database()
    assert client.get(f"/api/reviews/{review['id']}").json()["id"] == review["id"]
    assert len(client.get("/api/deadlines").json()["deadlines"]) == 2


def test_timed_deadline_classification_uses_configured_local_time(
    client: TestClient,
) -> None:
    today = date.today()
    payload = deadline_payload(today)
    payload["due_time"] = "17:30:00"
    created = client.post("/api/deadlines", json=payload)
    assert created.status_code == 201

    timezone = database.get_configured_timezone()
    before_due = datetime.combine(today, time(17, 29), tzinfo=timezone)
    after_due = datetime.combine(today, time(17, 31), tzinfo=timezone)

    assert database.list_deadlines(now_local=before_due)[0]["classification"] == "upcoming"
    assert database.list_deadlines(now_local=after_due)[0]["classification"] == "overdue"


def test_new_tables_do_not_reset_existing_quest_progress(client: TestClient) -> None:
    assert client.post("/api/quests/git-workflow/complete").status_code == 201
    review = client.post("/api/reviews", json=review_payload())
    deadline = client.post("/api/deadlines", json=deadline_payload())

    database.initialize_database()

    assert client.get("/api/progress").json()["total_xp"] == 10
    assert next(
        quest
        for quest in client.get("/api/quests").json()["quests"]
        if quest["id"] == "git-workflow"
    )["status"] == "completed"
    assert client.get(f"/api/reviews/{review.json()['id']}").status_code == 200
    assert client.get("/api/deadlines").json()["deadlines"][0]["id"] == deadline.json()["id"]
