# Phase 5 plan — persistent weekly reviews and deadlines

## Audit findings

- The backend uses raw `sqlite3`, one configured SQLite database, parameterized SQL, and idempotent `CREATE TABLE IF NOT EXISTS` initialization with seed inserts that preserve existing progress.
- FastAPI response schemas live in `backend/app/schemas.py`; API routes live in `backend/app/main.py`; test clients replace `database.DATABASE_PATH` with a temporary file.
- `frontend/src/lib/api.ts` centralizes fetch and runtime validation. The `/weekly-review` view is currently an unavailable placeholder, and `/deadlines` displays roadmap phases rather than editable deadline records.
- Dashboard state already comes from the API for quests, XP, and streaks. There is no review/deadline persistence or current-week review signal.

## Data and contract decisions

1. Continue using raw SQLite. Add `weekly_reviews` with UUID IDs and a unique `week_start`; week ranges are ISO Monday through Sunday and dates are local calendar dates, with UTC creation/update timestamps.
2. Add `deadlines` with UUID IDs, required title/category/due date, optional description/time/HTTP(S) URL, and stored `pending` or `completed` state. Return an additional derived classification (`upcoming`, `overdue`, `completed`) based on the configured local timezone; do not persist or infer completion from a passed date.
3. Add Pydantic request/response models and explicit CRUD/current-week routes. Use transactions and parameterized SQL for all writes; deleting a missing record and updating a missing record returns 404; duplicate review week returns 409; invalid date/time/URL/range returns 422.
4. Keep deadline local-time semantics explicit: due date/time are local wall-clock values in `QUESTLINE_TIMEZONE` (default `Asia/Kolkata`); a date-only deadline is due through that local date.
5. Extend the shared typed API client with runtime validators. Replace the placeholder review and roadmap-window deadline views with saved forms, inline errors/success, lists and states; include explicit completion and delete confirmation.
6. Extend dashboard data only with evidence-backed next upcoming deadline, overdue count, and current-week-review existence.
7. Add temporary-database tests for CRUD, validation, duplicate/current week, classification, persistence, repeatable initialization, and preservation of existing quest/XP records. Run all backend and frontend checks; report browser verification separately from automated results.

## Verification gate before Phase 5 implementation

Phase 4 browser verification passed against a dedicated temporary SQLite database: the seeded quest displayed the server reward, completion/XP survived refresh, and repeat completion did not issue a second reward. Stopping the backend displayed the retryable error; restarting it and retrying restored the saved dashboard state. No unexplained console errors occurred in normal flows.

## Implementation and verification result

- Added persistent review and deadline tables, typed FastAPI contracts, validation, and transactional CRUD.
- Connected `/weekly-review` to current-week create/update and saved history; connected `/deadlines` to deadline CRUD, completion, classification, and delete confirmation.
- Added API-backed dashboard indicators for the next upcoming deadline, overdue count, and current-week review.
- Browser checked review save/history/refresh and deadline create/edit/classification/completion/delete; checked dashboard indicators and 375px mobile layouts without horizontal overflow.
- Backend: 35 tests passed; Ruff and mypy passed. Frontend lint, typecheck, Prettier check, and production build passed. Pytest emitted one upstream Starlette/AnyIO deprecation warning.
- Browser verification used temporary data and isolated services. Existing development services and database were not modified.

### Added endpoints

- Reviews: `GET /api/reviews`, `GET /api/reviews/current`, `GET /api/reviews/{review_id}`, `POST /api/reviews`, `PUT /api/reviews/{review_id}`.
- Deadlines: `GET /api/deadlines`, `POST /api/deadlines`, `PUT /api/deadlines/{deadline_id}`, `POST /api/deadlines/{deadline_id}/complete`, `DELETE /api/deadlines/{deadline_id}`.

Settings persistence, reminders, and PWA installation/offline behavior remain future work; these are not implemented by this phase.
