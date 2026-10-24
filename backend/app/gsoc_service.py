"""Google Summer of Code organization catalog sync.

Data source: the gsocorganizations.dev dataset (github.com/nishantwrp/
gsoc-organizations) — one JSON file per program year under
`api/data/<year>.json`, itself scraped from the official GSoC archive. We use
the structured dataset directly so records keep clean attribution and merge
across years instead of scraping HTML.

Reliability rules:
- Participation records are historical facts. Nothing downstream may present a
  "participated in 2026" row as confirmation for any future year; the newest
  known year is surfaced as `latest_verified Year`, and future status is
  explicitly "unverified".
- Sync is idempotent: re-running it produces the same catalog state.
"""

from __future__ import annotations

import os
import re
from datetime import UTC, datetime
from typing import Any

import httpx

from .http_client import ExternalSourceError, get_json, get_shared_client

DATASET_BASE_URL = "https://raw.githubusercontent.com/nishantwrp/gsoc-organizations/master/api/data"
DEFAULT_YEARS = "2026,2025,2024"
_DATA_SOURCE = "nishantwrp/gsoc-organizations (scraped from the official GSoC archive)"

# Bounded fetches: three year files at ~1.4 MB each is about 4 MB of JSON.
_MAX_YEARS = 3
_MAX_ORGS_PER_YEAR = 400
_LIST_FIELDS = ("technologies", "topics")
_SCALAR_FIELDS = (
    "name",
    "description",
    "category",
    "url",
    "ideas_url",
    "guide_url",
    "repo_url",
    "blog_url",
    "twitter_url",
    "image_url",
    "image_background_color",
    "irc_channel",
    "contact_email",
    "mailing_list",
)


def configured_years() -> list[int]:
    raw = os.environ.get("GSOC_ORGS_YEARS", DEFAULT_YEARS)
    years: list[int] = []
    for token in raw.split(","):
        token = token.strip()
        try:
            value = int(token)
        except ValueError:
            continue
        if 2009 <= value <= int(os.environ.get("GSOC_ORGS_MAX_YEAR", "2100")):
            years.append(value)
    years.sort(reverse=True)
    return years[:_MAX_YEARS]


def _numbered_slug(name: str, year: int, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "org"
    slug = base
    if slug in taken:
        slug = f"{base}-{year}"
    if slug in taken:
        # Extremely defensive: deduplicate suffixes beyond the year fallback.
        counter = 2
        while f"{base}-{counter}" in taken:
            counter += 1
        slug = f"{base}-{counter}"
    taken.add(slug)
    return slug


def _clean_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _as_list(value: Any, limit: int = 30) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item][:limit]


def parse_year_file(payload: Any) -> tuple[int, list[dict[str, Any]]]:
    """Validate the envelope of one year file: {year, organizations: [...] }."""
    if not isinstance(payload, dict):
        raise ExternalSourceError("GSoC dataset file has an unexpected top-level shape.", 503)
    year_raw = payload.get("year")
    if year_raw is None or not isinstance(year_raw, int | float | str):
        raise ExternalSourceError("GSoC dataset file is missing a valid year.", 503)
    try:
        year = int(year_raw)
    except (TypeError, ValueError) as error:
        raise ExternalSourceError("GSoC dataset file is missing a valid year.", 503) from error
    organizations = payload.get("organizations")
    if not isinstance(organizations, list):
        raise ExternalSourceError("GSoC dataset file has no organizations list.", 503)
    return year, organizations[:_MAX_ORGS_PER_YEAR]


def merge_year_files(
    fetched: list[tuple[int, list[dict[str, Any]]]],
) -> list[dict[str, Any]]:
    """Merge newest-first year entries into one org record per official name.

    Years are unioned, topics/technologies are unioned across the enabled
    years, scalar fields keep the newest non-empty value.
    """
    merged: dict[str, dict[str, Any]] = {}
    taken_slugs: set[str] = set()
    for year, organizations in fetched:  # newest first
        for org in organizations:
            if not isinstance(org, dict):
                continue
            name = _clean_str(org.get("name"))
            if not name:
                continue
            key = name.upper()
            record = merged.get(key)
            if record is None:
                record = {
                    "name": name,
                    "slug": _numbered_slug(name, year, taken_slugs),
                    "category": _clean_str(org.get("category")),
                    "description": _clean_str(org.get("description")),
                    "website_url": _clean_str(org.get("url")),
                    "ideas_url": _clean_str(org.get("ideas_url")),
                    "guide_url": _clean_str(org.get("guide_url")),
                    "repo_url": _clean_str(org.get("repo_url")),
                    "blog_url": _clean_str(org.get("blog_url")),
                    "twitter_url": _clean_str(org.get("twitter_url")),
                    "logo_url": _clean_str(org.get("image_url")),
                    "image_background_color": _clean_str(org.get("image_background_color")),
                    "irc_channel": _clean_str(org.get("irc_channel")),
                    "contact_email": _clean_str(org.get("contact_email")),
                    "mailing_list": _clean_str(org.get("mailing_list")),
                    "technologies": [],
                    "topics": [],
                    "participation_years": [],
                    "latest_projects_count": None,
                }
                merged[key] = record

            participation = record["participation_years"]
            if year not in participation:
                participation.append(year)
            for field in _LIST_FIELDS:
                known = set(record[field])
                for tech in _as_list(org.get(field)):
                    if tech not in known:
                        record[field].append(tech)
                        known.add(tech)
            projects_count = org.get("num_projects")
            if isinstance(projects_count, int) and record["latest_projects_count"] is None:
                record["latest_projects_count"] = projects_count
            for field in _SCALAR_FIELDS:
                if field == "name":
                    continue
                current = record.get(field)
                if not current:
                    value = _clean_str(org.get(field))
                    if value:
                        record[field] = value

    catalog = list(merged.values())
    for record in catalog:
        record["participation_years"] = sorted(record["participation_years"], reverse=True)
    catalog.sort(key=lambda record: record["name"].lower())
    return catalog


def sync_catalog(*, client: httpx.Client | None = None) -> dict[str, Any]:
    """Fetch enabled year files and return (rows, meta) for the catalog layer."""
    years = configured_years()
    if not years:
        raise ExternalSourceError("No valid GSoC dataset years configured.", 500)
    http_client = client or get_shared_client()
    fetched: list[tuple[int, list[dict[str, Any]]]] = []
    failed_years: list[int] = []
    parse_papertrail: dict[str, Any] = {}
    for year in years:
        url = f"{DATASET_BASE_URL}/{year}.json"
        try:
            payload = get_json(http_client, url, large=True)
            fetched_year, organizations = parse_year_file(payload)
            if fetched_year != year:
                raise ExternalSourceError(
                    f"GSoC dataset for {year} declared year {fetched_year}.", 503
                )
            fetched.append((fetched_year, organizations))
            parse_papertrail[str(year)] = len(organizations)
        except ExternalSourceError:
            if fetched:
                # Partial sync: keep what succeeded, record which years failed.
                failed_years.append(year)
                continue
            raise

    if not fetched:
        raise ExternalSourceError("GSoC catalog sync could not fetch any year data.", 503)

    rows = merge_year_files(fetched)
    return {
        "rows": rows,
        "synced_years": [year for year, _ in fetched],
        "failed_years": sorted(failed_years),
        "per_year_counts": parse_papertrail,
        "source": _DATA_SOURCE,
        "synced_at_utc": datetime.now(UTC).isoformat(),
    }


def catalog_meta(existing_meta: dict[str, Any] | None, years_used: list[int]) -> dict[str, Any]:
    """Attach source/years metadata used by the API responses."""
    meta = dict(existing_meta or {})
    meta.setdefault("source", _DATA_SOURCE)
    meta["years"] = years_used
    meta["year_note"] = (
        "Participation years are historical records from the official GSoC "
        "archive. They do not confirm participation in any future program."
    )
    return meta


