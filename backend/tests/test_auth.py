import concurrent.futures
import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import jwt
import pytest
from backend.app import database
from backend.app.main import app
from fastapi.testclient import TestClient

TEST_SECRET = "test-secret-key-for-unit-testing-only-12345"


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    test_db = tmp_path / "questline-auth-test.db"
    monkeypatch.setattr(database, "DATABASE_PATH", test_db)
    monkeypatch.setattr("backend.app.auth._SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr("backend.app.auth._SUPABASE_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr("backend.app.auth._get_jwks_client", lambda: None)

    database.initialize_database()
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def make_test_token(
    user_id: str,
    email: str = "test@example.com",
    expired: bool = False,
    secret: str = TEST_SECRET,
    aud: str = "authenticated",
) -> str:
    exp = datetime.now(UTC) + (timedelta(seconds=-10) if expired else timedelta(hours=1))
    payload = {
        "sub": user_id,
        "email": email,
        "aud": aud,
        "exp": int(exp.timestamp()),
        "role": "authenticated",
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def test_unauthenticated_request_works_in_guest_mode(client: TestClient) -> None:
    res = client.get("/api/progress")
    assert res.status_code == 200
    data = res.json()
    assert "total_xp" in data
    assert data["completed_quests"] == 0


def test_forged_or_expired_token_rejected(client: TestClient) -> None:
    # 1. Expired token -> 401
    expired_token = make_test_token("user-expired", expired=True)
    res = client.get("/api/account/export", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401
    assert "expired" in res.json().get("detail", "").lower()

    # 2. Forged token with invalid secret -> 401
    forged_token = make_test_token("user-forged", secret="wrong-secret-key-attacker-32byteslong")
    res = client.get("/api/account/export", headers={"Authorization": f"Bearer {forged_token}"})
    assert res.status_code == 401

    # 3. Forged token with wrong audience -> 401
    wrong_aud_token = make_test_token("user-wrong-aud", aud="wrong_audience")
    res = client.get("/api/account/export", headers={"Authorization": f"Bearer {wrong_aud_token}"})
    assert res.status_code == 401

    # 4. Expired token on optional-user endpoint also returns 401 (so frontend can refresh)
    res_optional = client.get("/api/progress", headers={"Authorization": f"Bearer {expired_token}"})
    assert res_optional.status_code == 401


def test_guest_cannot_bypass_tenant_isolation(client: TestClient) -> None:
    # User A has private completed quest and a deadline
    token_a = make_test_token("user-a", "user_a@example.com")
    headers_a = {"Authorization": f"Bearer {token_a}"}

    res_comp = client.post("/api/quests/welcome/complete", headers=headers_a)
    assert res_comp.status_code == 201

    res_dl = client.post(
        "/api/deadlines",
        headers=headers_a,
        json={
            "title": "Private User A Deadline",
            "description": "Secret notes",
            "due_date": "2027-04-01",
            "category": "Proposal",
        },
    )
    assert res_dl.status_code == 201
    deadline_id = res_dl.json()["id"]

    # Guest user cannot see User A's deadline
    res_guest_deadlines = client.get("/api/deadlines")
    assert res_guest_deadlines.status_code == 200
    assert not any(d["id"] == deadline_id for d in res_guest_deadlines.json()["deadlines"])

    # Guest user cannot mutate or delete User A's deadline
    res_guest_put = client.put(
        f"/api/deadlines/{deadline_id}",
        json={
            "title": "Hacked Title",
            "description": "Hacked",
            "due_date": "2027-04-01",
            "category": "Proposal",
            "status": "pending",
        },
    )
    assert res_guest_put.status_code == 404

    res_guest_del = client.delete(f"/api/deadlines/{deadline_id}")
    assert res_guest_del.status_code == 404

    # Guest user cannot call account-management endpoints
    assert client.get("/api/account/export").status_code == 401
    assert client.post("/api/account/claim-guest-data").status_code == 401
    assert client.delete("/api/account").status_code == 401


def test_user_data_isolation(client: TestClient) -> None:
    token_user_a = make_test_token("user-a", "user_a@example.com")
    token_user_b = make_test_token("user-b", "user_b@example.com")

    # User A completes a quest
    headers_a = {"Authorization": f"Bearer {token_user_a}"}
    res_comp = client.post("/api/quests/welcome/complete", headers=headers_a)
    assert res_comp.status_code == 201

    # User A progress shows 1 completed quest
    res_prog_a = client.get("/api/progress", headers=headers_a)
    assert res_prog_a.status_code == 200
    assert res_prog_a.json()["completed_quests"] == 1
    assert res_prog_a.json()["total_xp"] > 0

    # User B progress shows 0 completed quests
    headers_b = {"Authorization": f"Bearer {token_user_b}"}
    res_prog_b = client.get("/api/progress", headers=headers_b)
    assert res_prog_b.status_code == 200
    assert res_prog_b.json()["completed_quests"] == 0
    assert res_prog_b.json()["total_xp"] == 0


def test_user_cannot_modify_other_user_data(client: TestClient) -> None:
    token_a = make_test_token("user-a", "user_a@example.com")
    token_b = make_test_token("user-b", "user_b@example.com")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    res_dl = client.post(
        "/api/deadlines",
        headers=headers_a,
        json={
            "title": "User A Task",
            "description": "User A Only",
            "due_date": "2027-05-01",
            "category": "Coding",
        },
    )
    dl_id = res_dl.json()["id"]

    # User B cannot complete or delete User A's deadline
    res_complete = client.post(f"/api/deadlines/{dl_id}/complete", headers=headers_b)
    assert res_complete.status_code == 404

    res_delete = client.delete(f"/api/deadlines/{dl_id}", headers=headers_b)
    assert res_delete.status_code == 404


def test_repeated_guest_claims_do_not_duplicate_xp_or_completions(client: TestClient) -> None:
    # Guest completes welcome quest
    res_welcome = client.post("/api/quests/welcome/complete")
    assert res_welcome.status_code == 201

    token_new = make_test_token("user-claimer", "claimer@example.com")
    headers = {"Authorization": f"Bearer {token_new}"}

    # First claim
    claim_1 = client.post("/api/account/claim-guest-data", headers=headers)
    assert claim_1.status_code == 200
    assert claim_1.json()["imported_completions"] == 1

    prog_1 = client.get("/api/progress", headers=headers).json()
    assert prog_1["completed_quests"] == 1
    xp_after_1 = prog_1["total_xp"]
    assert xp_after_1 > 0

    # Second claim retry (idempotency check)
    claim_2 = client.post("/api/account/claim-guest-data", headers=headers)
    assert claim_2.status_code == 200
    assert claim_2.json()["imported_completions"] == 0

    prog_2 = client.get("/api/progress", headers=headers).json()
    assert prog_2["completed_quests"] == 1
    assert prog_2["total_xp"] == xp_after_1  # XP is NOT duplicated!


def test_failed_claim_rolls_back_completely(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Guest completes a quest
    client.post("/api/quests/welcome/complete")
    token_user = make_test_token("user-rollback", "rollback@example.com")
    headers = {"Authorization": f"Bearer {token_user}"}

    # Insert a guest weekly review
    client.post(
        "/api/reviews",
        json={
            "week_start": "2027-01-04",
            "week_end": "2027-01-10",
            "accomplishments": "Guest work",
            "challenges": "None",
            "lessons_learned": "Tested rollback",
            "next_priorities": "More tests",
        },
    )

    real_get_conn = database.get_connection

    class FailingConn:
        def __init__(self, conn: sqlite3.Connection):
            self._conn = conn

        def execute(self, sql: str, *args, **kwargs):
            if "UPDATE weekly_reviews" in sql:
                raise sqlite3.OperationalError("Simulated disk error during claim")
            return self._conn.execute(sql, *args, **kwargs)

        def commit(self):
            return self._conn.commit()

        def rollback(self):
            return self._conn.rollback()

        def close(self):
            return self._conn.close()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            return self._conn.__exit__(exc_type, exc_val, exc_tb)

        def __getattr__(self, name):
            return getattr(self._conn, name)

    monkeypatch.setattr(database, "get_connection", lambda: FailingConn(real_get_conn()))

    # Calling claim should raise and roll back
    claim_res = client.post("/api/account/claim-guest-data", headers=headers)
    assert claim_res.status_code == 500

    # Restore connection factory
    monkeypatch.setattr(database, "get_connection", real_get_conn)

    # User still has 0 completions (transaction rolled back completely)
    user_prog = client.get("/api/progress", headers=headers).json()
    assert user_prog["completed_quests"] == 0


def test_account_export_and_delete(client: TestClient) -> None:
    token = make_test_token("user-delete-me", "bye@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Complete a quest and add a deadline
    client.post("/api/quests/welcome/complete", headers=headers)
    client.post(
        "/api/deadlines",
        headers=headers,
        json={
            "title": "GSoC Proposal Draft",
            "description": "First draft",
            "due_date": "2027-03-15",
            "category": "Proposal",
        },
    )

    # Export
    export_res = client.get("/api/account/export", headers=headers)
    assert export_res.status_code == 200
    export_data = export_res.json()
    assert export_data["user_id"] == "user-delete-me"
    assert len(export_data["completions"]) == 1
    assert len(export_data["deadlines"]) == 1

    # Delete
    del_res = client.delete("/api/account", headers=headers)
    assert del_res.status_code == 204

    # Progress should be reset
    prog_after = client.get("/api/progress", headers=headers).json()
    assert prog_after["completed_quests"] == 0
    assert prog_after["total_xp"] == 0


def test_existing_database_rows_survive_migration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    legacy_db_path = tmp_path / "legacy-store.db"

    # 1. Create a legacy single-tenant schema exactly as Questo originally had it
    conn = sqlite3.connect(legacy_db_path)
    conn.execute("""
        CREATE TABLE phases (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL UNIQUE,
            dates TEXT NOT NULL,
            description TEXT NOT NULL,
            milestone TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE quests (
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
    """)
    conn.execute("""
        CREATE TABLE quest_completions (
            id TEXT PRIMARY KEY,
            quest_id TEXT NOT NULL UNIQUE REFERENCES quests(id),
            completed_at_utc TEXT NOT NULL,
            local_date TEXT NOT NULL,
            xp_awarded INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE quest_work_state (
            quest_id TEXT PRIMARY KEY REFERENCES quests(id) ON DELETE CASCADE,
            status TEXT NOT NULL CHECK (status = 'in_progress'),
            notes TEXT NOT NULL DEFAULT '',
            evidence_url TEXT,
            checked_steps_json TEXT NOT NULL DEFAULT '[]',
            updated_at_utc TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE xp_ledger (
            id TEXT PRIMARY KEY,
            completion_id TEXT NOT NULL,
            quest_id TEXT NOT NULL REFERENCES quests(id),
            points INTEGER NOT NULL,
            reason TEXT NOT NULL,
            awarded_at_utc TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE weekly_reviews (
            id TEXT PRIMARY KEY,
            week_start TEXT NOT NULL UNIQUE,
            week_end TEXT NOT NULL,
            accomplishments TEXT NOT NULL,
            challenges TEXT NOT NULL,
            lessons_learned TEXT NOT NULL,
            next_priorities TEXT NOT NULL,
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE user_settings (
            singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
            daily_goal_minutes INTEGER NOT NULL,
            timezone TEXT NOT NULL,
            reminders_enabled INTEGER NOT NULL,
            celebrations_enabled INTEGER NOT NULL,
            updated_at_utc TEXT
        )
    """)

    # Populate legacy rows
    conn.execute("INSERT INTO quests VALUES ('q1', 'Legacy Quest', 'Desc', 'Coding', 30, 100, 'available', 'Phase 1', '2026-10-01', 1)")
    conn.execute("INSERT INTO quest_completions VALUES ('c1', 'q1', '2026-10-01T12:00:00Z', '2026-10-01', 100)")
    conn.execute("INSERT INTO xp_ledger VALUES ('x1', 'c1', 'q1', 100, 'Legacy reward', '2026-10-01T12:00:00Z')")
    conn.execute("INSERT INTO weekly_reviews VALUES ('r1', '2026-09-28', '2026-10-04', 'Did great', 'None', 'None', 'Continue', '2026-10-04T12:00:00Z', '2026-10-04T12:00:00Z')")
    conn.execute("INSERT INTO user_settings VALUES (1, 45, 'Asia/Kolkata', 1, 1, '2026-10-01T00:00:00Z')")
    conn.commit()
    conn.close()

    # 2. Point Questo database to the legacy db and run initialization / migration
    monkeypatch.setattr(database, "DATABASE_PATH", legacy_db_path)
    database.initialize_database()

    # 3. Verify all legacy data survived intact
    with database.closing(database.get_connection()) as conn:
        # Completions survived and have user_id 'guest'
        comps = conn.execute("SELECT * FROM quest_completions").fetchall()
        assert len(comps) == 1
        assert comps[0]["quest_id"] == "q1"
        assert comps[0]["user_id"] == "guest"

        # XP ledger survived
        ledger = conn.execute("SELECT * FROM xp_ledger").fetchall()
        assert len(ledger) == 1
        assert ledger[0]["points"] == 100

        # Review survived
        revs = conn.execute("SELECT * FROM weekly_reviews").fetchall()
        assert len(revs) == 1
        assert revs[0]["week_start"] == "2026-09-28"

        # Settings survived and singleton_id column is replaced by user_id 'guest'
        settings = conn.execute("SELECT * FROM user_settings").fetchall()
        assert len(settings) == 1
        assert settings[0]["user_id"] == "guest"
        assert settings[0]["daily_goal_minutes"] == 45
        assert settings[0]["timezone"] == "Asia/Kolkata"

        # 4. Multi-tenancy check: another user can now also complete 'q1' without violating constraints!
        conn.execute(
            "INSERT INTO quest_completions (id, quest_id, completed_at_utc, local_date, xp_awarded, user_id) VALUES ('c2', 'q1', '2026-10-02T12:00:00Z', '2026-10-02', 100, 'user-2')"
        )
        assert len(conn.execute("SELECT * FROM quest_completions WHERE quest_id = 'q1'").fetchall()) == 2


def test_concurrent_completions_consistent_xp(client: TestClient) -> None:
    token = make_test_token("user-concurrent", "concurrent@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    def do_complete():
        return client.post("/api/quests/welcome/complete", headers=headers)

    # Run 5 concurrent complete requests for the same quest
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(do_complete) for _ in range(5)]
        responses = [f.result() for f in futures]

    # Exactly one request will create the completion (status 201), the rest return existing completion (status 200)
    status_codes = [r.status_code for r in responses]
    assert 201 in status_codes
    for code in status_codes:
        assert code in (200, 201)

    # Progress XP and completed quest count must be exactly 1, no duplicate XP
    prog = client.get("/api/progress", headers=headers).json()
    assert prog["completed_quests"] == 1
    # Check xp_ledger count
    with database.closing(database.get_connection()) as conn:
        ledger_rows = conn.execute(
            "SELECT * FROM xp_ledger WHERE user_id = 'user-concurrent' AND quest_id = 'welcome'"
        ).fetchall()
        assert len(ledger_rows) == 1
