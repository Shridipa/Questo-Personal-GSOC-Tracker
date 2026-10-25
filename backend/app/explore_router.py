"""Explore router: GSoC organizations, GitHub repositories, preferences.

External-data rules enforced here:
- Catalog sync happens lazily, only when stale; failures degrade to serving
  the existing catalog flagged `stale` instead of erroring for empty pages.
- GitHub fetches are cached server-side per key with TTL; rate-limit errors
  surface a clear message; API failures never destroy stored records.
- Participation years are historical facts and never imply future status.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from . import github_service, gsoc_service, orgs_data
from .auth import AuthUser, get_optional_user
from .http_client import ExternalSourceError
from .recommendations import recommend_orgs
from .schemas_explore import (
    CatalogMeta,
    FollowedOrg,
    FollowListResponse,
    FollowPayload,
    FollowState,
    IssueListResponse,
    OrgDetail,
    OrgListResponse,
    OrgSummary,
    PreferenceResponse,
    PreferenceUpdate,
    RecommendationEntry,
    RecommendationResponse,
    RepoDetailResponse,
    RepoListResponse,
    RepoSelection,
    RepoSelectionListResponse,
    RepoSelectionPayload,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["explore"])

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _catalog_ttl_hours() -> int:
    return int(os.environ.get("GSOC_ORGS_SYNC_TTL_HOURS", "168"))


def _repo_cache_ttl_seconds(kind: str) -> int:
    if kind == "issues":
        return int(os.environ.get("GITHUB_CACHE_TTL_ISSUES_MINUTES", "30")) * 60
    return int(os.environ.get("GITHUB_CACHE_TTL_REPOS_HOURS", "6")) * 60


def _ensure_catalog() -> None:
    """Sync the GSoC catalog if empty or older than the TTL. Never raises."""
    stats = orgs_data.catalog_stats()
    if stats["count"] > 0:
        last_sync = stats.get("last_sync_synced_at") or ""
        try:
            age = datetime.now(UTC) - datetime.fromisoformat(last_sync).astimezone(UTC)
            if age.total_seconds() < _catalog_ttl_hours() * 3600:
                return
        except (TypeError, ValueError):
            pass  # malformed timestamp: fall through to refresh

    try:
        result = gsoc_service.sync_catalog()
    except ExternalSourceError as error:
        if stats["count"] == 0:
            detail = (
                "The GSoC organization catalog is empty and the upstream data source "
                f"is unavailable right now ({error}). Please retry shortly."
            )
            status = getattr(error, "status", 503)
            raise HTTPException(
                status_code=503 if status >= 500 else status, detail=detail
            ) from None
        logger.warning("GSoC catalog refresh failed; serving existing catalog: %s", error)
        return
    orgs_data.replace_org_catalog(
        result["rows"], result["source"], result["synced_at_utc"]
    )
    orgs_data.set_sync_metadata(result["synced_years"], result["failed_years"])


def _catalog_meta_response() -> CatalogMeta:
    stats = orgs_data.catalog_stats()
    years = orgs_data.get_sync_years()
    return CatalogMeta(
        count=int(stats["count"]),
        source=stats.get("source"),
        years=years,
        stale=bool(orgs_data.get_sync_years_failed()),
    )


@router.get("/orgs", response_model=OrgListResponse)
def get_orgs(
    q: str = Query(default="", max_length=80),
    category: str = Query(default="", max_length=60),
    technology: str = Query(default="", max_length=40),
    topic: str = Query(default="", max_length=40),
    limit: int = Query(default=60, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: AuthUser | None = Depends(get_optional_user),
) -> OrgListResponse:
    _ensure_catalog()
    user_id = current_user.id if current_user else None
    orgs = orgs_data.list_orgs(
        user_id,
        q=q.strip(),
        category=category.strip(),
        technology=technology.strip(),
        topic=topic.strip(),
        limit=limit,
        offset=offset,
    )
    return OrgListResponse(
        orgs=[OrgSummary.model_validate(org) for org in orgs],
        meta=_catalog_meta_response(),
    )


@router.get("/orgs/{slug}", response_model=OrgDetail)
def get_org_detail(
    slug: str,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> OrgDetail:
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Organization not found.")
    user_id = current_user.id if current_user else None
    org = orgs_data.get_org(slug, user_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found.")
    org["github_org_login"] = github_service.extract_github_org_login(org.get("repo_url"))
    return OrgDetail.model_validate(org)


@router.post("/orgs/{slug}/follow", response_model=FollowState)
def follow_org_endpoint(
    slug: str,
    payload: FollowPayload = FollowPayload(),
    current_user: AuthUser | None = Depends(get_optional_user),
) -> FollowState:
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Organization not found.")
    user_id = current_user.id if current_user else None
    org = orgs_data.follow_org(
        slug,
        user_id,
        note=payload.note.strip(),
        target_date=payload.target_date,
    )
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return FollowState(
        slug=slug, followed=True, note=payload.note.strip(), target_date=payload.target_date
    )


@router.delete("/orgs/{slug}/follow", response_model=FollowState)
def unfollow_org_endpoint(
    slug: str,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> FollowState:
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Organization not found.")
    user_id = current_user.id if current_user else None
    if not orgs_data.get_org(slug, user_id):
        raise HTTPException(status_code=404, detail="Organization not found.")
    orgs_data.unfollow_org(slug, user_id)
    return FollowState(slug=slug, followed=False)


@router.get("/follows", response_model=FollowListResponse)
def get_follows(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> FollowListResponse:
    user_id = current_user.id if current_user else None
    return FollowListResponse(
        follows=[FollowedOrg.model_validate(f) for f in orgs_data.list_follows(user_id)]
    )


@router.get("/profile/preferences", response_model=PreferenceResponse)
def get_preferences_endpoint(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> PreferenceResponse:
    user_id = current_user.id if current_user else None
    return PreferenceResponse.model_validate(orgs_data.get_preferences(user_id))


@router.put("/profile/preferences", response_model=PreferenceResponse)
def set_preferences_endpoint(
    payload: PreferenceUpdate,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> PreferenceResponse:
    user_id = current_user.id if current_user else None
    saved = orgs_data.set_preferences(payload.model_dump(mode="json"), user_id)
    return PreferenceResponse.model_validate(saved)


@router.get("/recommendations", response_model=RecommendationResponse)
def get_recommendations(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> RecommendationResponse:
    _ensure_catalog()
    user_id = current_user.id if current_user else None
    preferences = orgs_data.get_preferences(user_id)
    followed = {f["org_slug"] for f in orgs_data.list_follows(user_id)}
    catalog = orgs_data.list_orgs(user_id, limit=600)
    entries = recommend_orgs(catalog, preferences, excluded=followed)
    return RecommendationResponse(
        recommendations=[RecommendationEntry.model_validate(e) for e in entries],
        based_on=PreferenceResponse.model_validate(preferences),
    )


def _validated_repo_parts(owner: str, repo: str) -> tuple[str, str]:
    github_service.validate_owner(owner)
    github_service.validate_repo_name(repo)
    return owner, repo


@router.get("/orgs/{slug}/repos", response_model=RepoListResponse)
def get_org_repos(
    slug: str,
    refresh: Literal["auto", "force"] = Query(default="auto"),
    current_user: AuthUser | None = Depends(get_optional_user),
) -> RepoListResponse:
    _ensure_catalog()
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Organization not found.")
    user_id = current_user.id if current_user else None
    org = orgs_data.get_org(slug, user_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found.")
    login = github_service.extract_github_org_login(org.get("repo_url"))
    if login is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Questo could not derive a GitHub organization from "
                f"\"{org.get('repo_url') or 'the organization’s recorded repository URL'}\". "
                "You can still browse repositories by pasting a github.com organization URL "
                "using the repository search."
            ),
        )
    cache_key = f"org-repos:{login}"
    ttl = _repo_cache_ttl_seconds("repos")
    cached = None if refresh == "force" else orgs_data.get_repo_cache(cache_key, ttl)
    if cached is not None:
        return RepoListResponse.model_validate(cached)

    try:
        rows = github_service.fetch_org_repositories(login)
    except ExternalSourceError as error:
        stale = orgs_data.get_repo_cache(cache_key, ttl_seconds=int(10**12))
        if stale is not None:
            stale_payload = dict(stale)
            stale_payload["note"] = (
                f"Upstream GitHub fetch failed ({error}); showing the last known state. "
                "Use refresh to retry."
            )
            stale_payload["complete"] = False
            return RepoListResponse.model_validate(stale_payload)
        status = error.status if error.status >= 400 else 503
        raise HTTPException(status_code=status, detail=str(error)) from None

    total = len(rows)
    payload = {
        "github_org": login,
        "repositories": rows,
        "synced_at_utc": datetime.now(UTC).isoformat(),
        "total_fetched": total,
        "complete": total < 300,
        "note": "Derived from live public GitHub metadata; stars are popularity, not quality.",
    }
    orgs_data.put_repo_cache(cache_key, payload)
    return RepoListResponse.model_validate(payload)


@router.get("/repos/{owner}/{repo}", response_model=RepoDetailResponse)
def get_repo_detail(owner: str, repo: str) -> RepoDetailResponse:
    _validated_repo_parts(owner, repo)
    cache_key = f"repo-detail:{owner}/{repo}"
    ttl = _repo_cache_ttl_seconds("repos")
    cached = orgs_data.get_repo_cache(cache_key, ttl)
    if cached is not None:
        return RepoDetailResponse.model_validate(cached)
    try:
        details = github_service.fetch_repository_details(owner, repo)
        languages = github_service.fetch_repository_languages(owner, repo)
    except ExternalSourceError as error:
        stale = orgs_data.get_repo_cache(cache_key, ttl_seconds=int(10**12))
        if stale is not None:
            return RepoDetailResponse.model_validate(stale)
        status = error.status if error.status >= 400 else 503
        raise HTTPException(status_code=status, detail=str(error)) from None
    details["language_totals"] = languages
    details["synced_at_utc"] = datetime.now(UTC).isoformat()
    orgs_data.put_repo_cache(cache_key, details)
    return RepoDetailResponse.model_validate(details)


@router.get(
    "/repos/{owner}/{repo}/issues",
    response_model=IssueListResponse,
)
def get_repo_issues(
    owner: str,
    repo: str,
    label: Literal["good-first-issue", "help-wanted", "all"] = Query(default="good-first-issue"),
    page: int = Query(default=1, ge=1, le=50),
) -> IssueListResponse:
    _validated_repo_parts(owner, repo)
    labels_map: dict[str, list[str]] = {
        "good-first-issue": ["good first issue"],
        "help-wanted": ["help wanted"],
        "all": [],
    }
    labels = labels_map[label]
    cache_key = f"repo-issues:{owner}/{repo}:{label}:{page}"
    ttl = _repo_cache_ttl_seconds("issues")
    cached = orgs_data.get_repo_cache(cache_key, ttl)
    if cached is not None:
        return IssueListResponse.model_validate(cached)
    try:
        issues, has_more = github_service.fetch_repository_issues(
            owner, repo, labels=labels, page=page
        )
    except ExternalSourceError as error:
        stale = orgs_data.get_repo_cache(cache_key, ttl_seconds=int(10**12))
        if stale is not None:
            return IssueListResponse.model_validate(stale)
        status = error.status if error.status >= 400 else 503
        raise HTTPException(status_code=status, detail=str(error)) from None
    payload = {
        "owner": owner,
        "repo": repo,
        "issues": issues,
        "has_more": has_more,
        "labels_used": labels,
        "synced_at_utc": datetime.now(UTC).isoformat(),
        "note": (
            "Issue labels are maintained by each repository's maintainers and differ "
            "between projects. Good-first-issue availability varies; it is not guaranteed."
        ),
    }
    orgs_data.put_repo_cache(cache_key, payload)
    return IssueListResponse.model_validate(payload)


@router.put(
    "/repos/{owner}/{repo}/selection",
    response_model=RepoSelectionListResponse,
)
def put_repo_selection(
    owner: str,
    repo: str,
    payload: RepoSelectionPayload,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> RepoSelectionListResponse:
    user_id = current_user.id if current_user else None
    if not _SLUG_RE.match(owner):
        raise HTTPException(status_code=422, detail="Owner name is not valid.")
    try:
        _validated_repo_parts(owner, repo)
    except ExternalSourceError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    orgs_data.upsert_repo_selection(
        f"{owner}/{repo}", payload.org_slug, payload.status, user_id
    )
    return RepoSelectionListResponse(
        selections=[
            RepoSelection.model_validate(entry) for entry in orgs_data.list_repo_selections(user_id)
        ]
    )


@router.get("/me/repos", response_model=RepoSelectionListResponse)
def get_my_repos(
    current_user: AuthUser | None = Depends(get_optional_user),
) -> RepoSelectionListResponse:
    user_id = current_user.id if current_user else None
    return RepoSelectionListResponse(
        selections=[
            RepoSelection.model_validate(entry) for entry in orgs_data.list_repo_selections(user_id)
        ]
    )


@router.delete("/repos/{owner}/{repo}/selection", status_code=204, response_class=Response)
def delete_repo_selection(
    owner: str,
    repo: str,
    current_user: AuthUser | None = Depends(get_optional_user),
) -> Response:
    user_id = current_user.id if current_user else None
    if not orgs_data.delete_repo_selection(f"{owner}/{repo}", user_id):
        raise HTTPException(status_code=404, detail="Repository selection not found.")
    return Response(status_code=204)


@router.post("/orgs/sync", response_model=CatalogMeta)
def sync_orgs_endpoint() -> CatalogMeta:
    _ensure_catalog()
    try:
        result = gsoc_service.sync_catalog()
    except ExternalSourceError as error:
        status = error.status if error.status >= 400 else 503
        raise HTTPException(status_code=status, detail=str(error)) from None
    orgs_data.replace_org_catalog(result["rows"], result["source"], result["synced_at_utc"])
    return _catalog_meta_response()

