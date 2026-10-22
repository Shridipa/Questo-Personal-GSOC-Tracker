# Phase 4 plan — persistent quest completion and XP

## Audited contract

- Quest IDs are stable strings; seeded statuses are `completed`, `current`, `available`, or `locked`.
- SQLite is managed with raw `sqlite3`; the database path is configured by `QUESTLINE_DATABASE_PATH`.
- Quest categories currently include Welcome, Learn, Practice, Build, Explore, Milestone, and Locked.
- No completion record, XP ledger, progress endpoint, or completion API currently exists.
- The frontend API client runtime-validates its response shapes. The dashboard has a details dialog but its completion action is disabled; the quest-list action is also disabled.

## Implementation steps

1. Keep the raw SQLite approach and add append-only completion and XP-ledger tables with foreign keys, uniqueness constraints, and indexes.
2. Add explicit category-to-XP rules: Welcome/Learn/Explore = 10, Practice/Build = 25, Milestone = 150, and unknown/Locked categories safely default to 10. The locked seeded PR quest remains locked; no merged-PR reward is inferred.
3. Add transaction-safe, idempotent completion recording, UTC timestamps, local activity dates using configurable `QUESTLINE_TIMEZONE` (default `Asia/Kolkata`), and derived progress, XP-history, and streak APIs.
4. Cover duplicate, missing, locked, rollback, concurrency, persistence, XP, timezone-boundary, and streak behavior with temporary SQLite databases.
5. Extend the runtime-validated frontend client, enable dashboard and quest-list completion with pending/error/server-confirmed reward feedback, then refresh API-backed records after success.
6. Display only server-derived XP, completion totals, and streak values; document the contract and limitations.
7. Run backend/frontend validation and verify the browser completion → refresh behavior against an isolated database.
