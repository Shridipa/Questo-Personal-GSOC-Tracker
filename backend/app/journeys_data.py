"""SQLite persistence for Repository-Specific Contribution Journeys (Phase 3)."""

from __future__ import annotations

import json
import logging
from contextlib import closing
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .database import get_connection

logger = logging.getLogger(__name__)

DEFAULT_CHECKLIST: list[tuple[str, str]] = [
    ("readme", "Read the README"),
    ("contributing", "Read the contribution guidelines"),
    ("code_of_conduct", "Understand the code of conduct"),
    ("documentation", "Identify relevant documentation & developer guides"),
    ("setup", "Review installation and setup instructions"),
    ("environment", "Configure the local development environment"),
    ("dependencies", "Install project dependencies"),
    ("tests", "Run the existing test suite"),
    ("architecture", "Understand relevant project architecture"),
    ("reproduce", "Confirm the issue can be reproduced"),
]

DEFAULT_TASKS: list[str] = [
    "Reproduce the bug or explore the feature area",
    "Locate relevant functions and code paths",
    "Write a failing test or draft proof-of-concept",
    "Implement the focused fix or improvement",
    "Run test suite and format checks",
    "Review git diff before submitting PR",
]

ACTIVE_STATUSES = ("preparing", "issue_selected", "in_progress", "pr_open", "changes_requested")

TRACKING_STATES = ("open", "addressed", "not_applicable")


def _add_column_if_missing(connection: Any, table: str, column: str, ddl: str) -> None:
    """Repeatable SQLite migration: add a column only when it does not exist yet."""
    columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def initialize_journey_tables() -> None:
    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS contribution_journeys (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                repo_owner TEXT NOT NULL,
                repo_name TEXT NOT NULL,
                repo_full_name TEXT NOT NULL,
                repo_url TEXT NOT NULL,
                org_slug TEXT,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'preparing'
                    CHECK (status IN (
                        'preparing',
                        'issue_selected',
                        'in_progress',
                        'pr_open',
                        'changes_requested',
                        'merged',
                        'closed',
                        'paused',
                        'abandoned'
                    )),
                issue_number INTEGER,
                issue_title TEXT,
                issue_url TEXT,
                issue_state TEXT,
                issue_labels TEXT NOT NULL DEFAULT '[]',
                issue_comments INTEGER NOT NULL DEFAULT 0,
                issue_attached_at_utc TEXT,
                pr_number INTEGER,
                pr_title TEXT,
                pr_url TEXT,
                pr_state TEXT,
                pr_is_draft INTEGER NOT NULL DEFAULT 0,
                pr_merged_at TEXT,
                pr_closed_at TEXT,
                pr_synced_at_utc TEXT,
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_journeys_user_updated
            ON contribution_journeys(user_id, updated_at_utc DESC)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_journeys_user_repo
            ON contribution_journeys(user_id, repo_full_name)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS journey_checklist_items (
                journey_id TEXT NOT NULL REFERENCES contribution_journeys(id) ON DELETE CASCADE,
                item_key TEXT NOT NULL,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                completed_at_utc TEXT,
                updated_at_utc TEXT NOT NULL,
                PRIMARY KEY (journey_id, item_key)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS journey_journal (
                journey_id TEXT PRIMARY KEY REFERENCES contribution_journeys(id) ON DELETE CASCADE,
                summary TEXT NOT NULL DEFAULT '',
                reproduction_steps TEXT NOT NULL DEFAULT '',
                expected_vs_actual TEXT NOT NULL DEFAULT '',
                relevant_files TEXT NOT NULL DEFAULT '',
                potential_causes TEXT NOT NULL DEFAULT '',
                proposed_solution TEXT NOT NULL DEFAULT '',
                tests_to_run TEXT NOT NULL DEFAULT '',
                questions_for_maintainers TEXT NOT NULL DEFAULT '',
                lessons_learned TEXT NOT NULL DEFAULT '',
                updated_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS journey_tasks (
                id TEXT PRIMARY KEY,
                journey_id TEXT NOT NULL REFERENCES contribution_journeys(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_journey_tasks_sort
            ON journey_tasks(journey_id, sort_order ASC)
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS journey_events (
                id TEXT PRIMARY KEY,
                journey_id TEXT NOT NULL REFERENCES contribution_journeys(id) ON DELETE CASCADE,
                event_type TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_journey_events_created
            ON journey_events(journey_id, created_at_utc DESC)
            """
        )
        # Repeatable migrations for pre-existing databases
        _add_column_if_missing(
            connection,
            "contribution_journeys",
            "pr_created_at",
            "pr_created_at TEXT",
        )
        _add_column_if_missing(
            connection,
            "journey_journal",
            "skills_practiced",
            "skills_practiced TEXT NOT NULL DEFAULT ''",
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS journey_pr_reviews (
                journey_id TEXT PRIMARY KEY REFERENCES contribution_journeys(id) ON DELETE CASCADE,
                reviews_json TEXT NOT NULL DEFAULT '[]',
                comments_json TEXT NOT NULL DEFAULT '[]',
                synced_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS journey_pr_feedback (
                id TEXT PRIMARY KEY,
                journey_id TEXT NOT NULL REFERENCES contribution_journeys(id) ON DELETE CASCADE,
                source_type TEXT NOT NULL CHECK (source_type IN ('review', 'review_comment')),
                gh_node_id TEXT NOT NULL,
                gh_state TEXT NOT NULL,
                author TEXT,
                body_excerpt TEXT,
                html_url TEXT,
                submitted_at TEXT,
                response_notes TEXT NOT NULL DEFAULT '',
                tracking_state TEXT NOT NULL DEFAULT 'open'
                    CHECK (tracking_state IN ('open', 'addressed', 'not_applicable')),
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL,
                UNIQUE (journey_id, gh_node_id)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_journey_feedback_updated
            ON journey_pr_feedback(journey_id, updated_at_utc DESC)
            """
        )


def _row_to_summary(row: dict[str, Any]) -> dict[str, Any]:
    labels = []
    if row.get("issue_labels"):
        try:
            labels = json.loads(row["issue_labels"])
        except (TypeError, ValueError):
            labels = []
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "repo_owner": row["repo_owner"],
        "repo_name": row["repo_name"],
        "repo_full_name": row["repo_full_name"],
        "repo_url": row["repo_url"],
        "org_slug": row.get("org_slug"),
        "title": row["title"],
        "status": row["status"],
        "issue_number": row.get("issue_number"),
        "issue_title": row.get("issue_title"),
        "issue_url": row.get("issue_url"),
        "issue_state": row.get("issue_state"),
        "issue_labels": labels,
        "pr_number": row.get("pr_number"),
        "pr_title": row.get("pr_title"),
        "pr_url": row.get("pr_url"),
        "pr_state": row.get("pr_state"),
        "pr_is_draft": bool(row.get("pr_is_draft", 0)),
        "pr_merged_at": row.get("pr_merged_at"),
        "pr_closed_at": row.get("pr_closed_at"),
        "pr_created_at": row.get("pr_created_at"),
        "checklist_completed_count": int(row.get("checklist_completed_count", 0)),
        "checklist_total_count": int(row.get("checklist_total_count", len(DEFAULT_CHECKLIST))),
        "tasks_completed_count": int(row.get("tasks_completed_count", 0)),
        "tasks_total_count": int(row.get("tasks_total_count", 0)),
        "created_at_utc": row["created_at_utc"],
        "updated_at_utc": row["updated_at_utc"],
    }


def get_active_journey_for_repo(user_id: str, repo_full_name: str) -> dict[str, Any] | None:
    placeholders = ",".join("?" for _ in ACTIVE_STATUSES)
    query = f"""
        SELECT j.*,
            (SELECT COUNT(*) FROM journey_checklist_items WHERE journey_id = j.id AND completed = 1) AS checklist_completed_count,
            (SELECT COUNT(*) FROM journey_checklist_items WHERE journey_id = j.id) AS checklist_total_count,
            (SELECT COUNT(*) FROM journey_tasks WHERE journey_id = j.id AND completed = 1) AS tasks_completed_count,
            (SELECT COUNT(*) FROM journey_tasks WHERE journey_id = j.id) AS tasks_total_count
        FROM contribution_journeys j
        WHERE j.user_id = ? AND j.repo_full_name = ? AND j.status IN ({placeholders})
        ORDER BY j.updated_at_utc DESC
        LIMIT 1
    """
    with closing(get_connection()) as connection:
        row = connection.execute(query, (user_id, repo_full_name, *ACTIVE_STATUSES)).fetchone()
        return _row_to_summary(dict(row)) if row else None


def create_or_get_journey(
    user_id: str,
    repo_owner: str,
    repo_name: str,
    org_slug: str | None = None,
    title: str | None = None,
) -> tuple[dict[str, Any], bool]:
    """Idempotent creation: returns existing active quest or creates a new one."""
    repo_full_name = f"{repo_owner}/{repo_name}"
    existing = get_active_journey_for_repo(user_id, repo_full_name)
    if existing:
        detail = get_journey_detail(existing["id"], user_id)
        if detail:
            return detail, False

    journey_id = str(uuid4())
    now = datetime.now(UTC).isoformat()
    quest_title = title.strip() if title and title.strip() else f"Contribution to {repo_full_name}"
    repo_url = f"https://github.com/{repo_full_name}"

    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            INSERT INTO contribution_journeys (
                id, user_id, repo_owner, repo_name, repo_full_name, repo_url,
                org_slug, title, status, created_at_utc, updated_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing', ?, ?)
            """,
            (
                journey_id,
                user_id,
                repo_owner,
                repo_name,
                repo_full_name,
                repo_url,
                org_slug,
                quest_title,
                now,
                now,
            ),
        )

        # Seed standard preparation checklist
        for item_key, item_title in DEFAULT_CHECKLIST:
            connection.execute(
                """
                INSERT INTO journey_checklist_items (
                    journey_id, item_key, title, completed, notes, updated_at_utc
                ) VALUES (?, ?, ?, 0, '', ?)
                """,
                (journey_id, item_key, item_title, now),
            )

        # Seed empty investigation journal
        connection.execute(
            """
            INSERT INTO journey_journal (journey_id, updated_at_utc)
            VALUES (?, ?)
            """,
            (journey_id, now),
        )

        # Seed default personal tasks
        for idx, task_title in enumerate(DEFAULT_TASKS):
            connection.execute(
                """
                INSERT INTO journey_tasks (
                    id, journey_id, title, completed, sort_order, created_at_utc, updated_at_utc
                ) VALUES (?, ?, ?, 0, ?, ?, ?)
                """,
                (str(uuid4()), journey_id, task_title, idx, now, now),
            )

        # Record activity event
        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'quest_created', ?, ?)
            """,
            (str(uuid4()), journey_id, f"Started contribution quest for {repo_full_name}.", now),
        )

    detail = get_journey_detail(journey_id, user_id)
    assert detail is not None
    return detail, True


def list_user_journeys(user_id: str, status_filter: str | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT j.*,
            (SELECT COUNT(*) FROM journey_checklist_items WHERE journey_id = j.id AND completed = 1) AS checklist_completed_count,
            (SELECT COUNT(*) FROM journey_checklist_items WHERE journey_id = j.id) AS checklist_total_count,
            (SELECT COUNT(*) FROM journey_tasks WHERE journey_id = j.id AND completed = 1) AS tasks_completed_count,
            (SELECT COUNT(*) FROM journey_tasks WHERE journey_id = j.id) AS tasks_total_count
        FROM contribution_journeys j
        WHERE j.user_id = ?
    """
    params: list[Any] = [user_id]
    if status_filter:
        query += " AND j.status = ?"
        params.append(status_filter)
    query += " ORDER BY j.updated_at_utc DESC"

    with closing(get_connection()) as connection:
        rows = connection.execute(query, tuple(params)).fetchall()
        return [_row_to_summary(dict(row)) for row in rows]


def get_journey_detail(journey_id: str, user_id: str) -> dict[str, Any] | None:
    with closing(get_connection()) as connection:
        journey_row = connection.execute(
            """
            SELECT j.*,
                (SELECT COUNT(*) FROM journey_checklist_items WHERE journey_id = j.id AND completed = 1) AS checklist_completed_count,
                (SELECT COUNT(*) FROM journey_checklist_items WHERE journey_id = j.id) AS checklist_total_count,
                (SELECT COUNT(*) FROM journey_tasks WHERE journey_id = j.id AND completed = 1) AS tasks_completed_count,
                (SELECT COUNT(*) FROM journey_tasks WHERE journey_id = j.id) AS tasks_total_count
            FROM contribution_journeys j
            WHERE j.id = ? AND j.user_id = ?
            """,
            (journey_id, user_id),
        ).fetchone()

        if not journey_row:
            return None

        summary = _row_to_summary(dict(journey_row))
        raw = dict(journey_row)
        summary["issue_comments"] = raw.get("issue_comments", 0)
        summary["issue_attached_at_utc"] = raw.get("issue_attached_at_utc")
        summary["pr_synced_at_utc"] = raw.get("pr_synced_at_utc")

        # Review cache, feedback items and derived PR timeline (Phase 4)
        review_cache_row = connection.execute(
            "SELECT reviews_json, comments_json, synced_at_utc FROM journey_pr_reviews WHERE journey_id = ?",
            (journey_id,),
        ).fetchone()
        reviews: list[dict[str, Any]] = []
        comments: list[dict[str, Any]] = []
        if review_cache_row:
            try:
                reviews = json.loads(review_cache_row["reviews_json"])
            except (TypeError, ValueError):
                reviews = []
            try:
                comments = json.loads(review_cache_row["comments_json"])
            except (TypeError, ValueError):
                comments = []
            summary["pr_review_synced_at_utc"] = review_cache_row["synced_at_utc"]
        else:
            summary["pr_review_synced_at_utc"] = None
        summary["pr_reviews"] = [_known_review(r) for r in reviews]
        summary["pr_timeline"] = build_pr_timeline(dict(raw), reviews)

        feedback_rows = connection.execute(
            """
            SELECT id, source_type, gh_node_id, gh_state, author, body_excerpt, html_url,
                   submitted_at, response_notes, tracking_state, created_at_utc, updated_at_utc
            FROM journey_pr_feedback
            WHERE journey_id = ?
            ORDER BY (tracking_state = 'open') DESC, updated_at_utc DESC
            LIMIT 200
            """,
            (journey_id,),
        ).fetchall()
        summary["pr_feedback"] = [dict(row) for row in feedback_rows]

        # Checklist
        checklist_rows = connection.execute(
            """
            SELECT item_key, title, completed, notes, completed_at_utc, updated_at_utc
            FROM journey_checklist_items
            WHERE journey_id = ?
            """,
            (journey_id,),
        ).fetchall()
        # Maintain original standard order
        order_map = {key: i for i, (key, _) in enumerate(DEFAULT_CHECKLIST)}
        checklist_items = [
            {
                "item_key": row["item_key"],
                "title": row["title"],
                "completed": bool(row["completed"]),
                "notes": row["notes"] or "",
                "completed_at_utc": row["completed_at_utc"],
                "updated_at_utc": row["updated_at_utc"],
            }
            for row in checklist_rows
        ]
        checklist_items.sort(key=lambda item: order_map.get(item["item_key"], 99))
        summary["checklist"] = checklist_items

        # Journal
        journal_row = connection.execute(
            """
            SELECT summary, reproduction_steps, expected_vs_actual, relevant_files,
                   potential_causes, proposed_solution, tests_to_run,
                   questions_for_maintainers, lessons_learned, skills_practiced, updated_at_utc
            FROM journey_journal
            WHERE journey_id = ?
            """,
            (journey_id,),
        ).fetchone()
        if journal_row:
            summary["journal"] = dict(journal_row)
        else:
            summary["journal"] = {
                "summary": "",
                "reproduction_steps": "",
                "expected_vs_actual": "",
                "relevant_files": "",
                "potential_causes": "",
                "proposed_solution": "",
                "tests_to_run": "",
                "questions_for_maintainers": "",
                "lessons_learned": "",
                "skills_practiced": "",
                "updated_at_utc": summary["updated_at_utc"],
            }

        # Tasks
        task_rows = connection.execute(
            """
            SELECT id, journey_id, title, completed, sort_order, created_at_utc, updated_at_utc
            FROM journey_tasks
            WHERE journey_id = ?
            ORDER BY sort_order ASC, created_at_utc ASC
            """,
            (journey_id,),
        ).fetchall()
        summary["tasks"] = [
            {
                "id": row["id"],
                "journey_id": row["journey_id"],
                "title": row["title"],
                "completed": bool(row["completed"]),
                "sort_order": row["sort_order"],
                "created_at_utc": row["created_at_utc"],
                "updated_at_utc": row["updated_at_utc"],
            }
            for row in task_rows
        ]

        # Events
        event_rows = connection.execute(
            """
            SELECT id, event_type, description, created_at_utc
            FROM journey_events
            WHERE journey_id = ?
            ORDER BY created_at_utc DESC
            LIMIT 50
            """,
            (journey_id,),
        ).fetchall()
        summary["events"] = [dict(row) for row in event_rows]

        return summary


def update_journey_status(
    journey_id: str, user_id: str, new_status: str, note: str | None = None
) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        cur = connection.execute(
            """
            UPDATE contribution_journeys
            SET status = ?, updated_at_utc = ?
            WHERE id = ? AND user_id = ?
            """,
            (new_status, now, journey_id, user_id),
        )
        if cur.rowcount == 0:
            return None

        event_desc = f"Status updated to '{new_status}'."
        if note and note.strip():
            event_desc += f" Note: {note.strip()}"
        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'status_changed', ?, ?)
            """,
            (str(uuid4()), journey_id, event_desc, now),
        )

    return get_journey_detail(journey_id, user_id)


def update_checklist_item(
    journey_id: str, user_id: str, item_key: str, completed: bool, notes: str
) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    completed_at = now if completed else None

    with closing(get_connection()) as connection, connection:
        # Check ownership
        owner_check = connection.execute(
            "SELECT id FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not owner_check:
            return None

        cur = connection.execute(
            """
            UPDATE journey_checklist_items
            SET completed = ?, notes = ?, completed_at_utc = ?, updated_at_utc = ?
            WHERE journey_id = ? AND item_key = ?
            """,
            (1 if completed else 0, notes, completed_at, now, journey_id, item_key),
        )
        if cur.rowcount == 0:
            return None

        connection.execute(
            "UPDATE contribution_journeys SET updated_at_utc = ? WHERE id = ?",
            (now, journey_id),
        )

        status_str = "completed" if completed else "marked pending"
        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'checklist_updated', ?, ?)
            """,
            (str(uuid4()), journey_id, f"Preparation step '{item_key}' {status_str}.", now),
        )

    return get_journey_detail(journey_id, user_id)


def update_journal(
    journey_id: str, user_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        owner_check = connection.execute(
            "SELECT id FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not owner_check:
            return None

        connection.execute(
            """
            UPDATE journey_journal
            SET summary = ?,
                reproduction_steps = ?,
                expected_vs_actual = ?,
                relevant_files = ?,
                potential_causes = ?,
                proposed_solution = ?,
                tests_to_run = ?,
                questions_for_maintainers = ?,
                lessons_learned = ?,
                skills_practiced = ?,
                updated_at_utc = ?
            WHERE journey_id = ?
            """,
            (
                values.get("summary", ""),
                values.get("reproduction_steps", ""),
                values.get("expected_vs_actual", ""),
                values.get("relevant_files", ""),
                values.get("potential_causes", ""),
                values.get("proposed_solution", ""),
                values.get("tests_to_run", ""),
                values.get("questions_for_maintainers", ""),
                values.get("lessons_learned", ""),
                values.get("skills_practiced", ""),
                now,
                journey_id,
            ),
        )

        connection.execute(
            "UPDATE contribution_journeys SET updated_at_utc = ? WHERE id = ?",
            (now, journey_id),
        )

        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'journal_updated', 'Investigation journal updated.', ?)
            """,
            (str(uuid4()), journey_id, now),
        )

    return get_journey_detail(journey_id, user_id)


def add_task(journey_id: str, user_id: str, title: str) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    task_id = str(uuid4())

    with closing(get_connection()) as connection, connection:
        owner_check = connection.execute(
            "SELECT id FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not owner_check:
            return None

        max_order = connection.execute(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM journey_tasks WHERE journey_id = ?",
            (journey_id,),
        ).fetchone()[0]

        connection.execute(
            """
            INSERT INTO journey_tasks (id, journey_id, title, completed, sort_order, created_at_utc, updated_at_utc)
            VALUES (?, ?, ?, 0, ?, ?, ?)
            """,
            (task_id, journey_id, title, max_order, now, now),
        )

        connection.execute(
            "UPDATE contribution_journeys SET updated_at_utc = ? WHERE id = ?",
            (now, journey_id),
        )

        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'task_added', ?, ?)
            """,
            (str(uuid4()), journey_id, f"Added personal task: '{title}'.", now),
        )

    return get_journey_detail(journey_id, user_id)


def update_task(
    journey_id: str, user_id: str, task_id: str, title: str | None, completed: bool | None
) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        owner_check = connection.execute(
            "SELECT id FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not owner_check:
            return None

        task_row = connection.execute(
            "SELECT title, completed FROM journey_tasks WHERE id = ? AND journey_id = ?",
            (task_id, journey_id),
        ).fetchone()
        if not task_row:
            return None

        new_title = title if title is not None else task_row["title"]
        new_completed = (1 if completed else 0) if completed is not None else task_row["completed"]

        connection.execute(
            """
            UPDATE journey_tasks
            SET title = ?, completed = ?, updated_at_utc = ?
            WHERE id = ? AND journey_id = ?
            """,
            (new_title, new_completed, now, task_id, journey_id),
        )

        connection.execute(
            "UPDATE contribution_journeys SET updated_at_utc = ? WHERE id = ?",
            (now, journey_id),
        )

        if completed is not None and completed != bool(task_row["completed"]):
            action_str = "Completed" if completed else "Reopened"
            connection.execute(
                """
                INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
                VALUES (?, ?, 'task_updated', ?, ?)
                """,
                (str(uuid4()), journey_id, f"{action_str} personal task: '{new_title}'.", now),
            )

    return get_journey_detail(journey_id, user_id)


def delete_task(journey_id: str, user_id: str, task_id: str) -> bool:
    with closing(get_connection()) as connection, connection:
        owner_check = connection.execute(
            "SELECT id FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not owner_check:
            return False

        cur = connection.execute(
            "DELETE FROM journey_tasks WHERE id = ? AND journey_id = ?",
            (task_id, journey_id),
        )
        return cur.rowcount > 0


def attach_issue(
    journey_id: str, user_id: str, issue_info: dict[str, Any]
) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    labels_json = json.dumps(issue_info.get("labels", []))

    with closing(get_connection()) as connection, connection:
        journey_row = connection.execute(
            "SELECT id, status FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not journey_row:
            return None

        current_status = journey_row["status"]
        new_status = "issue_selected" if current_status == "preparing" else current_status

        connection.execute(
            """
            UPDATE contribution_journeys
            SET issue_number = ?,
                issue_title = ?,
                issue_url = ?,
                issue_state = ?,
                issue_labels = ?,
                issue_comments = ?,
                issue_attached_at_utc = ?,
                status = ?,
                updated_at_utc = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                issue_info.get("number"),
                issue_info.get("title"),
                issue_info.get("url"),
                issue_info.get("state"),
                labels_json,
                issue_info.get("comments", 0),
                now,
                new_status,
                now,
                journey_id,
                user_id,
            ),
        )

        issue_desc = f"Attached GitHub issue #{issue_info.get('number')}: {issue_info.get('title')}."
        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'issue_attached', ?, ?)
            """,
            (str(uuid4()), journey_id, issue_desc, now),
        )

    return get_journey_detail(journey_id, user_id)


def detach_issue(journey_id: str, user_id: str) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        journey_row = connection.execute(
            "SELECT id, issue_number, status FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not journey_row:
            return None

        old_number = journey_row["issue_number"]
        new_status = "preparing" if journey_row["status"] == "issue_selected" else journey_row["status"]

        connection.execute(
            """
            UPDATE contribution_journeys
            SET issue_number = NULL,
                issue_title = NULL,
                issue_url = NULL,
                issue_state = NULL,
                issue_labels = '[]',
                issue_comments = 0,
                issue_attached_at_utc = NULL,
                status = ?,
                updated_at_utc = ?
            WHERE id = ? AND user_id = ?
            """,
            (new_status, now, journey_id, user_id),
        )

        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'issue_detached', ?, ?)
            """,
            (str(uuid4()), journey_id, f"Detached GitHub issue #{old_number}.", now),
        )

    return get_journey_detail(journey_id, user_id)


def link_pull_request(
    journey_id: str, user_id: str, pr_info: dict[str, Any]
) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()

    with closing(get_connection()) as connection, connection:
        journey_row = connection.execute(
            "SELECT id, status FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not journey_row:
            return None

        current_status = journey_row["status"]
        if pr_info.get("is_merged"):
            new_status = "merged"
        elif current_status in ("preparing", "issue_selected", "in_progress"):
            new_status = "pr_open"
        else:
            new_status = current_status

        connection.execute(
            """
            UPDATE contribution_journeys
            SET pr_number = ?,
                pr_title = ?,
                pr_url = ?,
                pr_state = ?,
                pr_is_draft = ?,
                pr_merged_at = ?,
                pr_closed_at = ?,
                pr_created_at = ?,
                pr_synced_at_utc = ?,
                status = ?,
                updated_at_utc = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                pr_info.get("number"),
                pr_info.get("title"),
                pr_info.get("url"),
                pr_info.get("state"),
                1 if pr_info.get("is_draft") else 0,
                pr_info.get("merged_at"),
                pr_info.get("closed_at"),
                pr_info.get("created_at"),
                now,
                new_status,
                now,
                journey_id,
                user_id,
            ),
        )

        pr_desc = f"Linked GitHub pull request #{pr_info.get('number')}: {pr_info.get('title')} ({pr_info.get('state')})."
        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'pr_linked', ?, ?)
            """,
            (str(uuid4()), journey_id, pr_desc, now),
        )

    return get_journey_detail(journey_id, user_id)


def unlink_pull_request(journey_id: str, user_id: str) -> dict[str, Any] | None:
    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        journey_row = connection.execute(
            "SELECT id, pr_number, status FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not journey_row:
            return None

        old_pr = journey_row["pr_number"]
        new_status = "in_progress" if journey_row["status"] in ("pr_open", "changes_requested") else journey_row["status"]

        connection.execute(
            """
            UPDATE contribution_journeys
            SET pr_number = NULL,
                pr_title = NULL,
                pr_url = NULL,
                pr_state = NULL,
                pr_is_draft = 0,
                pr_merged_at = NULL,
                pr_closed_at = NULL,
                pr_created_at = NULL,
                pr_synced_at_utc = NULL,
                status = ?,
                updated_at_utc = ?
            WHERE id = ? AND user_id = ?
            """,
            (new_status, now, journey_id, user_id),
        )

        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'pr_unlinked', ?, ?)
            """,
            (str(uuid4()), journey_id, f"Unlinked pull request #{old_pr}.", now),
        )

    return get_journey_detail(journey_id, user_id)


# ─── PR review intelligence (Phase 4) ───────────────────────────────────────


def _known_review(review: dict[str, Any]) -> dict[str, Any]:
    return {
        "node_id": str(review.get("node_id", "")),
        "gh_state": str(review.get("gh_state") or review.get("state") or "COMMENTED"),
        "author": review.get("author"),
        "body_excerpt": review.get("body_excerpt"),
        "html_url": review.get("html_url"),
        "submitted_at": review.get("submitted_at"),
    }


def build_pr_timeline(
    journey_row: dict[str, Any], reviews: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Chronological PR events derived strictly from real GitHub-timestamped data.

    Nothing is invented: events only appear when the underlying field exists.
    """
    events: list[dict[str, Any]] = []
    if journey_row.get("pr_created_at"):
        events.append(
            {
                "occurred_at": journey_row["pr_created_at"],
                "kind": "pr_opened",
                "label": "Pull request opened.",
            }
        )
    for review in reviews:
        state = str(review.get("gh_state") or review.get("state") or "").upper()
        submitted = review.get("submitted_at")
        if not submitted:
            continue
        kind_map = {
            "CHANGES_REQUESTED": "changes_requested",
            "APPROVED": "approved",
            "DISMISSED": "review_dismissed",
            "COMMENTED": "review_commented",
        }
        if state not in kind_map:
            continue
        actor = review.get("author") or "Unknown reviewer"
        labels = {
            "changes_requested": f"{actor} requested changes.",
            "approved": f"{actor} approved the pull request.",
            "review_dismissed": f"{actor}'s review was dismissed.",
            "review_commented": f"{actor} left a review comment.",
        }
        events.append(
            {
                "occurred_at": submitted,
                "kind": kind_map[state],
                "label": labels[kind_map[state]],
            }
        )
    if journey_row.get("pr_merged_at"):
        events.append(
            {
                "occurred_at": journey_row["pr_merged_at"],
                "kind": "pr_merged",
                "label": "Pull request merged on GitHub.",
            }
        )
    elif journey_row.get("pr_closed_at"):
        events.append(
            {
                "occurred_at": journey_row["pr_closed_at"],
                "kind": "pr_closed",
                "label": "Pull request closed without merging.",
            }
        )
    events.sort(key=lambda event: event["occurred_at"] or "")
    return events


def sync_pr_reviews(
    journey_id: str,
    user_id: str,
    reviews: list[dict[str, Any]],
    comments: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Persist a successful review sync and mirror actionable items into feedback.

    The review payload is only written after a successful GitHub fetch, so a
    failed refresh never destroys cached data. Personal tracking state on
    existing feedback items is preserved across re-syncs.
    """
    now = datetime.now(UTC).isoformat()
    reviews_json = json.dumps(reviews)
    comments_json = json.dumps(comments)

    with closing(get_connection()) as connection, connection:
        journey_row = connection.execute(
            "SELECT id FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not journey_row:
            return None

        connection.execute(
            """
            INSERT INTO journey_pr_reviews (journey_id, reviews_json, comments_json, synced_at_utc)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(journey_id) DO UPDATE SET
                reviews_json = excluded.reviews_json,
                comments_json = excluded.comments_json,
                synced_at_utc = excluded.synced_at_utc
            """,
            (journey_id, reviews_json, comments_json, now),
        )

        imported = 0
        for review in reviews:
            state = str(review.get("gh_state") or review.get("state") or "").upper()
            if state != "CHANGES_REQUESTED":
                continue
            node_id = str(review.get("node_id") or "")
            if not node_id:
                continue
            imported += _upsert_feedback(
                connection,
                journey_id=journey_id,
                source_type="review",
                node_id=node_id,
                gh_state=state,
                author=review.get("author"),
                body_excerpt=review.get("body_excerpt"),
                html_url=review.get("html_url"),
                submitted_at=review.get("submitted_at"),
                now=now,
            )
        for comment in comments:
            node_id = str(comment.get("node_id") or "")
            if not node_id:
                continue
            imported += _upsert_feedback(
                connection,
                journey_id=journey_id,
                source_type="review_comment",
                node_id=node_id,
                gh_state=str(comment.get("gh_state") or comment.get("state") or "COMMENTED"),
                author=comment.get("author"),
                body_excerpt=comment.get("body_excerpt"),
                html_url=comment.get("html_url"),
                submitted_at=comment.get("submitted_at"),
                now=now,
            )

        connection.execute(
            "UPDATE contribution_journeys SET updated_at_utc = ? WHERE id = ?",
            (now, journey_id),
        )
        connection.execute(
            """
            INSERT INTO journey_events (id, journey_id, event_type, description, created_at_utc)
            VALUES (?, ?, 'pr_reviews_synced', ?, ?)
            """,
            (
                str(uuid4()),
                journey_id,
                f"Synced PR review data from GitHub ({len(reviews)} reviews, "
                f"{len(comments)} review comments, {imported} new feedback items).",
                now,
            ),
        )

    return get_journey_detail(journey_id, user_id)


def _upsert_feedback(
    connection: Any,
    *,
    journey_id: str,
    source_type: str,
    node_id: str,
    gh_state: str,
    author: str | None,
    body_excerpt: str | None,
    html_url: str | None,
    submitted_at: str | None,
    now: str,
) -> int:
    existing = connection.execute(
        "SELECT id FROM journey_pr_feedback WHERE journey_id = ? AND gh_node_id = ?",
        (journey_id, node_id),
    ).fetchone()
    if existing:
        connection.execute(
            """
            UPDATE journey_pr_feedback
            SET source_type = ?, gh_state = ?, author = ?, body_excerpt = ?,
                html_url = ?, submitted_at = ?, updated_at_utc = ?
            WHERE journey_id = ? AND gh_node_id = ?
            """,
            (
                source_type,
                gh_state,
                author,
                body_excerpt,
                html_url,
                submitted_at,
                now,
                journey_id,
                node_id,
            ),
        )
        return 0
    connection.execute(
        """
        INSERT INTO journey_pr_feedback (
            id, journey_id, source_type, gh_node_id, gh_state, author,
            body_excerpt, html_url, submitted_at, response_notes, tracking_state,
            created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'open', ?, ?)
        """,
        (
            str(uuid4()),
            journey_id,
            source_type,
            node_id,
            gh_state,
            author,
            body_excerpt,
            html_url,
            submitted_at,
            now,
            now,
        ),
    )
    return 1


def update_feedback_item(
    journey_id: str,
    user_id: str,
    feedback_id: str,
    tracking_state: str | None = None,
    response_notes: str | None = None,
) -> dict[str, Any] | None:
    """Update the personal tracking state / notes of one feedback item."""
    if tracking_state is None and response_notes is None:
        return get_journey_detail(journey_id, user_id)

    if tracking_state is not None and tracking_state not in TRACKING_STATES:
        raise ValueError(f"Invalid tracking state '{tracking_state}'.")

    now = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        owner_check = connection.execute(
            "SELECT id FROM contribution_journeys WHERE id = ? AND user_id = ?",
            (journey_id, user_id),
        ).fetchone()
        if not owner_check:
            return None

        updates: list[str] = []
        params: list[Any] = []
        if tracking_state is not None:
            updates.append("tracking_state = ?")
            params.append(tracking_state)
        if response_notes is not None:
            updates.append("response_notes = ?")
            params.append(response_notes)
        updates.append("updated_at_utc = ?")
        params.append(now)
        params.extend([journey_id, feedback_id])
        cur = connection.execute(
            f"""
            UPDATE journey_pr_feedback
            SET {", ".join(updates)}
            WHERE journey_id = ? AND id = ?
            """,
            tuple(params),
        )
        if cur.rowcount == 0:
            return None
        connection.execute(
            "UPDATE contribution_journeys SET updated_at_utc = ? WHERE id = ?",
            (now, journey_id),
        )
    return get_journey_detail(journey_id, user_id)


def _derive_pr_outcome(row: dict[str, Any]) -> str:
    """Outcome from GitHub-confirmed data only — never from a journey status alone."""
    if not row.get("pr_number"):
        return "no_pr"
    state = row.get("pr_state")
    if state == "merged" or row.get("pr_merged_at"):
        return "merged"
    if state == "closed":
        return "closed_unmerged"
    if state == "open":
        return "open"
    return "unknown"


def list_portfolio_journeys(
    user_id: str,
    *,
    status_filter: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Persisted contribution journeys for the portfolio, filtered and bounded."""
    where = " WHERE j.user_id = ?"
    params: list[Any] = [user_id]
    if status_filter:
        where += " AND j.status = ?"
        params.append(status_filter)
    if search and search.strip():
        like = f"%{search.strip()}%"
        where += " AND (j.repo_full_name LIKE ? OR j.org_slug LIKE ? OR j.title LIKE ?)"
        params.extend([like, like, like])

    with closing(get_connection()) as connection:
        total_row = connection.execute(
            f"SELECT COUNT(*) FROM contribution_journeys j{where}", tuple(params)
        ).fetchone()
        total = int(total_row[0])

        rows = connection.execute(
            f"""
            SELECT j.*,
                (SELECT COUNT(*) FROM journey_checklist_items WHERE journey_id = j.id AND completed = 1) AS checklist_completed_count,
                (SELECT COUNT(*) FROM journey_checklist_items WHERE journey_id = j.id) AS checklist_total_count,
                (SELECT COUNT(*) FROM journey_tasks WHERE journey_id = j.id AND completed = 1) AS tasks_completed_count,
                (SELECT COUNT(*) FROM journey_tasks WHERE journey_id = j.id) AS tasks_total_count,
                jj.lessons_learned AS lessons_learned,
                jj.skills_practiced AS skills_practiced
            FROM contribution_journeys j
            LEFT JOIN journey_journal jj ON jj.journey_id = j.id{where}
            ORDER BY j.created_at_utc DESC
            LIMIT ? OFFSET ?
            """,
            tuple([*params, limit, offset]),
        ).fetchall()

        entries: list[dict[str, Any]] = []
        for row in rows:
            row_dict = dict(row)
            entry = _row_to_summary(row_dict)
            entry["lessons_learned"] = row_dict["lessons_learned"] or ""
            entry["skills_practiced"] = row_dict["skills_practiced"] or ""
            outcome = _derive_pr_outcome(row_dict)
            entry["pr_outcome"] = outcome
            entry["pr_complete"] = outcome == "merged"
            entry["completed_at_utc"] = row_dict["pr_merged_at"] if outcome == "merged" else None
            entries.append(entry)
        return entries, total
