from __future__ import annotations

import json
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


def get_configured_timezone() -> ZoneInfo:
    configured_name = os.environ.get("QUESTLINE_TIMEZONE", DEFAULT_TIMEZONE)
    try:
        with closing(get_connection()) as connection:
            row = connection.execute(
                "SELECT timezone FROM user_settings WHERE singleton_id = 1"
            ).fetchone()
        if row is not None:
            configured_name = row["timezone"]
    except sqlite3.OperationalError as error:
        if "no such table: user_settings" not in str(error):
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
                quest_id TEXT NOT NULL UNIQUE REFERENCES quests(id),
                completed_at_utc TEXT NOT NULL,
                local_date TEXT NOT NULL,
                xp_awarded INTEGER NOT NULL CHECK (xp_awarded >= 0)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS quest_work_state (
                quest_id TEXT PRIMARY KEY REFERENCES quests(id) ON DELETE CASCADE,
                status TEXT NOT NULL CHECK (status = 'in_progress'),
                notes TEXT NOT NULL DEFAULT '',
                evidence_url TEXT,
                checked_steps_json TEXT NOT NULL DEFAULT '[]',
                updated_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS xp_ledger (
                id TEXT PRIMARY KEY,
                completion_id TEXT NOT NULL UNIQUE
                    REFERENCES quest_completions(id),
                quest_id TEXT NOT NULL REFERENCES quests(id),
                points INTEGER NOT NULL CHECK (points >= 0),
                reason TEXT NOT NULL,
                awarded_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS weekly_reviews (
                id TEXT PRIMARY KEY,
                week_start TEXT NOT NULL UNIQUE,
                week_end TEXT NOT NULL,
                accomplishments TEXT NOT NULL,
                challenges TEXT NOT NULL,
                lessons_learned TEXT NOT NULL,
                next_priorities TEXT NOT NULL,
                created_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL,
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
                updated_at_utc TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_settings (
                singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
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


def complete_quest(quest_id: str, *, now_utc: datetime | None = None) -> dict[str, Any] | None:
    moment = now_utc or datetime.now(UTC)
    if moment.tzinfo is None:
        raise ValueError("Completion timestamp must include a timezone.")
    moment = moment.astimezone(UTC)
    completed_at = moment.isoformat()
    local_date = moment.astimezone(get_configured_timezone()).date().isoformat()

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
            """
            SELECT id, completed_at_utc, local_date, xp_awarded
            FROM quest_completions WHERE quest_id = ?
            """,
            (quest_id,),
        ).fetchone()
        if completion is None:
            if quest_row["status"] == "locked":
                raise ValueError("This quest is locked and cannot be completed.")

            reward = get_xp_reward(quest_row["category"])
            completion_id = str(uuid4())
            connection.execute(
                """
                INSERT INTO quest_completions
                    (id, quest_id, completed_at_utc, local_date, xp_awarded)
                VALUES (?, ?, ?, ?, ?)
                """,
                (completion_id, quest_id, completed_at, local_date, reward),
            )
            connection.execute(
                """
                INSERT INTO xp_ledger
                    (id, completion_id, quest_id, points, reason, awarded_at_utc)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    completion_id,
                    quest_id,
                    reward,
                    f"Quest completion: {quest_row['title']}",
                    completed_at,
                ),
            )
            connection.execute(
                "UPDATE quests SET status = 'completed' WHERE id = ?",
                (quest_id,),
            )
            if quest_row["status"] == "current":
                connection.execute(
                    """
                    UPDATE quests SET status = 'current'
                    WHERE id = (
                        SELECT id FROM quests
                        WHERE sort_index > (
                            SELECT sort_index FROM quests WHERE id = ?
                        ) AND status = 'available'
                        ORDER BY sort_index ASC LIMIT 1
                    )
                    """,
                    (quest_id,),
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
            "SELECT COALESCE(SUM(points), 0) FROM xp_ledger"
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


def list_quests() -> list[dict[str, Any]]:
    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT id, title, description, category, minutes, xp, status, phase, date
            FROM quests ORDER BY sort_index ASC
            """
        ).fetchall()
        quests = [dict(row) for row in rows]
        for quest in quests:
            quest["xp"] = get_xp_reward(quest["category"])
        return quests


def get_quest_work(quest_id: str) -> dict[str, Any] | None:
    with closing(get_connection()) as connection:
        quest_exists = connection.execute(
            "SELECT 1 FROM quests WHERE id = ?", (quest_id,)
        ).fetchone()
        if quest_exists is None:
            return None
        row = connection.execute(
            """
            SELECT status, notes, evidence_url, checked_steps_json, updated_at_utc
            FROM quest_work_state WHERE quest_id = ?
            """,
            (quest_id,),
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


def save_quest_work(quest_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
    updated_at = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        quest = connection.execute(
            "SELECT status FROM quests WHERE id = ?", (quest_id,)
        ).fetchone()
        if quest is None:
            return None
        if quest["status"] == "locked":
            raise ValueError("This quest is locked and cannot be started.")
        connection.execute(
            """
            INSERT INTO quest_work_state (
                quest_id, status, notes, evidence_url, checked_steps_json, updated_at_utc
            ) VALUES (?, 'in_progress', ?, ?, ?, ?)
            ON CONFLICT(quest_id) DO UPDATE SET
                notes = excluded.notes,
                evidence_url = excluded.evidence_url,
                checked_steps_json = excluded.checked_steps_json,
                updated_at_utc = excluded.updated_at_utc
            """,
            (
                quest_id,
                values["notes"],
                values["evidence_url"],
                json.dumps(values["checked_steps"]),
                updated_at,
            ),
        )
    return get_quest_work(quest_id)


def get_progress() -> dict[str, int]:
    with closing(get_connection()) as connection:
        total_xp = connection.execute(
            "SELECT COALESCE(SUM(points), 0) FROM xp_ledger"
        ).fetchone()[0]
        completed_count = connection.execute(
            "SELECT COUNT(*) FROM quest_completions"
        ).fetchone()[0]
        total_quests = connection.execute("SELECT COUNT(*) FROM quests").fetchone()[0]
    return {
        "total_xp": total_xp,
        "completed_quests": completed_count,
        "total_quests": total_quests,
    }


def get_settings() -> dict[str, Any]:
    with closing(get_connection()) as connection:
        row = connection.execute(
            """
            SELECT daily_goal_minutes, timezone, reminders_enabled,
                   celebrations_enabled, updated_at_utc
            FROM user_settings
            WHERE singleton_id = 1
            """
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


def save_settings(values: dict[str, Any]) -> dict[str, Any]:
    updated_at = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            INSERT INTO user_settings (
                singleton_id, daily_goal_minutes, timezone, reminders_enabled,
                celebrations_enabled, updated_at_utc
            ) VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(singleton_id) DO UPDATE SET
                daily_goal_minutes = excluded.daily_goal_minutes,
                timezone = excluded.timezone,
                reminders_enabled = excluded.reminders_enabled,
                celebrations_enabled = excluded.celebrations_enabled,
                updated_at_utc = excluded.updated_at_utc
            """,
            (
                values["daily_goal_minutes"],
                values["timezone"],
                int(values["reminders_enabled"]),
                int(values["celebrations_enabled"]),
                updated_at,
            ),
        )
        row = connection.execute(
            """
            SELECT daily_goal_minutes, timezone, reminders_enabled,
                   celebrations_enabled, updated_at_utc
            FROM user_settings
            WHERE singleton_id = 1
            """
        ).fetchone()
    return {
        "daily_goal_minutes": row["daily_goal_minutes"],
        "timezone": row["timezone"],
        "reminders_enabled": bool(row["reminders_enabled"]),
        "celebrations_enabled": bool(row["celebrations_enabled"]),
        "updated_at_utc": row["updated_at_utc"],
    }


def get_activity_history(
    days: int = 30, *, today: date | None = None
) -> dict[str, Any]:
    if not 1 <= days <= 366:
        raise ValueError("Activity history must include between 1 and 366 days.")
    local_today = today or datetime.now(get_configured_timezone()).date()
    start_date = local_today - timedelta(days=days - 1)
    start_text = start_date.isoformat()
    end_text = local_today.isoformat()

    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            WITH completion_totals AS (
                SELECT local_date, COUNT(*) AS quests_completed
                FROM quest_completions
                WHERE local_date BETWEEN ? AND ?
                GROUP BY local_date
            ),
            xp_totals AS (
                SELECT completions.local_date, SUM(ledger.points) AS xp_earned
                FROM xp_ledger AS ledger
                JOIN quest_completions AS completions
                    ON completions.id = ledger.completion_id
                WHERE completions.local_date BETWEEN ? AND ?
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
            (start_text, end_text, start_text, end_text),
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
        "timezone": get_configured_timezone().key,
        "days": activity_days,
        "totals": {
            "quests_completed": sum(day["quests_completed"] for day in activity_days),
            "xp_earned": sum(day["xp_earned"] for day in activity_days),
            "active_days": sum(day["has_activity"] for day in activity_days),
        },
    }


def list_xp_history() -> list[dict[str, Any]]:
    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT ledger.id, ledger.quest_id, quests.title AS quest_title,
                   ledger.points, ledger.reason, ledger.awarded_at_utc
            FROM xp_ledger AS ledger
            JOIN quests ON quests.id = ledger.quest_id
            ORDER BY ledger.awarded_at_utc DESC, ledger.id DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]


def list_activity_dates() -> list[str]:
    with closing(get_connection()) as connection:
        rows = connection.execute(
            "SELECT DISTINCT local_date FROM quest_completions ORDER BY local_date ASC"
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


def get_streaks(*, now_utc: datetime | None = None) -> dict[str, int | str]:
    moment = now_utc or datetime.now(UTC)
    if moment.tzinfo is None:
        raise ValueError("Streak calculation timestamp must include a timezone.")
    local_today = moment.astimezone(get_configured_timezone()).date()
    return {
        **calculate_streaks(list_activity_dates(), local_today),
        "timezone": get_configured_timezone().key,
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


def list_weekly_reviews() -> list[dict[str, Any]]:
    with closing(get_connection()) as connection:
        rows = connection.execute(
            "SELECT * FROM weekly_reviews ORDER BY week_start DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def get_weekly_review(review_id: str) -> dict[str, Any] | None:
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT * FROM weekly_reviews WHERE id = ?", (review_id,)
        ).fetchone()
        return dict(row) if row is not None else None


def get_current_weekly_review(*, today: date | None = None) -> dict[str, Any] | None:
    week_start = current_week_start(today=today).isoformat()
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT * FROM weekly_reviews WHERE week_start = ?", (week_start,)
        ).fetchone()
        return dict(row) if row is not None else None


def create_weekly_review(values: dict[str, Any]) -> dict[str, Any]:
    review_id = str(uuid4())
    timestamp = datetime.now(UTC).isoformat()
    try:
        with closing(get_connection()) as connection, connection:
            connection.execute(
                """
                INSERT INTO weekly_reviews (
                    id, week_start, week_end, accomplishments, challenges,
                    lessons_learned, next_priorities, created_at_utc, updated_at_utc
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                ),
            )
    except sqlite3.IntegrityError as error:
        if "weekly_reviews.week_start" in str(error):
            raise ValueError("A review for this week already exists.") from error
        raise
    result = get_weekly_review(review_id)
    if result is None:
        raise RuntimeError("Created weekly review could not be retrieved.")
    return result


def update_weekly_review(
    review_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    timestamp = datetime.now(UTC).isoformat()
    try:
        with closing(get_connection()) as connection, connection:
            cursor = connection.execute(
                """
                UPDATE weekly_reviews
                SET week_start = ?, week_end = ?, accomplishments = ?, challenges = ?,
                    lessons_learned = ?, next_priorities = ?, updated_at_utc = ?
                WHERE id = ?
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
                ),
            )
            if cursor.rowcount == 0:
                return None
    except sqlite3.IntegrityError as error:
        if "weekly_reviews.week_start" in str(error):
            raise ValueError("A review for this week already exists.") from error
        raise
    return get_weekly_review(review_id)


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


def list_deadlines(*, now_local: datetime | None = None) -> list[dict[str, Any]]:
    local_now = now_local or datetime.now(get_configured_timezone())
    with closing(get_connection()) as connection:
        rows = connection.execute(
            "SELECT * FROM deadlines ORDER BY due_date, due_time, title"
        ).fetchall()
        return [_deadline_with_classification(row, local_now) for row in rows]


def get_deadline(
    deadline_id: str, *, now_local: datetime | None = None
) -> dict[str, Any] | None:
    local_now = now_local or datetime.now(get_configured_timezone())
    with closing(get_connection()) as connection:
        row = connection.execute(
            "SELECT * FROM deadlines WHERE id = ?", (deadline_id,)
        ).fetchone()
        return _deadline_with_classification(row, local_now) if row is not None else None


def create_deadline(values: dict[str, Any]) -> dict[str, Any]:
    deadline_id = str(uuid4())
    timestamp = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        connection.execute(
            """
            INSERT INTO deadlines (
                id, title, description, due_date, due_time, category, status, url,
                created_at_utc, updated_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
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
            ),
        )
    result = get_deadline(deadline_id)
    if result is None:
        raise RuntimeError("Created deadline could not be retrieved.")
    return result


def update_deadline(
    deadline_id: str, values: dict[str, Any]
) -> dict[str, Any] | None:
    timestamp = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        cursor = connection.execute(
            """
            UPDATE deadlines
            SET title = ?, description = ?, due_date = ?, due_time = ?, category = ?,
                status = ?, url = ?, updated_at_utc = ?
            WHERE id = ?
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
            ),
        )
        if cursor.rowcount == 0:
            return None
    return get_deadline(deadline_id)


def delete_deadline(deadline_id: str) -> bool:
    with closing(get_connection()) as connection, connection:
        cursor = connection.execute("DELETE FROM deadlines WHERE id = ?", (deadline_id,))
        return cursor.rowcount > 0


def complete_deadline(deadline_id: str) -> dict[str, Any] | None:
    timestamp = datetime.now(UTC).isoformat()
    with closing(get_connection()) as connection, connection:
        cursor = connection.execute(
            """
            UPDATE deadlines SET status = 'completed', updated_at_utc = ?
            WHERE id = ?
            """,
            (timestamp, deadline_id),
        )
        if cursor.rowcount == 0:
            return None
    return get_deadline(deadline_id)
