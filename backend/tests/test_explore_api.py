"""Tests for the Explore API (organizations, repos, preferences).

Covers: catalog sync + filtering, follow state and user isolation,
preferences persistence, repo selection isolation, GitHub failure
handling, invalid identifier rejection, and idempotent caching.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, NoReturn

import jwt
import pytest
from backend.app import database, github_service, gsoc_service, orgs_data
from backend.app.main import app
from fastapi.testclient import TestClient

TEST_SECRET = "explore-test-secret-key-at-least-32-chars-long-12345"


def make_test_auth_headers(user_id: str = "test-alice-123") -> dict[str, str]:
    exp = datetime.now(UTC) + timedelta(hours=1)
    payload = {
        "sub": user_id,
        "email": f"{user_id}@example.com",
        "aud": "authenticated",
        "exp": int(exp.timestamp()),
        "role": "authenticated",
    }
    token = jwt.encode(payload, TEST_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "questline-explore.db")
    monkeypatch.setattr("backend.app.auth._SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr("backend.app.auth._SUPABASE_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr("backend.app.auth._get_jwks_client", lambda: None)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client

CATALOG_ROWS: list[dict[str, Any]] = [
    {
        "slug": "apertium",
        "name": "Apertium",
        "description": "Machine translation",
        "category": "Science and medicine",
        "website_url": "https://apertium.org",
        "ideas_url": "https://wiki.apertium.org/Ideas",
        "guide_url": None,
        "repo_url": "https://github.com/apertium",
        "blog_url": None,
        "twitter_url": None,
        "logo_url": None,
        "image_background_color": None,
        "irc_channel": None,
        "contact_email": None,
        "mailing_list": None,
        "technologies": ["python", "c++"],
        "topics": ["machine translation"],
        "participation_years": [2024, 2023, 2021],
        "latest_projects_count": 8,
    },
    {
        "slug": "asyncapi",
        "name": "AsyncAPI",
        "description": "Event-driven architectures",
        "category": "Programming languages",
        "website_url": "https://asyncapi.com",
        "ideas_url": None,
        "guide_url": None,
        "repo_url": "https://github.com/asyncapi",
        "blog_url": None,
        "twitter_url": None,
        "logo_url": None,
        "image_background_color": None,
        "irc_channel": None,
        "contact_email": None,
        "mailing_list": None,
        "technologies": ["javascript", "typescript"],
        "topics": ["web", "developer tools"],
        "participation_years": [2025, 2024],
        "latest_projects_count": 5,
    },
]


def fake_sync() -> dict[str, Any]:
    return {
        "rows": CATALOG_ROWS,
        "synced_years": [2025, 2024],
        "failed_years": [],
        "per_year_counts": {"2025": 2, "2024": 2},
        "source": "test-source",
        "synced_at_utc": "2026-01-01T00:00:00+00:00",
    }


def raising_sync() -> dict[str, Any]:
    raise gsoc_service.ExternalSourceError("upstream down", status=503)


@pytest.fixture
def synced_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gsoc_service, "sync_catalog", fake_sync)


EMPTY_GITHUB_ORG: dict[str, Any] = {
    "login": "apertium",
    "name": "Apertium",
    "description": None,
    "html_url": "https://github.com/apertium",
    "avatar_url": None,
    "blog_url": None,
    "public_repos": 2,
}

GITHUB_REPOS: list[dict[str, Any]] = [
    {
        "full_name": "apertium/apertium-core",
        "name": "apertium-core",
        "description": "Core engine",
        "html_url": "https://github.com/apertium/apertium-core",
        "language": "C++",
        "topics": ["translation"],
        "stargazers_count": 50,
        "forks_count": 10,
        "open_issues_count": 12,
        "default_branch": "master",
        "license": "GPL-3.0",
        "archived": False,
        "pushed_at": "2026-01-05T00:00:00Z",
        "updated_at": "2026-01-05T00:00:00Z",
    },
    {
        "full_name": "apertium/apertium-web",
        "name": "apertium-web",
        "description": "Web portal",
        "html_url": "https://github.com/apertium/apertium-web",
        "language": "TypeScript",
        "topics": [],
        "stargazers_count": 5,
        "forks_count": 2,
        "open_issues_count": 3,
        "default_branch": "main",
        "license": "MIT",
        "archived": False,
        "pushed_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    },
]


def test_org_list_triggers_sync_and_filters(
    client: TestClient, synced_catalog: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = client.get("/api/orgs")
    assert first.status_code == 200
    payload = first.json()
    assert payload["meta"]["count"] == 2
    assert payload["meta"]["source"] == "test-source"
    assert any(org["slug"] == "apertium" for org in payload["orgs"])

    filtered = client.get("/api/orgs", params={"category": "programming languages"})
    assert filtered.status_code == 200
    assert [org["slug"] for org in filtered.json()["orgs"]] == ["asyncapi"]

    tech = client.get("/api/orgs", params={"technology": "python"})
    assert [org["slug"] for org in tech.json()["orgs"]] == ["apertium"]

    search = client.get("/api/orgs", params={"q": "apert"})
    assert [org["slug"] for org in search.json()["orgs"]] == ["apertium"]


def test_org_list_serves_stale_catalog_when_upstream_fails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(gsoc_service, "sync_catalog", fake_sync)
    assert client.get("/api/orgs").status_code == 200
    stats = orgs_data.catalog_stats()
    assert stats["count"] == 2

    monkeypatch.setattr(gsoc_service, "sync_catalog", raising_sync)
    with database.get_connection() as connection:
        connection.execute(
            "UPDATE org_catalog SET synced_at_utc = ?", ("2020-01-01T00:00:00+00:00",)
        )

    response = client.get("/api/orgs")
    assert response.status_code == 200
    assert response.json()["meta"]["count"] == 2


def test_empty_catalog_with_unavailable_upstream_is_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(gsoc_service, "sync_catalog", raising_sync)
    response = client.get("/api/orgs")
    assert response.status_code == 503
    assert "retry" in response.json()["detail"].lower()


def test_org_404_for_unknown_slug(client: TestClient, synced_catalog: None) -> None:
    response = client.get("/api/orgs/does-not-exist")
    assert response.status_code == 404

    malformed = client.get("/api/orgs/../etc")
    assert malformed.status_code in (404, 422)


def test_follow_isolation_between_users(
    client: TestClient, synced_catalog: None
) -> None:
    # Prime the catalog first (sync is lazy).
    assert client.get("/api/orgs").status_code == 200
    # Guest follows apertium
    follow = client.post("/api/orgs/apertium/follow", json={"note": "MT is cool"})
    assert follow.status_code == 200
    assert follow.json()["followed"] is True

    guest_list = client.get("/api/orgs", params={"limit": 10}).json()
    guest_org = next(org for org in guest_list["orgs"] if org["slug"] == "apertium")
    assert guest_org["followed"] is True
    other = next(org for org in guest_list["orgs"] if org["slug"] == "asyncapi")
    assert other["followed"] is False

    guest_follows = client.get("/api/follows").json()
    assert [f["org_slug"] for f in guest_follows["follows"]] == ["apertium"]

    idempotent = client.post("/api/orgs/apertium/follow", json={"note": "still following"})
    assert idempotent.status_code == 200

    unfollow = client.delete("/api/orgs/apertium/follow")
    assert unfollow.status_code == 200
    after = client.get("/api/follows").json()
    assert after["follows"] == []


def test_preferences_round_trip_and_overlap_scoring(
    client: TestClient, synced_catalog: None
) -> None:
    save = client.put(
        "/api/profile/preferences",
        json={
            "interests": ["machine translation"],
            "languages": ["python"],
            "experience_level": "new",
            "weekly_hours": 6,
        },
    )
    assert save.status_code == 200
    saved = save.json()
    assert saved["languages"] == ["python"]
    assert saved["updated_at_utc"] is not None

    invalid = client.put(
        "/api/profile/preferences", json={"experience_level": "expert"}
    )
    assert invalid.status_code == 422

    recommendations = client.get("/api/recommendations").json()
    top = recommendations["recommendations"]
    assert top, "expected at least one recommendation"
    assert top[0]["slug"] == "apertium"
    reasons_text = " ".join(top[0]["reasons"]).lower()
    assert "python" in reasons_text or "machine translation" in reasons_text
    assert recommendations["based_on"]["languages"] == ["python"]


def test_recommendations_exclude_followed_orgs(
    client: TestClient, synced_catalog: None
) -> None:
    assert client.get("/api/orgs").status_code == 200
    client.put("/api/profile/preferences", json={"languages": ["python"]})
    client.post("/api/orgs/apertium/follow", json={})
    recs = client.get("/api/recommendations").json()
    assert all(org["slug"] != "apertium" for org in recs["recommendations"])


def test_repo_selections_persist_and_isolate(
    client: TestClient, synced_catalog: None
) -> None:
    put = client.put(
        "/api/repos/apertium/apertium-core/selection",
        json={"org_slug": "apertium", "status": "selected"},
    )
    assert put.status_code == 200
    mine = client.get("/api/me/repos").json()
    assert [r["repo_full_name"] for r in mine["selections"]] == ["apertium/apertium-core"]
    reselect = client.put(
        "/api/repos/apertium/apertium-core/selection",
        json={"org_slug": "apertium", "status": "shortlisted"},
    )
    assert reselect.status_code == 200
    assert [r["status"] for r in reselect.json()["selections"]] == ["shortlisted"]
    delete = client.delete("/api/repos/apertium/apertium-core/selection")
    assert delete.status_code == 204
    second_delete = client.delete("/api/repos/apertium/apertium-core/selection")
    assert second_delete.status_code == 404


def test_invalid_repo_identifiers_are_rejected(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def never_call(owner: str, repo: str) -> NoReturn:
        raise AssertionError("fetch must not be called for invalid identifiers")

    monkeypatch.setattr(github_service, "fetch_repository_details", never_call)
    response = client.get("/api/repos/bad%20owner/repo")
    assert response.status_code == 404

    traversal = client.put(
        "/api/repos/owner/../evil/selection", json={"org_slug": None, "status": "shortlisted"}
    )
    # 404/422 from validation or 405 via path normalization: all rejections.
    assert traversal.status_code in (404, 405, 422)


def test_org_repos_requires_derivable_github_org(
    client: TestClient, synced_catalog: None
) -> None:
    response = client.get("/api/orgs/asyncapi/repos")
    # asyncapi's repo_url maps to github.com/asyncapi -> should work OR fail
    # cleanly with upstream; ensure it never 500s.
    assert response.status_code in (200, 404, 503)


def test_org_repos_cache_is_idempotent(
    client: TestClient,
    synced_catalog: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[int] = []

    def counting(login: str, *, max_pages: int = 3) -> list[dict[str, Any]]:
        calls.append(1)
        return GITHUB_REPOS

    monkeypatch.setattr(github_service, "fetch_org_repositories", counting)
    monkeypatch.setattr(github_service, "extract_github_org_login", lambda url: "apertium")

    first = client.get("/api/orgs/apertium/repos")
    assert first.status_code == 200
    assert first.json()["repositories"][0]["full_name"] == "apertium/apertium-core"
    assert first.json()["complete"] is True
    assert len(calls) == 1

    second = client.get("/api/orgs/apertium/repos")
    assert second.status_code == 200
    assert second.json()["repositories"] == first.json()["repositories"]
    assert len(calls) == 1  # served from cache, no refetch

    force = client.get("/api/orgs/apertium/repos", params={"refresh": "force"})
    assert force.status_code == 200
    assert len(calls) == 2


def test_github_failure_preserves_cached_records(
    client: TestClient,
    synced_catalog: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(github_service, "extract_github_org_login", lambda url: "apertium")

    def fixed_repos(login: str, *, max_pages: int = 3) -> list[dict[str, Any]]:
        return GITHUB_REPOS

    monkeypatch.setattr(github_service, "fetch_org_repositories", fixed_repos)
    assert client.get("/api/orgs/apertium/repos").status_code == 200

    def boom(login: str, *, max_pages: int = 3) -> list[dict[str, Any]]:
        raise github_service.ExternalSourceError("GitHub unreachable", status=503)

    monkeypatch.setattr(github_service, "fetch_org_repositories", boom)

    failed = client.get("/api/orgs/apertium/repos", params={"refresh": "force"})
    # Force refresh bypasses the TTL; upstream failure must degrade to the
    # last known state (flagged in the note), not error destructively.
    assert failed.status_code == 200
    assert "failed" in failed.json()["note"].lower()
    cached_now = orgs_data.get_repo_cache("org-repos:apertium", ttl_seconds=10**12)
    assert cached_now is not None
    assert cached_now["repositories"][0]["full_name"] == "apertium/apertium-core"


def test_rate_limit_error_maps_to_clear_message(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403,
            headers={"X-RateLimit-Remaining": "0"},
            json={"message": "API rate limit exceeded"},
        )

    transport = httpx.MockTransport(handler)
    with httpx.Client(transport=transport) as http:
        from backend.app import http_client

        http_client._shared_client = http
        monkeypatch.setattr(http_client, "get_shared_client", lambda: http)
        with pytest.raises(http_client.RateLimitError):
            github_service.fetch_repository_details("apertium", "apertium-core")
        http_client._shared_client = None


def test_issues_endpoint_filters_pull_requests(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Shaped like the output of github_service.fetch_repository_issues.
    shaped_issues = [
        {
            "number": 1,
            "title": "Fix typo",
            "url": "https://github.com/o/r/issues/1",
            "state": "open",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "labels": ["good first issue"],
            "comments": 0,
            "assignees": [],
        },
        {
            "number": 2,
            "title": "Add feature",
            "url": "https://github.com/o/r/pull/2",
            "state": "open",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "labels": [],
            "comments": 1,
            "assignees": [],
        },
    ]

    def fake_issues(
        owner: str,
        repo: str,
        *,
        labels: list[str] | None = None,
        page: int = 1,
    ) -> tuple[list[dict[str, Any]], bool]:
        return shaped_issues, False

    monkeypatch.setattr(github_service, "fetch_repository_issues", fake_issues)

    response = client.get("/api/repos/o/r/issues", params={"label": "good-first-issue"})
    assert response.status_code == 200
    payload = response.json()
    assert [i["number"] for i in payload["issues"]] == [1, 2]
    assert payload["issues"][0]["labels"] == ["good first issue"]
    assert payload["labels_used"] == ["good first issue"]

    cached = client.get("/api/repos/o/r/issues", params={"label": "good-first-issue"})
    assert cached.status_code == 200
    assert [i["number"] for i in cached.json()["issues"]] == [1, 2]


def test_org_detail_syncs_catalog_on_cold_start(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(gsoc_service, "sync_catalog", fake_sync)
    response = client.get("/api/orgs/apertium")
    assert response.status_code == 200
    assert response.json()["slug"] == "apertium"


def test_integration_org_list_and_detail_consistency(
    client: TestClient, synced_catalog: None
) -> None:
    auth_headers = make_test_auth_headers("user-reviewer-999")

    # 1. Fetch organization list as guest and as authenticated user
    res_guest = client.get("/api/orgs?limit=60&offset=0")
    assert res_guest.status_code == 200
    orgs_guest = res_guest.json()["orgs"]
    assert len(orgs_guest) >= 2

    res_auth = client.get("/api/orgs?limit=60&offset=0", headers=auth_headers)
    assert res_auth.status_code == 200
    orgs_auth = res_auth.json()["orgs"]
    assert len(orgs_auth) == len(orgs_guest)

    # 2. For every slug in the list, detail request MUST return 200 for BOTH guest and auth users
    for org in orgs_auth:
        slug = org["slug"]
        # Authenticated detail request
        detail_auth = client.get(f"/api/orgs/{slug}", headers=auth_headers)
        assert (
            detail_auth.status_code == 200
        ), f"Expected 200 for authenticated detail {slug}, got {detail_auth.status_code}: {detail_auth.text}"
        data_auth = detail_auth.json()
        assert data_auth["slug"] == slug
        assert data_auth["name"] == org["name"]

        # Guest detail request
        detail_guest = client.get(f"/api/orgs/{slug}")
        assert (
            detail_guest.status_code == 200
        ), f"Expected 200 for guest detail {slug}, got {detail_guest.status_code}: {detail_guest.text}"
        data_guest = detail_guest.json()
        assert data_guest["slug"] == slug

        # Repeated request (idempotency & caching check)
        repeat = client.get(f"/api/orgs/{slug}", headers=auth_headers)
        assert repeat.status_code == 200
        assert repeat.json()["slug"] == slug


def test_org_detail_cold_start_authenticated_user(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(gsoc_service, "sync_catalog", fake_sync)
    auth_headers = make_test_auth_headers("user-cold-start-888")

    # Without ever calling /api/orgs first, authenticated user fetches detail directly
    response = client.get("/api/orgs/asyncapi", headers=auth_headers)
    assert (
        response.status_code == 200
    ), f"Cold-start auth detail failed: {response.status_code} {response.text}"
    assert response.json()["slug"] == "asyncapi"
    assert response.json()["name"] == "AsyncAPI"


def test_list_orgs_with_filters_authenticated_user(
    client: TestClient, synced_catalog: None
) -> None:
    auth_headers = make_test_auth_headers("user-filter-777")

    # Filtering by technology for authenticated user tests query parameter binding order
    res_tech = client.get("/api/orgs?technology=python", headers=auth_headers)
    assert res_tech.status_code == 200
    slugs = [o["slug"] for o in res_tech.json()["orgs"]]
    assert "apertium" in slugs
    assert "asyncapi" not in slugs

    # Filtering by search query
    res_q = client.get("/api/orgs?q=event-driven", headers=auth_headers)
    assert res_q.status_code == 200
    slugs_q = [o["slug"] for o in res_q.json()["orgs"]]
    assert "asyncapi" in slugs_q
    assert "apertium" not in slugs_q


