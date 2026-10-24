"""SQLite persistence for the Explore features (Phases 1–2).

Everything here is additive to the existing schema in `database.py`; existing
tables and rows are never touched. User-owned rows follow the same guest
fallback convention: `user_id IS NULL OR 'guest'` counts as guest data.

Design decisions:
- The GSoC catalog is a server-wide table (not per-user): one sync populates
  it for everyone, with `synced_at_utc` for freshness labeling.
- Follows, preferences and repo selections are user-owned with the composite
  uniqueness guests and signed-in users already get elsewhere.
- The GitHub cache stores raw payloads with a per-key TTL so the API layer
  stays stateless about freshness.
"""

from __future__ import annotations

import json
import logging
from contextlib import closing
from datetime import UTC, datetime
from typing import Any

from .database import _user_filter, get_connection

logger = logging.getLogger(__name__)


def initialize_explore_tables() -> None:
    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS org_catalog (
                slug TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '',
                category TEXT,
                website_url TEXT,
                ideas_url TEXT,
                guide_url TEXT,
                repo_url TEXT,
                blog_url TEXT,
                twitter_url TEXT,
                logo_url TEXT,
                image_background_color TEXT,
                irc_channel TEXT,
                contact_email TEXT,
                mailing_list TEXT,
                technologies TEXT NOT NULL DEFAULT '[]',
                topics TEXT NOT NULL DEFAULT '[]',
                participation_years TEXT NOT NULL DEFAULT '[]',
                latest_projects_count INTEGER,
                source TEXT NOT NULL DEFAULT '',
                synced_at_utc TEXT NOT NULL DEFAULT ''
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_org_follows (
                user_id TEXT NOT NULL DEFAULT 'guest',
                org_slug TEXT NOT NULL REFERENCES org_catalog(slug) ON DELETE CASCADE,
                note TEXT NOT NULL DEFAULT '',
                target_date TEXT,
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL,
                PRIMARY KEY (user_id, org_slug)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id TEXT PRIMARY KEY,
                interests TEXT NOT NULL DEFAULT '[]',
                languages TEXT NOT NULL DEFAULT '[]',
                experience_level TEXT NOT NULL DEFAULT 'new',
                weekly_hours INTEGER NOT NULL DEFAULT 5
                    CHECK (weekly_hours BETWEEN 0 AND 60),
                updated_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS repo_selections (
                user_id TEXT NOT NULL DEFAULT 'guest',
                org_slug TEXT,
                repo_full_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'shortlisted'
                    CHECK (status IN ('shortlisted', 'selected')),
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL,
                PRIMARY KEY (user_id, repo_full_name)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS repo_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                synced_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS catalog_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_org_catalog_category ON org_catalog(category)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_follows_org ON user_org_follows(org_slug)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_selections_user ON repo_selections(user_id)"
        )


def _row_to_catalog_entry(row: Any) -> dict[str, Any]:
    entry = dict(row)
    entry["technologies"] = json.loads(entry.get("technologies") or "[]")
    entry["topics"] = json.loads(entry.get("topics") or "[]")
    entry["participation_years"] = json.loads(entry.get("participation_years") or "[]")
    return entry


def replace_org_catalog(rows: list[dict[str, Any]], source: str, synced_at: str) -> int:
    """Insert/update the catalog. Existing rows a sync no longer returns are
    kept (they may still be followed); their absence from the fresh payload is
    recorded in catalog_meta instead of destroying data.
    """
    effective: list[tuple[Any, ...]] = []
    for row in rows:
        effective.append(
            (
                row["slug"],
                row["name"],
                row.get("description", ""),
                row.get("category") or None,
                row.get("website_url") or None,
                row.get("ideas_url") or None,
                row.get("guide_url") or None,
                row.get("repo_url") or None,
                row.get("blog_url") or None,
                row.get("twitter_url") or None,
                row.get("logo_url") or None,
                row.get("image_background_color") or None,
                row.get("irc_channel") or None,
                row.get("contact_email") or None,
                row.get("mailing_list") or None,
                json.dumps(row.get("technologies") or []),
                json.dumps(row.get("topics") or []),
                json.dumps(row.get("participation_years") or []),
                row.get("latest_projects_count"),
                source,
                synced_at,
            )
        )
    with closing(get_connection()) as connection, connection:
        connection.executemany(
            """
            INSERT INTO org_catalog (
                slug, name, description, category, website_url, ideas_url,
                guide_url, repo_url, blog_url, twitter_url, logo_url,
                image_background_color, irc_channel, contact_email,
                mailing_list, technologies, topics, participation_years,
                latest_projects_count, source, synced_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                category = excluded.category,
                website_url = excluded.website_url,
                ideas_url = excluded.ideas_url,
                guide_url = excluded.guide_url,
                repo_url = excluded.repo_url,
                blog_url = excluded.blog_url,
                twitter_url = excluded.twitter_url,
                logo_url = excluded.logo_url,
                image_background_color = excluded.image_background_color,
                irc_channel = excluded.irc_channel,
                contact_email = excluded.contact_email,
                mailing_list = excluded.mailing_list,
                technologies = excluded.technologies,
                topics = excluded.topics,
                participation_years = excluded.participation_years,
                latest_projects_count = excluded.latest_projects_count,
                source = excluded.source,
                synced_at_utc = excluded.synced_at_utc
            """,
            effective,
        )
        connection.execute(
            "INSERT INTO catalog_meta (key, value) VALUES ('source', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (source,),
        )
        connection.execute(
            "INSERT INTO catalog_meta (key, value) VALUES ('last_sync_synced_at', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (synced_at,),
        )
    return len(effective)


def catalog_stats() -> dict[str, Any]:
    with closing(get_connection()) as connection:
        count = connection.execute("SELECT COUNT(*) FROM org_catalog").fetchone()[0]
        meta_rows = connection.execute(
            "SELECT key, value FROM catalog_meta"
        ).fetchall()
    meta = {row["key"]: row["value"] for row in meta_rows}
    return {"count": count, **meta}


def list_orgs(
    user_id: str | None = None,
    *,
    q: str = "",
    category: str = "",
    technology: str = "",
    topic: str = "",
    limit: int = 60,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Catalog listing with optional filters. Filters are ANDed, case-insensitive."""
    where_conditions = ["1 = 1"]
    params: list[Any] = []
    if q:
        where_conditions.append(
            "(name LIKE '%'||?||'%' COLLATE NOCASE "
            "OR description LIKE '%'||?||'%' COLLATE NOCASE)"
        )
        params.extend([q, q])
    if category:
        where_conditions.append("org.category = ? COLLATE NOCASE")
        params.append(category)
    if technology:
        where_conditions.append(
            "EXISTS (SELECT 1 FROM json_each(org.technologies) tech "
            "WHERE tech.value = ? COLLATE NOCASE)"
        )
        params.append(technology)
    if topic:
        where_conditions.append(
            "EXISTS (SELECT 1 FROM json_each(org.topics) topic "
            "WHERE topic.value = ? COLLATE NOCASE)"
        )
        params.append(topic)
    where_clause, user_params = _user_filter(user_id)
    sql = f"""
        SELECT org.*, follows.org_slug IS NOT NULL AS followed FROM org_catalog org
        LEFT JOIN user_org_follows follows
            ON follows.org_slug = org.slug AND {where_clause.replace('user_id', 'follows.user_id')}
        WHERE {' AND '.join(where_conditions)}
        ORDER BY org.name COLLATE NOCASE ASC
        LIMIT ? OFFSET ?
    """
    full_params = [*params, *user_params, limit, offset]
    with closing(get_connection()) as connection:
        rows = connection.execute(sql, full_params).fetchall()
    return [_row_to_catalog_entry({**row}) for row in rows]


def get_org(slug: str, user_id: str | None = None) -> dict[str, Any] | None:
    where_clause, params = _user_filter(user_id)
    follow_condition = where_clause.replace("user_id", "follows.user_id")
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT org.*, follows.org_slug IS NOT NULL AS followed FROM org_catalog org "
            "LEFT JOIN user_org_follows follows "
            f"ON follows.org_slug = org.slug AND {follow_condition} "
            "WHERE org.slug = ?",
            (slug, *params),
        ).fetchone()
    if row is None:
        return None
    return _row_to_catalog_entry({**row})


def follow_org(
    slug: str, user_id: str | None = None, *, note: str = "", target_date: str | None = None
) -> dict[str, Any] | None:
    effective_user_id = user_id or "guest"
    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        org = connection.execute(
            "SELECT 1 FROM org_catalog WHERE slug = ?", (slug,)
        ).fetchone()
        if org is None:
            return None
        connection.execute(
            """
            INSERT INTO user_org_follows (
                user_id, org_slug, note, target_date, created_at_utc, updated_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, org_slug) DO UPDATE SET
                note = excluded.note,
                target_date = excluded.target_date,
                updated_at_utc = excluded.updated_at_utc
            """,
            (effective_user_id, slug, note or "", target_date, now, now),
        )
    complete = get_org(slug, user_id)
    return complete


def unfollow_org(slug: str, user_id: str | None = None) -> bool:
    effective_user_id = user_id or "guest"
    with closing(get_connection()) as connection, connection:
        cursor = connection.execute(
            "DELETE FROM user_org_follows WHERE user_id = ? AND org_slug = ?",
            (effective_user_id, slug),
        )
    return cursor.rowcount > 0


def list_follows(user_id: str | None = None) -> list[dict[str, Any]]:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        rows = connection.execute(
            "SELECT follow.org_slug, follow.note, follow.target_date, follow.created_at_utc, "
            "org.name, org.logo_url, org.category, org.participation_years "
            f"FROM user_org_follows follow JOIN org_catalog org ON org.slug = follow.org_slug "
            f"WHERE {where_clause} ORDER BY follow.created_at_utc DESC",
            params,
        ).fetchall()
    result = []
    for row in rows:
        entry = dict(row)
        entry["participation_years"] = json.loads(entry.get("participation_years") or "[]")
        result.append(entry)
    return result


def get_preferences(user_id: str | None = None) -> dict[str, Any]:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        row = connection.execute(
            f"SELECT interests, languages, experience_level, weekly_hours, updated_at_utc "
            f"FROM user_preferences WHERE {where_clause} LIMIT 1",
            params,
        ).fetchone()
    if row is None:
        return {
            "interests": [],
            "languages": [],
            "experience_level": "new",
            "weekly_hours": 5,
            "updated_at_utc": None,
        }
    return {
        "interests": json.loads(row["interests"] or "[]"),
        "languages": json.loads(row["languages"] or "[]"),
        "experience_level": row["experience_level"],
        "weekly_hours": row["weekly_hours"],
        "updated_at_utc": row["updated_at_utc"],
    }


def set_preferences(values: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    effective_user_id = user_id or "guest"
    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            INSERT INTO user_preferences (
                user_id, interests, languages, experience_level, weekly_hours, updated_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                interests = excluded.interests,
                languages = excluded.languages,
                experience_level = excluded.experience_level,
                weekly_hours = excluded.weekly_hours,
                updated_at_utc = excluded.updated_at_utc
            """,
            (
                effective_user_id,
                json.dumps(values.get("interests") or []),
                json.dumps(values.get("languages") or []),
                values.get("experience_level") or "new",
                int(values.get("weekly_hours") or 0),
                now,
            ),
        )
    return get_preferences(user_id)


def set_sync_metadata(sync_years: list[int], failed_years: list[int]) -> None:
    now_iso = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        connection.execute(
            "INSERT INTO catalog_meta (key, value) VALUES ('sync_years', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (json.dumps(sync_years),),
        )
        connection.execute(
            "INSERT INTO catalog_meta (key, value) VALUES ('sync_failed_years', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (json.dumps(sorted(failed_years)),),
        )
        connection.execute(
            "INSERT INTO catalog_meta (key, value) VALUES ('last_sync_synced_at', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (now_iso,),
        )


def get_sync_years() -> list[int]:
    with closing(get_connection()) as connection:
        rows = connection.execute(
            "SELECT key, value FROM catalog_meta WHERE key IN ('sync_years', 'sync_failed_years')"
        ).fetchall()
    meta = {row["key"]: row["value"] for row in rows}
    try:
        return [int(y) for y in json.loads(meta.get("sync_years") or "[]")]
    except (TypeError, ValueError):
        return []


def get_sync_years_failed() -> list[int]:
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT value FROM catalog_meta WHERE key = 'sync_failed_years'"
        ).fetchone()
    if row is None:
        return []
    try:
        return [int(y) for y in json.loads(row["value"] or "[]")]
    except (TypeError, ValueError):
        return []


def upsert_repo_selection(
    repo_full_name: str, org_slug: str | None, status: str, user_id: str | None = None
) -> dict[str, Any]:
    effective_user_id = user_id or "guest"
    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        existing = connection.execute(
            "SELECT created_at_utc FROM repo_selections WHERE user_id = ? AND repo_full_name = ?",
            (effective_user_id, repo_full_name),
        ).fetchone()
        created = existing["created_at_utc"] if existing else now
        connection.execute(
            """
            INSERT INTO repo_selections (
                user_id, org_slug, repo_full_name, status, created_at_utc, updated_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, repo_full_name) DO UPDATE SET
                org_slug = excluded.org_slug,
                status = excluded.status,
                updated_at_utc = excluded.updated_at_utc
            """,
            (effective_user_id, org_slug, repo_full_name, status, created, now),
        )
    rows = list_repo_selections(user_id)
    for row in rows:
        if row["repo_full_name"] == repo_full_name:
            return row
    return rows[-1] if rows else {}


def list_repo_selections(user_id: str | None = None) -> list[dict[str, Any]]:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        rows = connection.execute(
            f"SELECT org_slug, repo_full_name, status, created_at_utc, updated_at_utc "
            f"FROM repo_selections WHERE {where_clause} "
            f"ORDER BY updated_at_utc DESC, repo_full_name ASC",
            params,
        ).fetchall()
    return [dict(row) for row in rows]


def delete_repo_selection(repo_full_name: str, user_id: str | None = None) -> bool:
    effective_user_id = user_id or "guest"
    with closing(get_connection()) as connection, connection:
        cursor = connection.execute(
            "DELETE FROM repo_selections WHERE user_id = ? AND repo_full_name = ?",
            (effective_user_id, repo_full_name),
        )
    return cursor.rowcount > 0


def get_repo_cache(cache_key: str, ttl_seconds: int) -> dict[str, Any] | None:
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT payload, synced_at_utc FROM repo_cache WHERE cache_key = ?", (cache_key,)
        ).fetchone()
    if row is None:
        return None
    try:
        synced_at = datetime.fromisoformat(row["synced_at_utc"])
        age = datetime.now(UTC) - synced_at.astimezone(UTC)
        if age.total_seconds() > ttl_seconds:
            return None
    except (TypeError, ValueError):
        return None
    try:
        payload: dict[str, Any] = json.loads(row["payload"])
    except (TypeError, json.JSONDecodeError):
        return None
    return payload


def put_repo_cache(cache_key: str, payload: Any) -> str:
    now_iso = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            INSERT INTO repo_cache (cache_key, payload, synced_at_utc) VALUES (?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                payload = excluded.payload,
                synced_at_utc = excluded.synced_at_utc
            """,
            (cache_key, json.dumps(payload), now_iso),
        )
    return now_iso
