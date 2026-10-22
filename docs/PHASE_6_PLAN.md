# Phase 6 plan — persistent settings and progress history

## Audit findings

- The application uses FastAPI, Pydantic, raw SQLite, and one centralized runtime-validated TypeScript API client.
- Settings currently live only in React state: daily minutes, reminder toggle, and celebration toggle reset on reload. The timezone is displayed as `Asia/Kolkata` but is not editable. Reminder toggling is not connected to delivery.
- `/api/progress`, `/api/progress/xp-history`, and `/api/progress/streaks` already expose saved totals and streaks. Completion rows store `local_date`; XP amounts are held in the append-only `xp_ledger`.
- The progress route currently shows total XP, completion count, streaks, and an all-time XP ledger list, but no selected-period activity summary.
- Initialization uses idempotent `CREATE TABLE IF NOT EXISTS`; tests use temporary SQLite files through the existing fixture.

## Data model and timezone policy

- Add a single `user_settings` row keyed by a fixed singleton key. Persist daily goal (30, 45, 60, or 90 minutes), IANA timezone, reminder preference, celebration preference, and UTC update timestamp.
- Defaults are 45 minutes, reminder enabled, celebrations enabled, and the validated `QUESTLINE_TIMEZONE` environment value (or `Asia/Kolkata` when unset).
- Saved settings become the timezone source after an update. Before the singleton row exists, the validated environment configuration supplies the default. Settings updates never rewrite existing completion `local_date` values; history uses the date originally recorded at completion, while future completions and current-streak boundaries use the saved timezone.
- Reminder state is only a saved preference. This phase does not schedule or deliver reminders.

## API contract

- `GET /api/settings` returns `{ daily_goal_minutes, timezone, reminders_enabled, celebrations_enabled, updated_at_utc }`, returning defaults without requiring an existing row.
- `PUT /api/settings` validates and replaces the complete settings representation transactionally and returns the saved representation. Timezones must be valid IANA names; unsupported daily goals and malformed fields are rejected by Pydantic.
- `GET /api/progress/activity?days=30` returns a bounded date window (1–366 days) ending on the current local date, with ordered daily completion counts, XP from ledger entries joined to their original completion dates, and range totals. Dates without records are zero-filled for display only.

## Frontend and testing strategy

- Reuse the existing API client and loading/error/retry conventions.
- Replace temporary settings controls with a server-populated, validated form and save confirmation. Retain daily goal and timezone controls, and persist the existing reminder/celebration preferences while explicitly noting that reminders are not delivered.
- Extend progress with 7/30/90-day activity selection, an accessible CSS-based daily chart and textual activity history, plus XP/activity totals and active-day average derived from API results.
- Use a stable callback keyed to the selected range so stale range requests cannot overwrite newer data.
- Add temporary-database API tests for defaults, validation, persistence, missing/unexpected fields, repeated initialization, and progress preservation. Test empty/zero-filled ranges, ledger reconciliation, date boundaries, ordering, limits, and read-only behavior.
- Run backend pytest, Ruff, and mypy; frontend lint, typecheck, formatting check, and production build. Use a browser check if available, against the existing local services only if their current data can safely remain untouched.

## Acceptance criteria

1. [x] Settings load from the API, validate on the server, save transactionally, and survive refresh/reinitialization.
2. [x] The timezone setting controls future activity dates, current streak, and date-window boundaries without rewriting historical activity dates.
3. [x] The activity response reconciles exactly to completion records and XP ledger entries and does not insert history rows.
4. [x] The progress view supports bounded windows, an accessible visualization, and honest empty/error/loading states.
5. [x] Phase 0–5 behavior and saved progress remain intact.
6. [x] Automated and browser checks were run and their results recorded in `IMPLEMENTATION_PLAN.md`.

## Final verification

- Backend: 49 tests passed; Ruff and mypy passed. Pytest reported one upstream Starlette/AnyIO deprecation warning.
- Frontend: lint, typecheck, format check, and production build passed.
- Browser: settings load/save/refresh and empty/populated progress views passed against an isolated temporary database. The 7-day selector returned seven bars; the progress XP and completion totals matched the stored quest record. Settings and progress had no horizontal overflow at 375px, and no request/console errors occurred during the checked flows.
- Browser API traffic used a temporary backend because the pre-existing service on port 8000 did not yet expose the Phase 6 endpoints. The browser persistence checks used a temporary SQLite database; the existing backend/database were not modified.
- Reminder delivery and celebration behavior are not implemented; those toggles are saved preferences only.
