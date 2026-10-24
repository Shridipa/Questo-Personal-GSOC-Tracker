"""Comprehensive tests for the Repository-Specific Contribution Journeys API (Phase 3).

Covers:
- Journey creation, default seeds, and duplicate prevention (idempotence)
- User isolation and guest authentication boundaries
- Status lifecycle transitions and activity event recording
- Preparation checklist persistence and progress counts
- Structured investigation journal persistence
- Personal task management (create, toggle, delete)
- GitHub issue attachment, cross-repo validation, and detachment
- GitHub pull request linking, cross-repo validation, refresh sync, and unlinking
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import jwt
import pytest
from fastapi.testclient import TestClient

from backend.app import database, github_service
from backend.app.journeys_data import initialize_journey_tables
from backend.app.main import app

TEST_SECRET = "test-secret-key-for-journeys-unit-testing-only-12345"
USER_A_ID = "user-alice-111"
USER_B_ID = "user-bob-222"


def make_test_token(
    user_id: str,
    email: str = "test@example.com",
    secret: str = TEST_SECRET,
) -> str:
    exp = datetime.now(UTC) + timedelta(hours=1)
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "exp": int(exp.timestamp()),
        "role": "authenticated",
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    test_db = tmp_path / "questline-journeys-test.db"
    monkeypatch.setattr(database, "DATABASE_PATH", test_db)
    monkeypatch.setattr("backend.app.auth._SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr("backend.app.auth._SUPABASE_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr("backend.app.auth._get_jwks_client", lambda: None)

    database.initialize_database()
    initialize_journey_tables()
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def auth_headers_a() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_test_token(USER_A_ID, 'alice@example.com')}"}


@pytest.fixture
def auth_headers_b() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_test_token(USER_B_ID, 'bob@example.com')}"}


# ─── 1. Guest access and authentication boundaries ──────────────────────────────


def test_guest_access_to_journeys_is_rejected(client: TestClient) -> None:
    res = client.get("/api/journeys")
    assert res.status_code == 401

    res = client.post("/api/journeys", json={"repo_owner": "owner", "repo_name": "repo"})
    assert res.status_code == 401

    res = client.get("/api/journeys/some-id")
    assert res.status_code == 401


# ─── 2. Journey creation, seeding, and duplicate prevention ──────────────────────


def test_journey_creation_and_idempotency(client: TestClient, auth_headers_a: dict[str, str]) -> None:
    # 1. Start a new journey
    payload = {
        "repo_owner": "pallets",
        "repo_name": "flask",
        "org_slug": "pallets-eco",
        "title": "First Flask Contribution",
    }
    res = client.post("/api/journeys", json=payload, headers=auth_headers_a)
    assert res.status_code == 201
    data = res.json()
    journey_id = data["id"]

    assert data["repo_owner"] == "pallets"
    assert data["repo_name"] == "flask"
    assert data["repo_full_name"] == "pallets/flask"
    assert data["org_slug"] == "pallets-eco"
    assert data["title"] == "First Flask Contribution"
    assert data["status"] == "preparing"
    assert data["user_id"] == USER_A_ID

    # Checklist seeded with 10 standard items
    assert len(data["checklist"]) == 10
    assert data["checklist_completed_count"] == 0
    assert data["checklist_total_count"] == 10

    # Tasks seeded with 6 default items
    assert len(data["tasks"]) == 6
    assert data["tasks_completed_count"] == 0

    # Journal seeded empty
    assert data["journal"]["summary"] == ""
    assert data["journal"]["reproduction_steps"] == ""

    # Events seeded with quest_created
    assert any(ev["event_type"] == "quest_created" for ev in data["events"])

    # 2. Starting again for the exact same active repository returns the EXISTING journey (idempotent)
    res_repeat = client.post("/api/journeys", json=payload, headers=auth_headers_a)
    assert res_repeat.status_code == 200
    assert res_repeat.json()["id"] == journey_id

    # Verify only 1 journey is returned in list
    list_res = client.get("/api/journeys", headers=auth_headers_a)
    assert list_res.status_code == 200
    assert len(list_res.json()["journeys"]) == 1


# ─── 3. User isolation ─────────────────────────────────────────────────────────


def test_journey_user_isolation(
    client: TestClient, auth_headers_a: dict[str, str], auth_headers_b: dict[str, str]
) -> None:
    # Alice creates a journey
    res = client.post(
        "/api/journeys",
        json={"repo_owner": "psf", "repo_name": "requests"},
        headers=auth_headers_a,
    )
    assert res.status_code == 201
    alice_journey_id = res.json()["id"]

    # Bob lists journeys -> Bob sees none
    bob_list = client.get("/api/journeys", headers=auth_headers_b)
    assert bob_list.status_code == 200
    assert len(bob_list.json()["journeys"]) == 0

    # Bob attempts to fetch Alice's journey by ID -> 404 Not Found
    bob_fetch = client.get(f"/api/journeys/{alice_journey_id}", headers=auth_headers_b)
    assert bob_fetch.status_code == 404

    # Bob attempts to mutate Alice's journey status -> 404 Not Found
    bob_mutate = client.patch(
        f"/api/journeys/{alice_journey_id}/status",
        json={"status": "in_progress"},
        headers=auth_headers_b,
    )
    assert bob_mutate.status_code == 404

    # Bob can create his own independent journey for the same repository
    bob_res = client.post(
        "/api/journeys",
        json={"repo_owner": "psf", "repo_name": "requests"},
        headers=auth_headers_b,
    )
    assert bob_res.status_code == 201
    bob_journey_id = bob_res.json()["id"]
    assert bob_journey_id != alice_journey_id


# ─── 4. Status lifecycle transitions ──────────────────────────────────────────


def test_status_lifecycle_and_events(client: TestClient, auth_headers_a: dict[str, str]) -> None:
    res = client.post(
        "/api/journeys",
        json={"repo_owner": "django", "repo_name": "django"},
        headers=auth_headers_a,
    )
    journey_id = res.json()["id"]

    # Test transitioning through multiple lifecycle states
    transitions = [
        ("issue_selected", "Found good first issue"),
        ("in_progress", "Started working on branch"),
        ("pr_open", "Submitted pull request #42"),
        ("changes_requested", "Reviewer asked for unit tests"),
        ("paused", "Taking a break for exams"),
        ("in_progress", "Resumed work"),
        ("merged", "PR was merged into main"),
    ]

    for next_status, note in transitions:
        patch_res = client.patch(
            f"/api/journeys/{journey_id}/status",
            json={"status": next_status, "note": note},
            headers=auth_headers_a,
        )
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["status"] == next_status

    # Check that events recorded each status change
    detail = client.get(f"/api/journeys/{journey_id}", headers=auth_headers_a).json()
    status_events = [ev for ev in detail["events"] if ev["event_type"] == "status_changed"]
    assert len(status_events) == len(transitions)

    # Invalid status should return 422
    invalid_res = client.patch(
        f"/api/journeys/{journey_id}/status",
        json={"status": "non_existent_status"},
        headers=auth_headers_a,
    )
    assert invalid_res.status_code == 422


# ─── 5. Preparation checklist persistence ─────────────────────────────────────


def test_checklist_updates_and_counts(client: TestClient, auth_headers_a: dict[str, str]) -> None:
    res = client.post(
        "/api/journeys",
        json={"repo_owner": "encode", "repo_name": "httpx"},
        headers=auth_headers_a,
    )
    journey_id = res.json()["id"]

    # Mark dev env as completed with notes
    put_item = client.put(
        f"/api/journeys/{journey_id}/checklist/environment",
        json={"completed": True, "notes": "Used venv and pytest"},
        headers=auth_headers_a,
    )
    assert put_item.status_code == 200
    data = put_item.json()
    assert data["checklist_completed_count"] == 1

    item = next(i for i in data["checklist"] if i["item_key"] == "environment")
    assert item["completed"] is True
    assert item["notes"] == "Used venv and pytest"
    assert item["completed_at_utc"] is not None

    # Test invalid item key -> 404
    bad_key = client.put(
        f"/api/journeys/{journey_id}/checklist/invalid_key",
        json={"completed": True, "notes": ""},
        headers=auth_headers_a,
    )
    assert bad_key.status_code == 404


# ─── 6. Investigation journal persistence ─────────────────────────────────────


def test_investigation_journal_round_trip(
    client: TestClient, auth_headers_a: dict[str, str]
) -> None:
    res = client.post(
        "/api/journeys",
        json={"repo_owner": "encode", "repo_name": "starlette"},
        headers=auth_headers_a,
    )
    journey_id = res.json()["id"]

    journal_payload = {
        "summary": "Fix async timeout propagation",
        "reproduction_steps": "1. Run server 2. Send slow request",
        "expected_vs_actual": "Expected 504, got hanging socket",
        "relevant_files": "starlette/middleware/timeout.py",
        "potential_causes": "Asyncio cancellation shield missing",
        "proposed_solution": "Wrap task in wait_for with timeout handler",
        "tests_to_run": "pytest tests/test_timeout.py",
        "questions_for_maintainers": "Should this raise custom HTTPException?",
        "lessons_learned": "Async context managers handle cleanup properly",
    }

    put_res = client.put(
        f"/api/journeys/{journey_id}/journal",
        json=journal_payload,
        headers=auth_headers_a,
    )
    assert put_res.status_code == 200
    saved = put_res.json()["journal"]
    for k, v in journal_payload.items():
        assert saved[k] == v
    assert saved["updated_at_utc"] is not None

    # Verify journal persists on fresh GET
    fresh = client.get(f"/api/journeys/{journey_id}", headers=auth_headers_a).json()
    for k, v in journal_payload.items():
        assert fresh["journal"][k] == v


# ─── 7. Personal tasks CRUD ───────────────────────────────────────────────────


def test_personal_tasks_management(client: TestClient, auth_headers_a: dict[str, str]) -> None:
    res = client.post(
        "/api/journeys",
        json={"repo_owner": "astral-sh", "repo_name": "uv"},
        headers=auth_headers_a,
    )
    journey_id = res.json()["id"]
    initial_tasks_count = len(res.json()["tasks"])

    # 1. Create a personal task
    add_res = client.post(
        f"/api/journeys/{journey_id}/tasks",
        json={"title": "Write reproducible benchmark"},
        headers=auth_headers_a,
    )
    assert add_res.status_code == 201
    tasks = add_res.json()["tasks"]
    assert len(tasks) == initial_tasks_count + 1
    new_task = next(t for t in tasks if t["title"] == "Write reproducible benchmark")
    task_id = new_task["id"]
    assert new_task["completed"] is False

    # 2. Toggle completion
    patch_res = client.patch(
        f"/api/journeys/{journey_id}/tasks/{task_id}",
        json={"completed": True},
        headers=auth_headers_a,
    )
    assert patch_res.status_code == 200
    updated_task = next(t for t in patch_res.json()["tasks"] if t["id"] == task_id)
    assert updated_task["completed"] is True
    assert patch_res.json()["tasks_completed_count"] == 1

    # 3. Delete task
    del_res = client.delete(
        f"/api/journeys/{journey_id}/tasks/{task_id}",
        headers=auth_headers_a,
    )
    assert del_res.status_code == 200
    remaining_tasks = del_res.json()["tasks"]
    assert not any(t["id"] == task_id for t in remaining_tasks)


# ─── 8. GitHub issue attachment & validation ──────────────────────────────────


def test_issue_attachment_validation_and_detachment(
    client: TestClient, auth_headers_a: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    res = client.post(
        "/api/journeys",
        json={"repo_owner": "pytest-dev", "repo_name": "pytest"},
        headers=auth_headers_a,
    )
    journey_id = res.json()["id"]

    # 1. Attaching an issue from a DIFFERENT repository should be rejected with 400 Bad Request
    cross_repo_res = client.put(
        f"/api/journeys/{journey_id}/issue",
        json={"issue_url": "https://github.com/torvalds/linux/issues/123"},
        headers=auth_headers_a,
    )
    assert cross_repo_res.status_code == 400
    assert "does not match this journey's repository" in cross_repo_res.json()["detail"]

    # 2. Mock GitHub service for valid issue
    fake_issue = {
        "number": 999,
        "title": "Fix fixture teardown ordering bug",
        "url": "https://github.com/pytest-dev/pytest/issues/999",
        "state": "open",
        "created_at": "2026-01-10T10:00:00Z",
        "updated_at": "2026-01-11T12:00:00Z",
        "labels": ["bug", "fixtures"],
        "comments": 4,
        "assignees": [],
    }
    monkeypatch.setattr(
        github_service,
        "fetch_single_issue",
        lambda owner, repo, num: fake_issue,
    )

    # Attach issue by number
    attach_res = client.put(
        f"/api/journeys/{journey_id}/issue",
        json={"issue_number": 999},
        headers=auth_headers_a,
    )
    assert attach_res.status_code == 200
    detail = attach_res.json()
    assert detail["issue_number"] == 999
    assert detail["issue_title"] == "Fix fixture teardown ordering bug"
    assert detail["issue_labels"] == ["bug", "fixtures"]
    # Attaching issue advances status from 'preparing' to 'issue_selected'
    assert detail["status"] == "issue_selected"

    # Detach issue
    detach_res = client.delete(f"/api/journeys/{journey_id}/issue", headers=auth_headers_a)
    assert detach_res.status_code == 200
    detached_detail = detach_res.json()
    assert detached_detail["issue_number"] is None
    assert detached_detail["issue_title"] is None


# ─── 9. GitHub pull request linking, sync, and unlinking ───────────────────────


def test_pr_linking_sync_and_unlinking(
    client: TestClient, auth_headers_a: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    res = client.post(
        "/api/journeys",
        json={"repo_owner": "python", "repo_name": "cpython"},
        headers=auth_headers_a,
    )
    journey_id = res.json()["id"]

    # 1. Cross-repo PR URL rejected with 400
    cross_pr_res = client.put(
        f"/api/journeys/{journey_id}/pr",
        json={"pr_url": "https://github.com/golang/go/pull/555"},
        headers=auth_headers_a,
    )
    assert cross_pr_res.status_code == 400
    assert "does not match this journey's repository" in cross_pr_res.json()["detail"]

    # 2. Mock valid PR
    pr_state: dict[str, Any] = {
        "number": 1234,
        "title": "Improve garbage collection traversal speed",
        "url": "https://github.com/python/cpython/pull/1234",
        "state": "open",
        "is_draft": False,
        "is_merged": False,
        "merged_at": None,
        "closed_at": None,
        "created_at": "2026-02-01T08:00:00Z",
        "updated_at": "2026-02-02T10:00:00Z",
    }
    monkeypatch.setattr(
        github_service,
        "fetch_single_pull_request",
        lambda owner, repo, num: pr_state,
    )

    # Link PR by number
    link_res = client.put(
        f"/api/journeys/{journey_id}/pr",
        json={"pr_number": 1234},
        headers=auth_headers_a,
    )
    assert link_res.status_code == 200
    detail = link_res.json()
    assert detail["pr_number"] == 1234
    assert detail["pr_title"] == "Improve garbage collection traversal speed"
    assert detail["pr_state"] == "open"
    # Linking PR advances status to 'pr_open'
    assert detail["status"] == "pr_open"

    # Refresh PR after state changes on GitHub
    pr_state["state"] = "merged"
    pr_state["is_merged"] = True
    pr_state["merged_at"] = "2026-02-03T12:00:00Z"

    refresh_res = client.post(
        f"/api/journeys/{journey_id}/pr/refresh",
        headers=auth_headers_a,
    )
    assert refresh_res.status_code == 200
    refreshed = refresh_res.json()
    assert refreshed["pr_state"] == "merged"
    assert refreshed["status"] == "merged"

    # Unlink PR
    unlink_res = client.delete(f"/api/journeys/{journey_id}/pr", headers=auth_headers_a)
    assert unlink_res.status_code == 200
    unlinked = unlink_res.json()
    assert unlinked["pr_number"] is None
    assert unlinked["pr_title"] is None
