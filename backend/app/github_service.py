"""GitHub REST API client for public repository metadata.

Design notes:
- Unauthenticated public access by default; a server-side `GITHUB_TOKEN`
  (optional) raises the rate limit ceiling. The token is only ever read on
  the backend and is never sent to the browser.
- Cache policy lives with the caller (orgs_data.repo_cache) so tests can pin
  TTLs. This module is stateless with respect to storage.
"""

from __future__ import annotations

import os
import re
from typing import Any

import httpx

from .http_client import ExternalSourceError, get_json, get_shared_client

GITHUB_API_BASE = "https://api.github.com"

# URL-building safety: GitHub logins are alphanumeric + hyphens; repo names may
# contain dots and underscores. Path traversal, encoded characters, slashes and
# whitespace are rejected before any request is made.
_LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$")
_REPO_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


class NotFoundError(ExternalSourceError):
    def __init__(self, message: str = "Resource not found on GitHub."):
        super().__init__(message, status=404)


def _github_token() -> str | None:
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    return token or None


def _headers() -> dict[str, str]:
    headers: dict[str, str] = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = _github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def validate_owner(owner: str) -> str:
    if not _LOGIN_RE.match(owner):
        raise NotFoundError("That GitHub account name is not valid.")
    return owner


def validate_repo_name(name: str) -> str:
    if not _REPO_NAME_RE.match(name):
        raise NotFoundError("That GitHub repository name is not valid.")
    return name


def _request(
    path: str, params: dict[str, Any] | None = None, *, client: httpx.Client | None = None
) -> Any:
    try:
        payload = get_json(
            client or get_shared_client(),
            f"{GITHUB_API_BASE}{path}",
            headers=_headers(),
            params=params,
        )
    except ExternalSourceError as error:
        if error.status == 404:
            raise NotFoundError("That GitHub resource could not be found.") from error
        raise
    return payload


def extract_github_org_login(url: str | None) -> str | None:
    """Return the GitHub org login if a URL points at a github.com org profile."""
    if not url:
        return None
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url if "://" in url else f"https://{url}")
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or parsed.netloc.lower() not in (
        "github.com",
        "www.github.com",
    ):
        return None
    parts = [segment for segment in parsed.path.split("/") if segment]
    if len(parts) != 1:
        return None
    login = parts[0].replace(".git", "")
    try:
        return validate_owner(login)
    except NotFoundError:
        return None


def fetch_organization_details(
    login: str, *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """Public org profile: description, blog, avatar, public repo count."""
    validate_owner(login)
    payload = _request(f"/orgs/{login}", client=client)
    if not isinstance(payload, dict):
        raise ExternalSourceError("GitHub returned an unexpected organization payload.", 503)
    return {
        "login": payload.get("login", login),
        "name": payload.get("name") or login,
        "description": payload.get("description"),
        "html_url": payload.get("html_url") or f"https://github.com/{login}",
        "avatar_url": payload.get("avatar_url"),
        "blog_url": payload.get("blog"),
        "public_repos": payload.get("public_repos"),
    }


def fetch_org_repositories(
    login: str, *, max_pages: int = 3, client: httpx.Client | None = None
) -> list[dict[str, Any]]:
    """Most recently pushed public repositories of a GitHub org (up to max_pages*100)."""
    validate_owner(login)
    http_client = client or get_shared_client()
    repositories: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in range(1, max_pages + 1):
        payload = _request(
            f"/orgs/{login}/repos",
            params={
                "per_page": 100,
                "page": page,
                "sort": "pushed",
                "direction": "desc",
            },
            client=http_client,
        )
        if not isinstance(payload, list):
            raise ExternalSourceError("GitHub returned an unexpected repositories payload.", 503)
        for item in payload:
            full_name = item.get("full_name")
            if not isinstance(full_name, str) or full_name in seen:
                continue
            seen.add(full_name)
            license_info = item.get("license") or {}
            repositories.append(
                {
                    "full_name": full_name,
                    "name": item.get("name", full_name),
                    "description": item.get("description"),
                    "html_url": item.get("html_url"),
                    "language": item.get("language"),
                    "topics": item.get("topics") or [],
                    "stargazers_count": item.get("stargazers_count", 0),
                    "forks_count": item.get("forks_count", 0),
                    "open_issues_count": item.get("open_issues_count", 0),
                    "default_branch": item.get("default_branch"),
                    "license": (
                        license_info.get("spdx_id") if isinstance(license_info, dict) else None
                    ),
                    "archived": bool(item.get("archived")),
                    "pushed_at": item.get("pushed_at"),
                    "updated_at": item.get("updated_at"),
                }
            )
        if len(payload) < 100:
            break
    return repositories


def fetch_repository_details(
    owner: str, repo: str, *, client: httpx.Client | None = None
) -> dict[str, Any]:
    owner = validate_owner(owner)
    repo = validate_repo_name(repo)
    payload = _request(f"/repos/{owner}/{repo}", client=client)
    if not isinstance(payload, dict):
        raise ExternalSourceError("GitHub returned an unexpected repository payload.", 503)
    license_info = payload.get("license") or {}
    return {
        "full_name": payload.get("full_name", f"{owner}/{repo}"),
        "name": payload.get("name", repo),
        "description": payload.get("description"),
        "html_url": payload.get("html_url"),
        "language": payload.get("language"),
        "topics": payload.get("topics") or [],
        "stargazers_count": payload.get("stargazers_count", 0),
        "forks_count": payload.get("forks_count", 0),
        "open_issues_count": payload.get("open_issues_count", 0),
        "default_branch": payload.get("default_branch"),
        "license": license_info.get("spdx_id") if isinstance(license_info, dict) else None,
        "archived": bool(payload.get("archived")),
        "pushed_at": payload.get("pushed_at"),
        "created_at": payload.get("created_at"),
        "homepage": payload.get("homepage"),
    }


def fetch_repository_languages(
    owner: str, repo: str, *, client: httpx.Client | None = None
) -> dict[str, int]:
    owner = validate_owner(owner)
    repo = validate_repo_name(repo)
    payload = _request(f"/repos/{owner}/{repo}/languages", client=client)
    if not isinstance(payload, dict):
        return {}
    return {
        str(lang): int(count)
        for lang, count in payload.items()
        if isinstance(lang, str) and isinstance(count, int)
    }


def fetch_repository_issues(
    owner: str,
    repo: str,
    *,
    labels: list[str] | None = None,
    page: int = 1,
    client: httpx.Client | None = None,
) -> tuple[list[dict[str, Any]], bool]:
    """Open issues for a repository. Returns (issues, has_more).

    Pull requests must not leak into the issue list: any item carrying a
    `pull_request` key is filtered out.
    """
    owner = validate_owner(owner)
    repo = validate_repo_name(repo)
    params: dict[str, Any] = {
        "state": "open",
        "per_page": 50,
        "page": max(1, page),
        "sort": "created",
        "direction": "desc",
    }
    if labels:
        params["labels"] = ",".join(labels)
    payload = _request(f"/repos/{owner}/{repo}/issues", params=params, client=client)
    if not isinstance(payload, list):
        raise ExternalSourceError("GitHub returned an unexpected issues payload.", 503)
    issues = [
        {
            "id": item.get("id"),
            "number": item.get("number"),
            "title": item.get("title", ""),
            "url": item.get("html_url"),
            "state": item.get("state"),
            "created_at": item.get("created_at"),
            "updated_at": item.get("updated_at"),
            "labels": [
                label.get("name")
                if isinstance(label, dict)
                else (str(label) if isinstance(label, str) else None)
                for label in (item.get("labels") or [])
            ],
            "comments": item.get("comments", 0),
            "assignees": [
                assignee.get("login") if isinstance(assignee, dict) else None
                for assignee in (item.get("assignees") or [])
            ],
        }
        for item in payload
        if isinstance(item, dict) and "pull_request" not in item
    ]
    has_more = len(payload) >= 50
    return issues, has_more


def fetch_single_issue(
    owner: str, repo: str, issue_number: int, *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """Fetch details of a single issue on GitHub (rejects pull requests)."""
    owner = validate_owner(owner)
    repo = validate_repo_name(repo)
    if issue_number <= 0:
        raise NotFoundError("Invalid issue number.")
    payload = _request(f"/repos/{owner}/{repo}/issues/{issue_number}", client=client)
    if not isinstance(payload, dict):
        raise ExternalSourceError("GitHub returned an unexpected issue payload.", 503)
    if "pull_request" in payload:
        raise NotFoundError("The specified item is a pull request, not an issue.")
    return {
        "number": payload.get("number", issue_number),
        "title": payload.get("title", ""),
        "url": payload.get("html_url"),
        "state": payload.get("state", "open"),
        "created_at": payload.get("created_at"),
        "updated_at": payload.get("updated_at"),
        "labels": [
            label.get("name") if isinstance(label, dict) else str(label)
            for label in (payload.get("labels") or [])
        ],
        "comments": payload.get("comments", 0),
        "assignees": [
            assignee.get("login") if isinstance(assignee, dict) else None
            for assignee in (payload.get("assignees") or [])
        ],
    }


def fetch_single_pull_request(
    owner: str, repo: str, pull_number: int, *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """Fetch details of a pull request from GitHub."""
    owner = validate_owner(owner)
    repo = validate_repo_name(repo)
    if pull_number <= 0:
        raise NotFoundError("Invalid pull request number.")
    payload = _request(f"/repos/{owner}/{repo}/pulls/{pull_number}", client=client)
    if not isinstance(payload, dict):
        raise ExternalSourceError("GitHub returned an unexpected pull request payload.", 503)
    is_merged = bool(payload.get("merged", False))
    raw_state = payload.get("state", "open")
    normalized_state = "merged" if is_merged else raw_state
    return {
        "number": payload.get("number", pull_number),
        "title": payload.get("title", ""),
        "url": payload.get("html_url"),
        "state": normalized_state,
        "is_draft": bool(payload.get("draft", False)),
        "is_merged": is_merged,
        "merged_at": payload.get("merged_at"),
        "closed_at": payload.get("closed_at"),
        "created_at": payload.get("created_at"),
        "updated_at": payload.get("updated_at"),
    }

