from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import closing
from datetime import UTC, date, datetime, timedelta
from datetime import time as datetime_time
from pathlib import Path
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATABASE_PATH = Path(
    os.environ.get("QUESTLINE_DATABASE_PATH", str(PROJECT_ROOT / "data" / "questline.db"))
)
if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = PROJECT_ROOT / DATABASE_PATH
DATABASE_PATH = DATABASE_PATH.resolve()
DEFAULT_TIMEZONE = "Asia/Kolkata"

logger = logging.getLogger(__name__)

XP_BY_CATEGORY: dict[str, int] = {
    "welcome": 10,
    "learn": 10,
    "explore": 10,
    "practice": 25,
    "build": 25,
    "milestone": 150,
}
XP_ENVIRONMENT_KEYS: dict[str, str] = {
    "welcome": "QUESTLINE_XP_LEARNING",
    "learn": "QUESTLINE_XP_LEARNING",
    "explore": "QUESTLINE_XP_LEARNING",
    "practice": "QUESTLINE_XP_CODING",
    "build": "QUESTLINE_XP_CODING",
    "milestone": "QUESTLINE_XP_MILESTONE",
}
SAFE_DEFAULT_XP = 10

PHASE_SEED: list[dict[str, str | int]] = [
    {
        "id": 1,
        "title": "Foundations",
        "dates": "21 Oct – 3 Nov 2026",
        "description": (
            "Prepare your development environment and learn a confident contribution workflow."
        ),
        "milestone": "Environment ready + a contribution target chosen",
    },
    {
        "id": 2,
        "title": "First meaningful pull request",
        "dates": "4 Nov – 1 Dec 2026",
        "description": "Make a focused fix or improvement and learn from the review process.",
        "milestone": "First meaningful pull request submitted",
    },
    {
        "id": 3,
        "title": "Consistent contributions",
        "dates": "2 – 29 Dec 2026",
        "description": "Grow your project familiarity and build a repeatable contribution habit.",
        "milestone": "A repeatable contribution workflow established",
    },
    {
        "id": 4,
        "title": "Project selection",
        "dates": "30 Dec 2026 – 26 Jan 2027",
        "description": "Compare active projects and mentorship opportunities against your goals.",
        "milestone": "Primary and backup projects shortlisted",
    },
    {
        "id": 5,
        "title": "Proposal preparation",
        "dates": "27 Jan – 23 Feb 2027",
        "description": "Shape a technically grounded proposal and research paid alternatives.",
        "milestone": "Proposal draft ready for feedback",
    },
    {
        "id": 6,
        "title": "Application readiness",
        "dates": "24 Feb – 31 Mar 2027",
        "description": (
            "Finalize applications within verified official windows—never guessed dates."
        ),
        "milestone": "Applications submitted before verified deadlines",
    },
    {
        "id": 7,
        "title": "Follow-up & next steps",
        "dates": "1 – 30 Apr 2027",
        "description": "Stay engaged, strengthen your portfolio, and prepare for what comes next.",
        "milestone": "Portfolio and next-step plan prepared",
    },
]

PHASE_QUEST_SEED: list[tuple[int, int, str]] = [
    (1, 1, "Review Git branching, commits & pull requests"),
    (1, 2, "Practice resolving a small merge conflict"),
    (1, 3, "Set up a Python development environment"),
    (1, 4, "Learn pytest essentials"),
    (1, 5, "Explore OpenVINO's contributor guide"),
    (1, 6, "Choose a first contribution target"),
    (2, 1, "Reproduce a documented issue locally"),
    (2, 2, "Read the relevant implementation and tests"),
    (2, 3, "Write a minimal regression test"),
    (2, 4, "Implement a focused fix"),
    (2, 5, "Respond constructively to maintainer feedback"),
    (3, 1, "Trace an important code path"),
    (3, 2, "Improve a test or documentation section"),
    (3, 3, "Address review comments"),
    (3, 4, "Make a second focused contribution"),
    (4, 1, "Review official program announcements"),
    (4, 2, "Compare project ideas and prerequisites"),
    (4, 3, "Identify maintainers and community channels"),
    (4, 4, "Confirm eligibility against official rules"),
    (5, 1, "Break the project idea into deliverable milestones"),
    (5, 2, "Define the problem and intended impact"),
    (5, 3, "Create a testing and evaluation plan"),
    (5, 4, "Review relevant paid mentorship programs"),
    (6, 1, "Verify the official application window"),
    (6, 2, "Incorporate community feedback"),
    (6, 3, "Check deliverables are realistic"),
    (6, 4, "Save submission confirmation"),
    (7, 1, "Continue addressing contribution feedback"),
    (7, 2, "Practice explaining project trade-offs"),
    (7, 3, "Update your contribution portfolio"),
    (7, 4, "Create a thoughtful fallback plan"),
]

QUEST_SEED: list[dict[str, str | int]] = [
    {
        "id": "welcome",
        "title": "Welcome to your learning journey",
        "description": "Your first step is ready. Take a moment to choose where to begin.",
        "category": "Welcome",
        "minutes": 5,
        "xp": 10,
        "status": "available",
        "phase": "Foundations",
        "date": "Oct 20",
        "sort_index": 1,
    },
    {
        "id": "git-workflow",
        "title": "Review Git branching, commits & pull requests",
        "description": (
            "Refresh the everyday workflow you'll use to make a clean first contribution."
        ),
        "category": "Learn",
        "minutes": 20,
        "xp": 10,
        "status": "current",
        "phase": "Foundations",
        "date": "Today",
        "sort_index": 2,
    },
    {
        "id": "merge-conflict",
        "title": "Practice resolving a small merge conflict",
        "description": "Create a tiny conflict and work through it with confidence.",
        "category": "Practice",
        "minutes": 25,
        "xp": 25,
        "status": "available",
        "phase": "Foundations",
        "date": "Today",
        "sort_index": 3,
    },
    {
        "id": "python-env",
        "title": "Set up your Python development environment",
        "description": "Get a repeatable local setup ready for open-source work.",
        "category": "Build",
        "minutes": 30,
        "xp": 25,
        "status": "available",
        "phase": "Foundations",
        "date": "Oct 22",
        "sort_index": 4,
    },
    {
        "id": "pytest",
        "title": "Learn the pytest essentials",
        "description": "Run tests, understand failures, and write one small assertion.",
        "category": "Learn",
        "minutes": 25,
        "xp": 10,
        "status": "available",
        "phase": "Foundations",
        "date": "Oct 23",
        "sort_index": 5,
    },
    {
        "id": "openvino",
        "title": "Explore OpenVINO's contributor guide",
        "description": "Get familiar with project setup, guidelines, and test commands.",
        "category": "Explore",
        "minutes": 30,
        "xp": 10,
        "status": "available",
        "phase": "Foundations",
        "date": "Oct 24",
        "sort_index": 6,
    },
    {
        "id": "first-issue",
        "title": "Choose a first contribution target",
        "description": "Find three beginner-accessible issues and pick one to investigate.",
        "category": "Milestone",
        "minutes": 35,
        "xp": 30,
        "status": "available",
        "phase": "Foundations",
        "date": "Oct 27",
        "sort_index": 7,
    },
    {
        "id": "first-pr",
        "title": "Send your first meaningful pull request",
        "description": "Build on your preparation with a focused, reviewable change.",
        "category": "Locked",
        "minutes": 45,
        "xp": 50,
        "status": "locked",
        "phase": "First meaningful pull request",
        "date": "Nov 4",
        "sort_index": 8,
    },
]


def get_connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _user_filter(
    user_id: str | None, alias: str | None = None
) -> tuple[str, tuple[Any, ...]]:
    """Returns SQL WHERE condition fragment and parameter tuple for user scoping.

    `alias` qualifies the user_id column with a table alias, which is required
    in joins where more than one table has a user_id column.
    """
    column = f"{alias}.user_id" if alias else "user_id"
    if user_id:
        return f"{column} = ?", (user_id,)
    return f"({column} IS NULL OR {column} = 'guest')", ()


def _migrate_multi_user_tables(connection: sqlite3.Connection) -> None:
    """Migrate single-tenant SQLite tables to multi-tenant schema with composite constraints.

    If tables were created under the legacy single-tenant schema (e.g. quest_id UNIQUE,
    quest_id PRIMARY KEY, week_start UNIQUE, or singleton_id CHECK = 1), SQLite requires
    recreating the tables to modify those constraints so multiple users can complete the
    same quests, write weekly reviews, and save distinct settings.
    """
    tables = [
        "quest_completions",
        "quest_work_state",
        "xp_ledger",
        "weekly_reviews",
        "deadlines",
        "user_settings",
    ]

    # 1. First ensure user_id column exists on all tables
    for table in tables:
        try:
            columns = {
                row["name"]
                for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
            }
            if columns and "user_id" not in columns:
                connection.execute(
                    f"ALTER TABLE {table} ADD COLUMN user_id TEXT NOT NULL DEFAULT 'guest'"
                )
        except Exception:
            logger.exception("Could not add user_id column to %s", table)

    # 2. Check and migrate xp_ledger FIRST: with PRAGMA foreign_keys = ON, the
    # legacy xp_ledger -> quest_completions foreign key blocks dropping the
    # legacy quest_completions table, so the child must be recreated/dropped
    # before its parent.
    try:
        row = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='xp_ledger'"
        ).fetchone()
        if row and row["sql"]:
            sql_upper = row["sql"].upper()
            if "COMPLETION_ID TEXT NOT NULL UNIQUE" in sql_upper or "UNIQUE (COMPLETION_ID)" in sql_upper or "UNIQUE(COMPLETION_ID)" in sql_upper:
                connection.execute("DROP TABLE IF EXISTS xp_ledger_migrated")
                connection.execute("""
                    CREATE TABLE xp_ledger_migrated (
                        id TEXT PRIMARY KEY,
                        completion_id TEXT NOT NULL,
                        quest_id TEXT NOT NULL REFERENCES quests(id),
                        points INTEGER NOT NULL CHECK (points >= 0),
                        reason TEXT NOT NULL,
                        awarded_at_utc TEXT NOT NULL,
                        user_id TEXT NOT NULL DEFAULT 'guest'
                    )
                """)
                connection.execute("""
                    INSERT INTO xp_ledger_migrated (id, completion_id, quest_id, points, reason, awarded_at_utc, user_id)
                    SELECT id, completion_id, quest_id, points, reason, awarded_at_utc, COALESCE(user_id, 'guest')
                    FROM xp_ledger
                """)
                connection.execute("DROP TABLE xp_ledger")
                connection.execute("ALTER TABLE xp_ledger_migrated RENAME TO xp_ledger")
    except Exception:
        logger.exception("Could not migrate xp_ledger to the multi-user schema")

    # 3. Check and migrate quest_completions if legacy UNIQUE(quest_id) exists
    try:
        row = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='quest_completions'"
        ).fetchone()
        if row and row["sql"]:
            sql_upper = row["sql"].upper()
            if "QUEST_ID TEXT NOT NULL UNIQUE" in sql_upper or "UNIQUE (QUEST_ID)" in sql_upper or "UNIQUE(QUEST_ID)" in sql_upper:
                connection.execute("DROP TABLE IF EXISTS quest_completions_migrated")
                connection.execute("""
                    CREATE TABLE quest_completions_migrated (
                        id TEXT PRIMARY KEY,
                        quest_id TEXT NOT NULL REFERENCES quests(id),
                        completed_at_utc TEXT NOT NULL,
                        local_date TEXT NOT NULL,
                        xp_awarded INTEGER NOT NULL CHECK (xp_awarded >= 0),
                        user_id TEXT NOT NULL DEFAULT 'guest'
                    )
                """)
                connection.execute("""
                    INSERT INTO quest_completions_migrated (id, quest_id, completed_at_utc, local_date, xp_awarded, user_id)
                    SELECT id, quest_id, completed_at_utc, local_date, xp_awarded, COALESCE(user_id, 'guest')
                    FROM quest_completions
                """)
                connection.execute("DROP TABLE quest_completions")
                connection.execute("ALTER TABLE quest_completions_migrated RENAME TO quest_completions")
    except Exception:
        logger.exception("Could not migrate quest_completions to the multi-user schema")

    # 4. Check and migrate quest_work_state if legacy PRIMARY KEY(quest_id) exists
    try:
        row = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='quest_work_state'"
        ).fetchone()
        if row and row["sql"]:
            sql_upper = row["sql"].upper()
            if "QUEST_ID TEXT PRIMARY KEY" in sql_upper or "PRIMARY KEY (QUEST_ID)" in sql_upper or "PRIMARY KEY(QUEST_ID)" in sql_upper:
                connection.execute("DROP TABLE IF EXISTS quest_work_state_migrated")
                connection.execute("""
                    CREATE TABLE quest_work_state_migrated (
                        quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
                        status TEXT NOT NULL CHECK (status = 'in_progress'),
                        notes TEXT NOT NULL DEFAULT '',
                        evidence_url TEXT,
                        checked_steps_json TEXT NOT NULL DEFAULT '[]',
                        updated_at_utc TEXT NOT NULL,
                        user_id TEXT NOT NULL DEFAULT 'guest',
                        PRIMARY KEY (user_id, quest_id)
                    )
                """)
                connection.execute("""
                    INSERT INTO quest_work_state_migrated (quest_id, status, notes, evidence_url, checked_steps_json, updated_at_utc, user_id)
                    SELECT quest_id, status, notes, evidence_url, checked_steps_json, updated_at_utc, COALESCE(user_id, 'guest')
                    FROM quest_work_state
                """)
                connection.execute("DROP TABLE quest_work_state")
                connection.execute("ALTER TABLE quest_work_state_migrated RENAME TO quest_work_state")
    except Exception:
        logger.exception("Could not migrate quest_work_state to the multi-user schema")

    # 5. Check and migrate weekly_reviews if legacy UNIQUE(week_start) exists
    try:
        row = connection.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='weekly_reviews'"
        ).fetchone()
        if row and row["sql"]:
            sql_upper = row["sql"].upper()
            if "WEEK_START TEXT NOT NULL UNIQUE" in sql_upper or "UNIQUE (WEEK_START)" in sql_upper or "UNIQUE(WEEK_START)" in sql_upper:
                connection.execute("DROP TABLE IF EXISTS weekly_reviews_migrated")
                connection.execute("""
                    CREATE TABLE weekly_reviews_migrated (
                        id TEXT PRIMARY KEY,
                        week_start TEXT NOT NULL,
                        week_end TEXT NOT NULL,
                        accomplishments TEXT NOT NULL,
                        challenges TEXT NOT NULL,
                        lessons_learned TEXT NOT NULL,
                        next_priorities TEXT NOT NULL,
                        created_at_utc TEXT NOT NULL,
                        updated_at_utc TEXT NOT NULL,
                        user_id TEXT NOT NULL DEFAULT 'guest',
                        CHECK (week_end = date(week_start, '+6 days'))
                    )
                """)
                connection.execute("""
                    INSERT INTO weekly_reviews_migrated (id, week_start, week_end, accomplishments, challenges, lessons_learned, next_priorities, created_at_utc, updated_at_utc, user_id)
                    SELECT id, week_start, week_end, accomplishments, challenges, lessons_learned, next_priorities, created_at_utc, updated_at_utc, COALESCE(user_id, 'guest')
                    FROM weekly_reviews
                """)
                connection.execute("DROP TABLE weekly_reviews")
                connection.execute("ALTER TABLE weekly_reviews_migrated RENAME TO weekly_reviews")
    except Exception:
        logger.exception("Could not migrate weekly_reviews to the multi-user schema")

    # 6. Check and migrate user_settings if legacy singleton_id exists
    try:
        columns = {
            r["name"] for r in connection.execute("PRAGMA table_info(user_settings)").fetchall()
        }
        if "singleton_id" in columns:
            connection.execute("DROP TABLE IF EXISTS user_settings_migrated")
            connection.execute("""
                CREATE TABLE user_settings_migrated (
                    user_id TEXT PRIMARY KEY,
                    daily_goal_minutes INTEGER NOT NULL CHECK (daily_goal_minutes IN (30, 45, 60, 90)),
                    timezone TEXT NOT NULL,
                    reminders_enabled INTEGER NOT NULL CHECK (reminders_enabled IN (0, 1)),
                    celebrations_enabled INTEGER NOT NULL CHECK (celebrations_enabled IN (0, 1)),
                    updated_at_utc TEXT
                )
            """)
            connection.execute("""
                INSERT INTO user_settings_migrated (user_id, daily_goal_minutes, timezone, reminders_enabled, celebrations_enabled, updated_at_utc)
                SELECT 'guest', daily_goal_minutes, timezone, reminders_enabled, celebrations_enabled, updated_at_utc
                FROM user_settings
            """)
            connection.execute("DROP TABLE user_settings")
            connection.execute("ALTER TABLE user_settings_migrated RENAME TO user_settings")
    except Exception:
        logger.exception("Could not migrate user_settings to the multi-user schema")


def get_configured_timezone(user_id: str | None = None) -> ZoneInfo:
    configured_name = os.environ.get("QUESTLINE_TIMEZONE", DEFAULT_TIMEZONE)
    try:
        where_clause, params = _user_filter(user_id)
        with closing(get_connection()) as connection:
            row = connection.execute(
                f"SELECT timezone FROM user_settings WHERE {where_clause} LIMIT 1",
                params,
            ).fetchone()
        if row is not None:
            configured_name = row["timezone"]
    except sqlite3.OperationalError as error:
        if "no such table" not in str(error) and "no such column" not in str(error):
            raise
    return ZoneInfo(configured_name)


def get_xp_reward(category: str) -> int:
    normalized = category.casefold()
    default = XP_BY_CATEGORY.get(normalized, SAFE_DEFAULT_XP)
    key = XP_ENVIRONMENT_KEYS.get(normalized)
    reward = int(os.environ.get(key, str(default))) if key else default
    if reward < 0:
        raise ValueError("XP rewards cannot be negative.")
    return reward


def initialize_database() -> None:
    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS phases (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL UNIQUE,
                dates TEXT NOT NULL,
                description TEXT NOT NULL,
                milestone TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS quests (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                minutes INTEGER NOT NULL,
                xp INTEGER NOT NULL,
                status TEXT NOT NULL,
                phase TEXT NOT NULL,
                date TEXT NOT NULL,
                sort_index INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS phase_quests (
                phase_id INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
                sort_index INTEGER NOT NULL,
                title TEXT NOT NULL,
                PRIMARY KEY (phase_id, sort_index)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS quest_completions (
                id TEXT PRIMARY KEY,
                quest_id TEXT NOT NULL REFERENCES quests(id),
                completed_at_utc TEXT NOT NULL,
                local_date TEXT NOT NULL,
                xp_awarded INTEGER NOT NULL CHECK (xp_awarded >= 0),
                user_id TEXT NOT NULL DEFAULT 'guest'
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS quest_work_state (
                quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
                status TEXT NOT NULL CHECK (status = 'in_progress'),
                notes TEXT NOT NULL DEFAULT '',
                evidence_url TEXT,
                checked_steps_json TEXT NOT NULL DEFAULT '[]',
                updated_at_utc TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'guest'
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS xp_ledger (
                id TEXT PRIMARY KEY,
                completion_id TEXT NOT NULL,
                quest_id TEXT NOT NULL REFERENCES quests(id),
                points INTEGER NOT NULL CHECK (points >= 0),
                reason TEXT NOT NULL,
                awarded_at_utc TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'guest'
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS weekly_reviews (
                id TEXT PRIMARY KEY,
                week_start TEXT NOT NULL,
                week_end TEXT NOT NULL,
                accomplishments TEXT NOT NULL,
                challenges TEXT NOT NULL,
                lessons_learned TEXT NOT NULL,
                next_priorities TEXT NOT NULL,
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'guest',
                CHECK (week_end = date(week_start, '+6 days'))
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS deadlines (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                due_date TEXT NOT NULL,
                due_time TEXT,
                category TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
                url TEXT,
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'guest'
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id TEXT PRIMARY KEY,
                daily_goal_minutes INTEGER NOT NULL
                    CHECK (daily_goal_minutes IN (30, 45, 60, 90)),
                timezone TEXT NOT NULL,
                reminders_enabled INTEGER NOT NULL CHECK (reminders_enabled IN (0, 1)),
                celebrations_enabled INTEGER NOT NULL
                    CHECK (celebrations_enabled IN (0, 1)),
                updated_at_utc TEXT
            )
            """
        )

        _migrate_multi_user_tables(connection)

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_deadlines_due_date
            ON deadlines(due_date, due_time)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_completions_local_date
            ON quest_completions(local_date)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_xp_ledger_awarded_at
            ON xp_ledger(awarded_at_utc)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_completions_user_quest
            ON quest_completions(user_id, quest_id)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_work_state_user_quest
            ON quest_work_state(user_id, quest_id)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_reviews_user_week
            ON weekly_reviews(user_id, week_start)
            """
        )
        # Enforce per-user week uniqueness for weekly reviews (restores the old
        # single-tenant week_start UNIQUE guarantee, scoped to each account).
        duplicate_review = connection.execute(
            """
            SELECT user_id, week_start FROM weekly_reviews
            GROUP BY user_id, week_start HAVING COUNT(*) > 1 LIMIT 1
            """
        ).fetchone()
        if duplicate_review is None:
            connection.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_week_unique
                ON weekly_reviews(user_id, week_start)
                """
            )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_deadlines_user
            ON deadlines(user_id)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_xp_ledger_user
            ON xp_ledger(user_id)
            """
        )

        connection.executemany(
            """
            INSERT OR IGNORE INTO phases (id, title, dates, description, milestone)
            VALUES (:id, :title, :dates, :description, :milestone)
            """,
            PHASE_SEED,
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO quests (
                id, title, description, category, minutes, xp, status, phase, date, sort_index
            ) VALUES (
                :id, :title, :description, :category, :minutes, :xp, :status, :phase,
                :date, :sort_index
            )
            """,
            QUEST_SEED,
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO phase_quests (phase_id, sort_index, title)
            VALUES (?, ?, ?)
            """,
            PHASE_QUEST_SEED,
        )


def complete_quest(
    quest_id: str,
    *,
    user_id: str | None = None,
    now_utc: datetime | None = None,
) -> dict[str, Any] | None:
    moment = now_utc or datetime.now(UTC)
    if moment.tzinfo is None:
        raise ValueError("Completion timestamp must include a timezone.")
    moment = moment.astimezone(UTC)
    completed_at = moment.isoformat()
    local_date = moment.astimezone(get_configured_timezone(user_id)).date().isoformat()
    effective_user_id = user_id or "guest"
    where_clause, params = _user_filter(user_id)

    with closing(get_connection()) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        quest_row = connection.execute(
            """
            SELECT id, title, description, category, minutes, xp, status, phase, date
            FROM quests WHERE id = ?
            """,
            (quest_id,),
        ).fetchone()
        if quest_row is None:
            return None

        completion = connection.execute(
            f"""
            SELECT id, completed_at_utc, local_date, xp_awarded
            FROM quest_completions WHERE quest_id = ? AND {where_clause}
            """,
            (quest_id, *params),
        ).fetchone()
        if completion is None:
            if quest_row["status"] == "locked":
                raise ValueError("This quest is locked and cannot be completed.")

            reward = get_xp_reward(quest_row["category"])
            completion_id = str(uuid4())
            connection.execute(
                """
                INSERT INTO quest_completions
                    (id, quest_id, completed_at_utc, local_date, xp_awarded, user_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (completion_id, quest_id, completed_at, local_date, reward, effective_user_id),
            )
            connection.execute(
                """
                INSERT INTO xp_ledger
                    (id, completion_id, quest_id, points, reason, awarded_at_utc, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    completion_id,
                    quest_id,
                    reward,
                    f"Quest completion: {quest_row['title']}",
                    completed_at,
                    effective_user_id,
                ),
            )
            connection.execute(
                f"DELETE FROM quest_work_state WHERE quest_id = ? AND {where_clause}",
                (quest_id, *params),
            )
            completion = {
                "id": completion_id,
                "completed_at_utc": completed_at,
                "local_date": local_date,
                "xp_awarded": reward,
            }
            already_completed = False
        else:
            already_completed = True

        total_xp = connection.execute(
            f"SELECT COALESCE(SUM(points), 0) FROM xp_ledger WHERE {where_clause}",
            params,
        ).fetchone()[0]
        quest = dict(quest_row)
        quest["status"] = "completed"
        quest["xp"] = completion["xp_awarded"]
        return {
            "quest": quest,
            "completion": dict(completion),
            "total_xp": total_xp,
            "already_completed": already_completed,
        }


def list_quests(user_id: str | None = None) -> list[dict[str, Any]]:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT id, title, description, category, minutes, xp, status, phase, date, sort_index
            FROM quests ORDER BY sort_index ASC
            """
        ).fetchall()
        completions = {
            r["quest_id"]: r["xp_awarded"]
            for r in connection.execute(
                f"SELECT quest_id, xp_awarded FROM quest_completions WHERE {where_clause}",
                params,
            ).fetchall()
        }
        in_progress = {
            r["quest_id"]
            for r in connection.execute(
                f"SELECT quest_id FROM quest_work_state WHERE status = 'in_progress' AND {where_clause}",
                params,
            ).fetchall()
        }
        quests = []
        for row in rows:
            quest = dict(row)
            quest["xp"] = get_xp_reward(quest["category"])
            qid = quest["id"]
            if qid in completions:
                quest["status"] = "completed"
                quest["xp"] = completions[qid]
            elif qid in in_progress and quest["status"] != "locked":
                quest["status"] = "current"
            quests.append(quest)

        # Per-user quest advancement: when the quest seeded as 'current' is
        # completed by this user, promote the next available quest to 'current'.
        # Computed per user instead of mutating the shared quests table so
        # different users' views stay isolated.
        seeded_current = next((row for row in rows if row["status"] == "current"), None)
        if seeded_current is not None and seeded_current["id"] in completions:
            for quest in quests:
                if (
                    quest["sort_index"] > seeded_current["sort_index"]
                    and quest["id"] not in completions
                    and quest["id"] not in in_progress
                    and quest["status"] == "available"
                ):
                    quest["status"] = "current"
                    break
        return quests


def get_quest_work(quest_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        quest_exists = connection.execute(
            "SELECT 1 FROM quests WHERE id = ?", (quest_id,)
        ).fetchone()
        if quest_exists is None:
            return None
        row = connection.execute(
            f"""
            SELECT status, notes, evidence_url, checked_steps_json, updated_at_utc
            FROM quest_work_state WHERE quest_id = ? AND {where_clause}
            """,
            (quest_id, *params),
        ).fetchone()
    if row is None:
        return {
            "quest_id": quest_id,
            "status": "not_started",
            "notes": "",
            "evidence_url": None,
            "checked_steps": [],
            "updated_at_utc": None,
        }
    return {
        "quest_id": quest_id,
        "status": row["status"],
        "notes": row["notes"],
        "evidence_url": row["evidence_url"],
        "checked_steps": json.loads(row["checked_steps_json"]),
        "updated_at_utc": row["updated_at_utc"],
    }


def save_quest_work(
    quest_id: str, values: dict[str, Any], user_id: str | None = None
) -> dict[str, Any] | None:
    updated_at = datetime.now(UTC).isoformat()
    effective_user_id = user_id or "guest"
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection, connection:
        quest = connection.execute(
            "SELECT status FROM quests WHERE id = ?", (quest_id,)
        ).fetchone()
        if quest is None:
            return None
        if quest["status"] == "locked":
            raise ValueError("This quest is locked and cannot be started.")

        existing = connection.execute(
            f"SELECT 1 FROM quest_work_state WHERE quest_id = ? AND {where_clause}",
            (quest_id, *params),
        ).fetchone()
        if existing is not None:
            connection.execute(
                f"""
                UPDATE quest_work_state
                SET notes = ?, evidence_url = ?, checked_steps_json = ?, updated_at_utc = ?
                WHERE quest_id = ? AND {where_clause}
                """,
                (
                    values["notes"],
                    values["evidence_url"],
                    json.dumps(values["checked_steps"]),
                    updated_at,
                    quest_id,
                    *params,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO quest_work_state (
                    quest_id, status, notes, evidence_url, checked_steps_json, updated_at_utc, user_id
                ) VALUES (?, 'in_progress', ?, ?, ?, ?, ?)
                """,
                (
                    quest_id,
                    values["notes"],
                    values["evidence_url"],
                    json.dumps(values["checked_steps"]),
                    updated_at,
                    effective_user_id,
                ),
            )
    return get_quest_work(quest_id, user_id)


def get_progress(user_id: str | None = None) -> dict[str, int]:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        total_xp = connection.execute(
            f"SELECT COALESCE(SUM(points), 0) FROM xp_ledger WHERE {where_clause}",
            params,
        ).fetchone()[0]
        completed_count = connection.execute(
            f"SELECT COUNT(*) FROM quest_completions WHERE {where_clause}",
            params,
        ).fetchone()[0]
        total_quests = connection.execute("SELECT COUNT(*) FROM quests").fetchone()[0]
    return {
        "total_xp": total_xp,
        "completed_quests": completed_count,
        "total_quests": total_quests,
    }


def get_settings(user_id: str | None = None) -> dict[str, Any]:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        row = connection.execute(
            f"""
            SELECT daily_goal_minutes, timezone, reminders_enabled,
                   celebrations_enabled, updated_at_utc
            FROM user_settings
            WHERE {where_clause} LIMIT 1
            """,
            params,
        ).fetchone()

    if row is None:
        return {
            "daily_goal_minutes": 45,
            "timezone": ZoneInfo(
                os.environ.get("QUESTLINE_TIMEZONE", DEFAULT_TIMEZONE)
            ).key,
            "reminders_enabled": True,
            "celebrations_enabled": True,
            "updated_at_utc": None,
        }
    return {
        "daily_goal_minutes": row["daily_goal_minutes"],
        "timezone": row["timezone"],
        "reminders_enabled": bool(row["reminders_enabled"]),
        "celebrations_enabled": bool(row["celebrations_enabled"]),
        "updated_at_utc": row["updated_at_utc"],
    }


def save_settings(values: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    updated_at = datetime.now(UTC).isoformat()
    effective_user_id = user_id or "guest"
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection, connection:
        existing = connection.execute(
            f"SELECT 1 FROM user_settings WHERE {where_clause} LIMIT 1",
            params,
        ).fetchone()
        if existing is not None:
            connection.execute(
                f"""
                UPDATE user_settings
                SET daily_goal_minutes = ?, timezone = ?, reminders_enabled = ?,
                    celebrations_enabled = ?, updated_at_utc = ?
                WHERE {where_clause}
                """,
                (
                    values["daily_goal_minutes"],
                    values["timezone"],
                    int(values["reminders_enabled"]),
                    int(values["celebrations_enabled"]),
                    updated_at,
                    *params,
                ),
            )
        else:
            connection.execute(
                """
                INSERT INTO user_settings (
                    user_id, daily_goal_minutes, timezone, reminders_enabled,
                    celebrations_enabled, updated_at_utc
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    effective_user_id,
                    values["daily_goal_minutes"],
                    values["timezone"],
                    int(values["reminders_enabled"]),
                    int(values["celebrations_enabled"]),
                    updated_at,
                ),
            )
    return get_settings(user_id)


def get_activity_history(
    days: int = 30, user_id: str | None = None, *, today: date | None = None
) -> dict[str, Any]:
    if not 1 <= days <= 366:
        raise ValueError("Activity history must include between 1 and 366 days.")
    local_today = today or datetime.now(get_configured_timezone(user_id)).date()
    start_date = local_today - timedelta(days=days - 1)
    start_text = start_date.isoformat()
    end_text = local_today.isoformat()
    where_clause, params = _user_filter(user_id)
    ledger_where, _ = _user_filter(user_id, alias="ledger")

    with closing(get_connection()) as connection:
        rows = connection.execute(
            f"""
            WITH completion_totals AS (
                SELECT local_date, COUNT(*) AS quests_completed
                FROM quest_completions
                WHERE local_date BETWEEN ? AND ? AND {where_clause}
                GROUP BY local_date
            ),
            xp_totals AS (
                SELECT completions.local_date, SUM(ledger.points) AS xp_earned
                FROM xp_ledger AS ledger
                JOIN quest_completions AS completions
                    ON completions.id = ledger.completion_id
                WHERE completions.local_date BETWEEN ? AND ? AND {ledger_where}
                GROUP BY completions.local_date
            )
            SELECT completion_totals.local_date AS activity_date,
                   completion_totals.quests_completed,
                   COALESCE(xp_totals.xp_earned, 0) AS xp_earned
            FROM completion_totals
            LEFT JOIN xp_totals
                ON xp_totals.local_date = completion_totals.local_date
            ORDER BY completion_totals.local_date ASC
            """,
            (start_text, end_text, *params, start_text, end_text, *params),
        ).fetchall()

    activity_by_date = {
        row["activity_date"]: {
            "quests_completed": row["quests_completed"],
            "xp_earned": row["xp_earned"],
        }
        for row in rows
    }
    activity_days: list[dict[str, Any]] = []
    for offset in range(days):
        activity_date = start_date + timedelta(days=offset)
        values = activity_by_date.get(
            activity_date.isoformat(), {"quests_completed": 0, "xp_earned": 0}
        )
        activity_days.append(
            {
                "date": activity_date.isoformat(),
                **values,
                "has_activity": values["quests_completed"] > 0,
            }
        )

    return {
        "start_date": start_text,
        "end_date": end_text,
        "timezone": get_configured_timezone(user_id).key,
        "days": activity_days,
        "totals": {
            "quests_completed": sum(day["quests_completed"] for day in activity_days),
            "xp_earned": sum(day["xp_earned"] for day in activity_days),
            "active_days": sum(day["has_activity"] for day in activity_days),
        },
    }


def list_xp_history(user_id: str | None = None) -> list[dict[str, Any]]:
    where_clause, params = _user_filter(user_id, alias="ledger")
    with closing(get_connection()) as connection:
        rows = connection.execute(
            f"""
            SELECT ledger.id, ledger.quest_id, quests.title AS quest_title,
                   ledger.points, ledger.reason, ledger.awarded_at_utc
            FROM xp_ledger AS ledger
            JOIN quests ON quests.id = ledger.quest_id
            WHERE {where_clause}
            ORDER BY ledger.awarded_at_utc DESC, ledger.id DESC
            """,
            params,
        ).fetchall()
        return [dict(row) for row in rows]


def list_activity_dates(user_id: str | None = None) -> list[str]:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        rows = connection.execute(
            f"SELECT DISTINCT local_date FROM quest_completions WHERE {where_clause} ORDER BY local_date ASC",
            params,
        ).fetchall()
        return [row["local_date"] for row in rows]


def calculate_streaks(activity_dates: list[str], today: date) -> dict[str, int]:
    active_days = sorted({date.fromisoformat(value) for value in activity_dates})
    active_set = set(active_days)
    current_day = today if today in active_set else today - timedelta(days=1)
    current_streak = 0
    while current_day in active_set:
        current_streak += 1
        current_day -= timedelta(days=1)

    longest_streak = 0
    streak = 0
    previous_day: date | None = None
    for active_day in active_days:
        is_consecutive = previous_day is not None and active_day == previous_day + timedelta(days=1)
        streak = streak + 1 if is_consecutive else 1
        longest_streak = max(longest_streak, streak)
        previous_day = active_day

    return {"current_streak": current_streak, "longest_streak": longest_streak}


def get_streaks(user_id: str | None = None, *, now_utc: datetime | None = None) -> dict[str, int | str]:
    moment = now_utc or datetime.now(UTC)
    if moment.tzinfo is None:
        raise ValueError("Streak calculation timestamp must include a timezone.")
    local_today = moment.astimezone(get_configured_timezone(user_id)).date()
    return {
        **calculate_streaks(list_activity_dates(user_id), local_today),
        "timezone": get_configured_timezone(user_id).key,
    }


def list_roadmap_phases() -> list[dict[str, Any]]:
    with closing(get_connection()) as connection:
        phase_rows = connection.execute(
            "SELECT id, title, dates, description, milestone FROM phases ORDER BY id ASC"
        ).fetchall()
        quest_rows = connection.execute(
            "SELECT phase_id, title FROM phase_quests ORDER BY phase_id, sort_index"
        ).fetchall()

    phase_quests: dict[int, list[str]] = {}
    for row in quest_rows:
        phase_quests.setdefault(row["phase_id"], []).append(row["title"])

    return [
        {
            "id": row["id"],
            "title": row["title"],
            "dates": row["dates"],
            "description": row["description"],
            "milestone": row["milestone"],
            "quests": phase_quests.get(row["id"], []),
        }
        for row in phase_rows
    ]


def current_week_start(*, today: date | None = None) -> date:
    local_today = today or datetime.now(get_configured_timezone()).date()
    return local_today - timedelta(days=local_today.weekday())


def list_weekly_reviews(user_id: str | None = None) -> list[dict[str, Any]]:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        rows = connection.execute(
            f"SELECT * FROM weekly_reviews WHERE {where_clause} ORDER BY week_start DESC",
            params,
        ).fetchall()
        return [dict(row) for row in rows]


def get_weekly_review(review_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        row = connection.execute(
            f"SELECT * FROM weekly_reviews WHERE id = ? AND {where_clause}",
            (review_id, *params),
        ).fetchone()
        return dict(row) if row is not None else None


def get_current_weekly_review(
    user_id: str | None = None, *, today: date | None = None
) -> dict[str, Any] | None:
    week_start = current_week_start(today=today).isoformat()
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        row = connection.execute(
            f"SELECT * FROM weekly_reviews WHERE week_start = ? AND {where_clause}",
            (week_start, *params),
        ).fetchone()
        return dict(row) if row is not None else None


def create_weekly_review(values: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    review_id = str(uuid4())
    timestamp = datetime.now(UTC).isoformat()
    effective_user_id = user_id or "guest"
    try:
        with closing(get_connection()) as connection, connection:
            connection.execute(
                """
                INSERT INTO weekly_reviews (
                    id, week_start, week_end, accomplishments, challenges,
                    lessons_learned, next_priorities, created_at_utc, updated_at_utc, user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    review_id,
                    values["week_start"],
                    values["week_end"],
                    values["accomplishments"],
                    values["challenges"],
                    values["lessons_learned"],
                    values["next_priorities"],
                    timestamp,
                    timestamp,
                    effective_user_id,
                ),
            )
    except sqlite3.IntegrityError as error:
        if "weekly_reviews" in str(error) and ("week_start" in str(error) or "UNIQUE" in str(error)):
            raise ValueError("A review for this week already exists.") from error
        raise
    result = get_weekly_review(review_id, user_id)
    if result is None:
        raise RuntimeError("Created weekly review could not be retrieved.")
    return result


def update_weekly_review(
    review_id: str, values: dict[str, Any], user_id: str | None = None
) -> dict[str, Any] | None:
    timestamp = datetime.now(UTC).isoformat()
    where_clause, params = _user_filter(user_id)
    try:
        with closing(get_connection()) as connection, connection:
            cursor = connection.execute(
                f"""
                UPDATE weekly_reviews
                SET week_start = ?, week_end = ?, accomplishments = ?, challenges = ?,
                    lessons_learned = ?, next_priorities = ?, updated_at_utc = ?
                WHERE id = ? AND {where_clause}
                """,
                (
                    values["week_start"],
                    values["week_end"],
                    values["accomplishments"],
                    values["challenges"],
                    values["lessons_learned"],
                    values["next_priorities"],
                    timestamp,
                    review_id,
                    *params,
                ),
            )
            if cursor.rowcount == 0:
                return None
    except sqlite3.IntegrityError as error:
        if "weekly_reviews" in str(error) and ("week_start" in str(error) or "UNIQUE" in str(error)):
            raise ValueError("A review for this week already exists.") from error
        raise
    return get_weekly_review(review_id, user_id)


def _deadline_with_classification(
    row: sqlite3.Row | dict[str, Any], local_now: datetime
) -> dict[str, Any]:
    result = dict(row)
    due_date = date.fromisoformat(result["due_date"])
    is_overdue = due_date < local_now.date()
    if due_date == local_now.date() and result["due_time"] is not None:
        due_time = datetime_time.fromisoformat(result["due_time"])
        is_overdue = datetime.combine(due_date, due_time, tzinfo=local_now.tzinfo) < local_now
    result["classification"] = (
        "completed"
        if result["status"] == "completed"
        else "overdue"
        if is_overdue
        else "upcoming"
    )
    return result


def list_deadlines(
    user_id: str | None = None, *, now_local: datetime | None = None
) -> list[dict[str, Any]]:
    local_now = now_local or datetime.now(get_configured_timezone(user_id))
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        rows = connection.execute(
            f"SELECT * FROM deadlines WHERE {where_clause} ORDER BY due_date, due_time, title",
            params,
        ).fetchall()
        return [_deadline_with_classification(row, local_now) for row in rows]


def get_deadline(
    deadline_id: str, user_id: str | None = None, *, now_local: datetime | None = None
) -> dict[str, Any] | None:
    local_now = now_local or datetime.now(get_configured_timezone(user_id))
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        row = connection.execute(
            f"SELECT * FROM deadlines WHERE id = ? AND {where_clause}",
            (deadline_id, *params),
        ).fetchone()
        return _deadline_with_classification(row, local_now) if row is not None else None


def create_deadline(values: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    deadline_id = str(uuid4())
    timestamp = datetime.now(UTC).isoformat()
    effective_user_id = user_id or "guest"
    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            INSERT INTO deadlines (
                id, title, description, due_date, due_time, category, status, url,
                created_at_utc, updated_at_utc, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
            """,
            (
                deadline_id,
                values["title"],
                values["description"],
                values["due_date"],
                values["due_time"],
                values["category"],
                values["url"],
                timestamp,
                timestamp,
                effective_user_id,
            ),
        )
    result = get_deadline(deadline_id, user_id)
    if result is None:
        raise RuntimeError("Created deadline could not be retrieved.")
    return result


def update_deadline(
    deadline_id: str, values: dict[str, Any], user_id: str | None = None
) -> dict[str, Any] | None:
    timestamp = datetime.now(UTC).isoformat()
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection, connection:
        cursor = connection.execute(
            f"""
            UPDATE deadlines
            SET title = ?, description = ?, due_date = ?, due_time = ?, category = ?,
                status = ?, url = ?, updated_at_utc = ?
            WHERE id = ? AND {where_clause}
            """,
            (
                values["title"],
                values["description"],
                values["due_date"],
                values["due_time"],
                values["category"],
                values["status"],
                values["url"],
                timestamp,
                deadline_id,
                *params,
            ),
        )
        if cursor.rowcount == 0:
            return None
    return get_deadline(deadline_id, user_id)


def delete_deadline(deadline_id: str, user_id: str | None = None) -> bool:
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection, connection:
        cursor = connection.execute(
            f"DELETE FROM deadlines WHERE id = ? AND {where_clause}",
            (deadline_id, *params),
        )
        return cursor.rowcount > 0


def complete_deadline(deadline_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    timestamp = datetime.now(UTC).isoformat()
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection, connection:
        cursor = connection.execute(
            f"""
            UPDATE deadlines SET status = 'completed', updated_at_utc = ?
            WHERE id = ? AND {where_clause}
            """,
            (timestamp, deadline_id, *params),
        )
        if cursor.rowcount == 0:
            return None
    return get_deadline(deadline_id, user_id)


def claim_guest_data(user_id: str) -> dict[str, int]:
    """Transfers all unauthenticated/guest records to the newly authenticated user."""
    with closing(get_connection()) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        # Completions
        existing_completions = {
            r[0] for r in connection.execute(
                "SELECT quest_id FROM quest_completions WHERE user_id = ?", (user_id,)
            ).fetchall()
        }
        guest_completions = connection.execute(
            "SELECT id, quest_id FROM quest_completions WHERE user_id = 'guest' OR user_id IS NULL"
        ).fetchall()
        claimed_completions = 0
        for comp in guest_completions:
            if comp["quest_id"] not in existing_completions:
                connection.execute(
                    "UPDATE quest_completions SET user_id = ? WHERE id = ?",
                    (user_id, comp["id"]),
                )
                connection.execute(
                    "UPDATE xp_ledger SET user_id = ? WHERE completion_id = ?",
                    (user_id, comp["id"]),
                )
                claimed_completions += 1
            else:
                connection.execute(
                    "DELETE FROM xp_ledger WHERE completion_id = ?", (comp["id"],)
                )
                connection.execute(
                    "DELETE FROM quest_completions WHERE id = ?", (comp["id"],)
                )

        # Work states
        existing_work = {
            r[0] for r in connection.execute(
                "SELECT quest_id FROM quest_work_state WHERE user_id = ?", (user_id,)
            ).fetchall()
        }
        guest_work = connection.execute(
            "SELECT quest_id FROM quest_work_state WHERE user_id = 'guest' OR user_id IS NULL"
        ).fetchall()
        claimed_work = 0
        for w in guest_work:
            if w["quest_id"] not in existing_work:
                connection.execute(
                    "UPDATE quest_work_state SET user_id = ? WHERE quest_id = ? AND (user_id = 'guest' OR user_id IS NULL)",
                    (user_id, w["quest_id"]),
                )
                claimed_work += 1
            else:
                connection.execute(
                    "DELETE FROM quest_work_state WHERE quest_id = ? AND (user_id = 'guest' OR user_id IS NULL)",
                    (w["quest_id"],),
                )

        # Reviews
        existing_weeks = {
            r[0] for r in connection.execute(
                "SELECT week_start FROM weekly_reviews WHERE user_id = ?", (user_id,)
            ).fetchall()
        }
        guest_reviews = connection.execute(
            "SELECT id, week_start FROM weekly_reviews WHERE user_id = 'guest' OR user_id IS NULL"
        ).fetchall()
        claimed_reviews = 0
        for rev in guest_reviews:
            if rev["week_start"] not in existing_weeks:
                connection.execute(
                    "UPDATE weekly_reviews SET user_id = ? WHERE id = ?",
                    (user_id, rev["id"]),
                )
                claimed_reviews += 1
            else:
                connection.execute(
                    "DELETE FROM weekly_reviews WHERE id = ?", (rev["id"],)
                )

        # Deadlines
        cursor = connection.execute(
            "UPDATE deadlines SET user_id = ? WHERE user_id = 'guest' OR user_id IS NULL",
            (user_id,),
        )
        claimed_deadlines = cursor.rowcount

        # Settings
        user_has_settings = connection.execute(
            "SELECT 1 FROM user_settings WHERE user_id = ?", (user_id,)
        ).fetchone()
        if not user_has_settings:
            guest_settings = connection.execute(
                "SELECT daily_goal_minutes, timezone, reminders_enabled, celebrations_enabled, updated_at_utc "
                "FROM user_settings WHERE user_id = 'guest' OR user_id IS NULL LIMIT 1"
            ).fetchone()
            if guest_settings:
                connection.execute(
                    """
                    INSERT INTO user_settings (
                        user_id, daily_goal_minutes, timezone, reminders_enabled, celebrations_enabled, updated_at_utc
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        guest_settings["daily_goal_minutes"],
                        guest_settings["timezone"],
                        guest_settings["reminders_enabled"],
                        guest_settings["celebrations_enabled"],
                        guest_settings["updated_at_utc"],
                    ),
                )

    return {
        "imported_completions": claimed_completions,
        "imported_work_states": claimed_work,
        "imported_reviews": claimed_reviews,
        "imported_deadlines": claimed_deadlines,
    }


def export_user_data(user_id: str, email: str | None = None) -> dict[str, Any]:
    """Exports all data associated with an authenticated user."""
    progress = get_progress(user_id)
    where_clause, params = _user_filter(user_id)
    with closing(get_connection()) as connection:
        completions = [
            dict(r) for r in connection.execute(
                f"SELECT * FROM quest_completions WHERE {where_clause} ORDER BY completed_at_utc ASC",
                params,
            ).fetchall()
        ]
        work_states = [
            dict(r) for r in connection.execute(
                f"SELECT * FROM quest_work_state WHERE {where_clause}", params
            ).fetchall()
        ]
        xp_ledger_rows = [
            dict(r) for r in connection.execute(
                f"SELECT * FROM xp_ledger WHERE {where_clause} ORDER BY awarded_at_utc ASC",
                params,
            ).fetchall()
        ]
        reviews = list_weekly_reviews(user_id)
        deadlines_list = list_deadlines(user_id)
        settings = get_settings(user_id)

    return {
        "user_id": user_id,
        "email": email,
        "exported_at_utc": datetime.now(UTC).isoformat(),
        "progress": progress,
        "completions": completions,
        "work_states": work_states,
        "xp_ledger": xp_ledger_rows,
        "weekly_reviews": reviews,
        "deadlines": deadlines_list,
        "settings": settings,
    }


def delete_user_data(user_id: str) -> None:
    """Permanently deletes all data associated with an authenticated user."""
    with closing(get_connection()) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM quest_completions WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM quest_work_state WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM xp_ledger WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM weekly_reviews WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM deadlines WHERE user_id = ?", (user_id,))
        connection.execute("DELETE FROM user_settings WHERE user_id = ?", (user_id,))

