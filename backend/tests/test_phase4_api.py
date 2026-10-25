"""Tests for Phase 4: PR Review Intelligence and Contributor Portfolio.

Covers:
- PR review sync (reviews + review comments) with feedback mirroring
- Personal tracking state preserved across re-syncs; GitHub fields refreshed
- Failed refresh preserves cached review data
- Ownership: users cannot sync, read, or update another user's feedback
- Timeline derived only from real GitHub timestamps
- Outcome accuracy: merged only when GitHub reports merged; closed-unmerged
  never counted as merged; no-PR journeys never presented as merged
- Portfolio filters (status, search) and bounded pagination
- Journal skills_practiced persistence and surfacing in the portfolio
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import jwt
import pytest
from fastapi.testclient import TestClient

from backend.app import database, github_service
from backend.app.http_client import RateLimitError
from backend.app.journeys_data import initialize_journey_tables
from backend.app.main import app

TEST_SECRET = "test-secret-key-for-phase4-unit-testing-only-12345"
USER_A_ID = "user-alice-111"
USER_B_ID = "user-bob-222"


def make_test_token(user_id: str, email: str = "test@example.com") -> str:
    exp = datetime.now(UTC) + timedelta(hours=1)
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "exp": int(exp.timestamp()),
        "role": "authenticated",
    }
    return jwt.encode(payload, TEST_SECRET, algorithm="HS256")


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    test_db = tmp_path / "questline-phase4-test.db"
    monkeypatch.setattr(database, "DATABASE_PATH", test_db)
    monkeypatch.setattr("backend.app.auth._SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr("backend.app.auth._SUPABASE_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr("backend.app.auth._get_jwks_client", lambda: None)
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)

    database.initialize_database()
    initialize_journey_tables()
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def headers_a() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_test_token(USER_A_ID, 'alice@example.com')}"}


@pytest.fixture
def headers_b() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_test_token(USER_B_ID, 'bob@example.com')}"}


def _fake_pr_info(**overrides: Any) -> dict[str, Any]:
    base = {
        "number": 101,
        "title": "Fix: division by zero in cron parser",
        "url": "https://github.com/pallets/flask/pull/101",
        "state": "open",
        "is_draft": False,
        "is_merged": False,
        "merged_at": None,
        "closed_at": None,
        "created_at": "2026-10-24T08:00:00Z",
        "updated_at": "2026-10-24T09:00:00Z",
    }
    base.update(overrides)
    return base


def _fake_reviews(**overrides: Any) -> list[dict[str, Any]]:
    review = {
        "node_id": "R_review_1",
        "gh_state": "CHANGES_REQUESTED",
        "author": "maintainer-mona",
        "body_excerpt": "Please handle the None branch before parsing.",
        "html_url": "https://github.com/pallets/flask/pull/101/files#r1",
        "submitted_at": "2026-10-24T10:00:00Z",
    }
    review.update(overrides)
    return [review]


def _fake_comments(**overrides: Any) -> list[dict[str, Any]]:
    comment = {
        "node_id": "RC_comment_1",
        "gh_state": "COMMENTED",
        "author": "maintainer-mona",
        "body_excerpt": "This loop re-reads the file per row — hoist it out.",
        "html_url": "https://github.com/pallets/flask/pull/101#discussion_r9",
        "submitted_at": "2026-10-24T10:30:00Z",
    }
    comment.update(overrides)
    return [comment]


def _link_pr(
    client: TestClient,
    headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    pr_info: dict[str, Any],
    journey_id: str,
) -> None:
    monkeypatch.setattr(github_service, "fetch_single_pull_request", lambda *a, **k: pr_info)
    res = client.put(
        f"/api/journeys/{journey_id}/pr",
        json={"pr_number": pr_info["number"]},
        headers=headers,
    )
    assert res.status_code == 200


def _create_journey(client: TestClient, headers: dict[str, str], owner: str, repo: str) -> str:
    res = client.post(
        "/api/journeys",
        json={"repo_owner": owner, "repo_name": repo},
        headers=headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


# ─── Authentication boundaries ─────────────────────────────────────────────────


def test_guest_cannot_access_review_and_portfolio_routes(client: TestClient) -> None:
    assert client.get("/api/portfolio").status_code == 401
    assert client.post("/api/journeys/x/pr/reviews/refresh").status_code == 401
    assert client.patch("/api/journeys/x/pr/feedback/y", json={}).status_code == 401


# ─── Review sync and feedback mirroring ────────────────────────────────────────


def test_review_sync_caches_data_and_mirrors_feedback(
    client: TestClient,
    headers_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journey_id = _create_journey(client, headers_a, "pallets", "flask")
    _link_pr(client, headers_a, monkeypatch, _fake_pr_info(), journey_id)

    monkeypatch.setattr(
        github_service, "fetch_pull_request_reviews", lambda *a, **k: _fake_reviews()
    )
    monkeypatch.setattr(
        github_service, "fetch_pull_request_review_comments", lambda *a, **k: _fake_comments()
    )

    res = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_a)
    assert res.status_code == 200
    data = res.json()

    # Both reviews are cached verbatim, states unchanged from GitHub.
    assert len(data["pr_reviews"]) == 1
    assert data["pr_reviews"][0]["gh_state"] == "CHANGES_REQUESTED"
    assert data["pr_reviews"][0]["author"] == "maintainer-mona"
    assert data["pr_review_synced_at_utc"] is not None

    # One review (changes requested) + one review comment become feedback items.
    assert len(data["pr_feedback"]) == 2
    source_types = {item["source_type"] for item in data["pr_feedback"]}
    assert source_types == {"review", "review_comment"}
    assert all(item["tracking_state"] == "open" for item in data["pr_feedback"])

    # Timeline contains only GitHub-timestamped events, in order.
    kinds = [event["kind"] for event in data["pr_timeline"]]
    assert kinds.index("pr_opened") < kinds.index("changes_requested")
    assert "pr_merged" not in kinds

    # Journey status is untouched by review data (changelog stays explicit).
    assert data["status"] == "pr_open"


def test_resync_updates_github_fields_and_preserves_tracking_state(
    client: TestClient,
    headers_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journey_id = _create_journey(client, headers_a, "pallets", "flask")
    _link_pr(client, headers_a, monkeypatch, _fake_pr_info(), journey_id)

    monkeypatch.setattr(
        github_service, "fetch_pull_request_reviews", lambda *a, **k: _fake_reviews()
    )
    monkeypatch.setattr(
        github_service, "fetch_pull_request_review_comments", lambda *a, **k: _fake_comments()
    )
    res = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_a)
    feedback_id = next(
        item["id"]
        for item in res.json()["pr_feedback"]
        if item["gh_node_id"] == "R_review_1"
    )

    # Owner marks the item addressed with a response note.
    patch = client.patch(
        f"/api/journeys/{journey_id}/pr/feedback/{feedback_id}",
        json={"tracking_state": "addressed", "response_notes": "Fixed in commit abc123."},
        headers=headers_a,
    )
    assert patch.status_code == 200
    patched_item = next(
        item for item in patch.json()["pr_feedback"] if item["id"] == feedback_id
    )
    assert patched_item["tracking_state"] == "addressed"
    assert patched_item["response_notes"] == "Fixed in commit abc123."

    # GitHub-side content is edited; re-sync must refresh GitHub fields but keep tracking.
    monkeypatch.setattr(
        github_service,
        "fetch_pull_request_reviews",
        lambda *a, **k: _fake_reviews(body_excerpt="Updated: please also add a test."),
    )
    res = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_a)
    assert res.status_code == 200
    items = res.json()["pr_feedback"]
    assert len(items) == 2  # no duplicate rows for the same GitHub node_id
    refreshed = next(item for item in items if item["gh_node_id"] == "R_review_1")
    assert refreshed["body_excerpt"] == "Updated: please also add a test."
    assert refreshed["tracking_state"] == "addressed"
    assert refreshed["response_notes"] == "Fixed in commit abc123."


def test_approved_review_is_not_inferrable_as_changes_requested(
    client: TestClient,
    headers_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journey_id = _create_journey(client, headers_a, "pallets", "flask")
    _link_pr(client, headers_a, monkeypatch, _fake_pr_info(), journey_id)

    monkeypatch.setattr(
        github_service,
        "fetch_pull_request_reviews",
        lambda *a, **k: _fake_reviews(gh_state="APPROVED", node_id="R_review_1"),
    )
    monkeypatch.setattr(
        github_service, "fetch_pull_request_review_comments", lambda *a, **k: []
    )
    res = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_a)
    data = res.json()

    # An approval is shown as an approval, never as change requests or open feedback work.
    assert data["pr_reviews"][0]["gh_state"] == "APPROVED"
    assert data["pr_feedback"] == []
    kinds = [event["kind"] for event in data["pr_timeline"]]
    assert "approved" in kinds
    assert "changes_requested" not in kinds


# ─── Failure handling: cache preservation ───────────────────────────────────────


def test_failed_refresh_preserves_cached_review_data(
    client: TestClient,
    headers_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journey_id = _create_journey(client, headers_a, "pallets", "flask")
    _link_pr(client, headers_a, monkeypatch, _fake_pr_info(), journey_id)

    monkeypatch.setattr(
        github_service, "fetch_pull_request_reviews", lambda *a, **k: _fake_reviews()
    )
    monkeypatch.setattr(
        github_service, "fetch_pull_request_review_comments", lambda *a, **k: _fake_comments()
    )
    first = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_a)
    assert first.status_code == 200
    cached_at = first.json()["pr_review_synced_at_utc"]
    cached_reviews = first.json()["pr_reviews"]

    # Rate limit hit on the reviews call — nothing may overwrite the cache.
    def raise_rate_limit(*args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        raise RateLimitError("GitHub rate limit exceeded.", retry_after_seconds=60)

    monkeypatch.setattr(
        github_service, "fetch_pull_request_reviews", raise_rate_limit
    )
    second = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_a)
    assert second.status_code == 429

    refreshed = client.get(f"/api/journeys/{journey_id}", headers=headers_a).json()
    assert refreshed["pr_review_synced_at_utc"] == cached_at
    assert refreshed["pr_reviews"] == cached_reviews
    assert len(refreshed["pr_feedback"]) == 2


def test_review_sync_without_linked_pr_returns_400(
    client: TestClient, headers_a: dict[str, str]
) -> None:
    journey_id = _create_journey(client, headers_a, "pallets", "flask")
    res = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_a)
    assert res.status_code == 400
    assert "No pull request is linked" in res.json()["detail"]


# ─── Ownership and validation ──────────────────────────────────────────────────


def test_other_user_cannot_sync_or_update_feedback(
    client: TestClient,
    headers_a: dict[str, str],
    headers_b: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journey_id = _create_journey(client, headers_a, "pallets", "flask")
    _link_pr(client, headers_a, monkeypatch, _fake_pr_info(), journey_id)
    monkeypatch.setattr(
        github_service, "fetch_pull_request_reviews", lambda *a, **k: _fake_reviews()
    )
    monkeypatch.setattr(
        github_service, "fetch_pull_request_review_comments", lambda *a, **k: _fake_comments()
    )
    res = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_a)
    feedback_id = res.json()["pr_feedback"][0]["id"]

    # User B sees no journey at all.
    assert client.get(f"/api/journeys/{journey_id}", headers=headers_b).status_code == 404
    # User B cannot sync reviews or mutate feedback.
    sync_res = client.post(f"/api/journeys/{journey_id}/pr/reviews/refresh", headers=headers_b)
    assert sync_res.status_code == 404
    patch_res = client.patch(
        f"/api/journeys/{journey_id}/pr/feedback/{feedback_id}",
        json={"tracking_state": "addressed"},
        headers=headers_b,
    )
    assert patch_res.status_code == 404

    # Invalid tracking state is rejected.
    patch_res = client.patch(
        f"/api/journeys/{journey_id}/pr/feedback/{feedback_id}",
        json={"tracking_state": "approved"},
        headers=headers_a,
    )
    assert patch_res.status_code == 422

    # Unknown feedback id for the rightful owner is 404.
    assert (
        client.patch(
            f"/api/journeys/{journey_id}/pr/feedback/does-not-exist",
            json={"tracking_state": "open"},
            headers=headers_a,
        ).status_code
        == 404
    )


# ─── Portfolio: accurate outcomes, filters, pagination ─────────────────────────


def _seed_portfolio(
    client: TestClient,
    headers_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, str]:
    ids: dict[str, str] = {}
    for owner, repo in (("django", "django"), ("encode", "httpx"), ("encode", "starlette")):
        ids[repo] = _create_journey(client, headers_a, owner, repo)

    merged = _fake_pr_info(
        number=101, state="merged", is_merged=True, merged_at="2026-10-23T12:00:00Z"
    )
    closed = _fake_pr_info(
        number=202, state="closed", is_merged=False, closed_at="2026-10-23T15:00:00Z"
    )
    _link_pr(client, headers_a, monkeypatch, merged, ids["httpx"])
    _link_pr(client, headers_a, monkeypatch, closed, ids["starlette"])

    # Document reflections on the merged journey.
    res = client.put(
        f"/api/journeys/{ids['httpx']}/journal",
        json={
            "lessons_learned": "Always parse dates with explicit UTC.",
            "skills_practiced": "pytest, httpx internals, ORM cursors",
        },
        headers=headers_a,
    )
    assert res.status_code == 200
    return ids


def test_portfolio_outcome_accuracy(
    client: TestClient,
    headers_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    headers_b: dict[str, str],
) -> None:
    ids = _seed_portfolio(client, headers_a, monkeypatch)

    res = client.get("/api/portfolio", headers=headers_a)
    assert res.status_code == 200
    entries = {entry["id"]: entry for entry in res.json()["entries"]}

    merged_entry = entries[ids["httpx"]]
    assert merged_entry["pr_outcome"] == "merged"
    assert merged_entry["pr_complete"] is True
    assert merged_entry["completed_at_utc"] == "2026-10-23T12:00:00Z"
    assert merged_entry["lessons_learned"] == "Always parse dates with explicit UTC."
    assert merged_entry["skills_practiced"] == "pytest, httpx internals, ORM cursors"

    closed_entry = entries[ids["starlette"]]
    # A closed-but-unmerged PR must never be presented as a merged contribution.
    assert closed_entry["pr_outcome"] == "closed_unmerged"
    assert closed_entry["pr_complete"] is False
    assert closed_entry["completed_at_utc"] is None

    no_pr_entry = entries[ids["django"]]
    assert no_pr_entry["pr_outcome"] == "no_pr"
    assert no_pr_entry["pr_complete"] is False

    # User B's portfolio stays empty — journeys are owned and isolated.
    res_b = client.get("/api/portfolio", headers=headers_b)
    assert res_b.status_code == 200
    assert res_b.json()["total"] == 0


def test_portfolio_filters_and_pagination(
    client: TestClient,
    headers_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_portfolio(client, headers_a, monkeypatch)

    # Status filter
    res = client.get("/api/portfolio?status=merged", headers=headers_a)
    assert res.status_code == 200
    payload = res.json()
    assert payload["total"] == 1
    assert all(entry["pr_outcome"] == "merged" for entry in payload["entries"])
    assert len(payload["entries"]) == 1

    # Search by repository fragment
    res = client.get("/api/portfolio?search=encode", headers=headers_a)
    assert res.json()["total"] == 2

    res = client.get("/api/portfolio?search=pallets", headers=headers_a)
    assert res.json()["total"] == 0

    # Bounded pagination
    res = client.get("/api/portfolio?limit=2&offset=0", headers=headers_a)
    payload = res.json()
    assert payload["total"] == 3
    assert len(payload["entries"]) == 2
    assert payload["limit"] == 2 and payload["offset"] == 0

    res = client.get("/api/portfolio?limit=2&offset=2", headers=headers_a)
    assert len(res.json()["entries"]) == 1

    # Pagination bounds are validated
    assert client.get("/api/portfolio?limit=0", headers=headers_a).status_code == 422
    assert client.get("/api/portfolio?limit=500", headers=headers_a).status_code == 422
    assert client.get("/api/portfolio?status=nope", headers=headers_a).status_code == 422


def test_journal_skills_practiced_persist_in_detail(
    client: TestClient,
    headers_a: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journey_id = _create_journey(client, headers_a, "pallets", "flask")
    res = client.put(
        f"/api/journeys/{journey_id}/journal",
        json={"skills_practiced": "SQLAlchemy, transactions"},
        headers=headers_a,
    )
    assert res.status_code == 200
    assert res.json()["journal"]["skills_practiced"] == "SQLAlchemy, transactions"
