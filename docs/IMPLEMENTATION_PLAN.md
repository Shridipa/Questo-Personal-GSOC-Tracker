# Questo implementation plan

Questo is being developed as a responsive, gamified learning experience for a personal open-source preparation roadmap. Phases 0 through 6 are implemented and validated, subject to the automated and browser checks recorded below. Phase 7 implementation and local acceptance checks are complete; native installation remains an explicitly documented platform-specific limitation.

## Phase 0 — Repository audit and setup

- [x] Scaffold a Next.js App Router frontend with strict TypeScript and Tailwind CSS.
- [x] Add a FastAPI backend entry point and health endpoint.
- [x] Document local setup and environment variables.
- [x] Add architecture and implementation-plan documents.
- [x] Add a root ignore file for generated files, local databases, and secrets.
- [x] Configure ESLint, Prettier, Ruff, and mypy.
- [x] Verify frontend/backend startup and health checks in the local environment.

## Phase 1 — Visual foundation

- [x] Establish a warm, playful Questo theme and reusable app shell.
- [x] Add desktop sidebar and mobile bottom navigation.
- [x] Add XP, streak, and level status indicators.
- [x] Build a responsive winding quest path with current, completed, available, and locked states.
- [x] Add the seven required navigation destinations with meaningful page structures.
- [x] Add an explicitly non-persistent preview completion flow (retired when persistent completion was added in Phase 4).
- [x] Respect reduced-motion preferences and provide keyboard-accessible controls.
- [x] Verify lint, type checking, production build, and mobile viewport behavior.

## Phase 2 — Database and backend foundation

- [x] Add SQLite-backed roadmap and quest seed data.
- [x] Make initialization repeatable and the configured database path independent of current working directory.
- [x] Add typed health, quest-list, and roadmap responses.
- [x] Isolate API tests in temporary SQLite databases.

## Phase 3 — Frontend/API integration

- [x] Validate API response fields and status values in the typed frontend client.
- [x] Connect the dashboard, quest list, roadmap, and roadmap windows to the API.
- [x] Add loading, retryable error, and empty states.
- [x] Remove fabricated XP, streak, and activity totals from progress displays.
- [x] Keep quest completion unavailable until the persistent completion endpoint was added in Phase 4.

## Phase 4 — Persistent quest completion and XP

- [x] Record quest completions and XP ledger entries atomically with duplicate protection.
- [x] Add server-assigned, configurable category-based XP rewards and a safe default.
- [x] Persist UTC timestamps and configured local activity dates; derive current and longest streaks without seed activity.
- [x] Add progress, XP-history, and streak endpoints.
- [x] Connect quest completion UI and show server-confirmed rewards after reloading data.
- [x] Test transactional rollback, repeat/concurrent requests, persistence, XP, and timezone/streak behavior.
- [x] Verify browser completion, server-confirmed reward, and persisted state after refresh against an isolated database.

### Phase 4 validation record

- Backend: `pytest backend/tests -q` — 35 passed with one upstream Starlette/AnyIO deprecation warning; Ruff and mypy passed.
- Frontend: lint, typecheck, Prettier check, and production build passed.
- Browser: on an isolated temporary SQLite database, completion displayed server-confirmed XP, survived refresh, and repeated completion did not award XP twice. Stopping FastAPI showed the retryable error; restart and Retry restored persisted dashboard data. No unexpected console errors occurred during normal flow.
- Temporary verification services and database were cleaned up after the browser run; pre-existing services and the development database were left untouched.

## Phase 5 — Persistent weekly reviews and deadline management

- [x] Add idempotent SQLite tables and indexes without resetting quest or progress records.
- [x] Add Monday-to-Sunday review create/list/current/get/update APIs with duplicate-week protection.
- [x] Add deadline create/list/update/complete/delete APIs with validated URLs, dates, and times.
- [x] Derive upcoming/overdue/completed classification using configured local dates while preserving explicit completion status.
- [x] Connect review forms/history, deadline forms/groups, error/loading/success states, and delete confirmation.
- [x] Add dashboard next-deadline, overdue-count, and current-review indicators from API data.
- [x] Test CRUD, duplicate and invalid inputs, missing records, classifications, persistence, and repeatable initialization.

### Verification status

- Phase 4 browser completion/refresh/error/recovery flow: **passed** against an isolated database.
- Phase 5 browser flow: review save/history/refresh and deadline CRUD/classification/completion/delete confirmation passed; dashboard indicators and 375px mobile overflow checks passed.
- Latest backend: 35 passed; Ruff and mypy passed. Latest frontend: lint, typecheck, format check, and production build passed. One upstream Starlette/AnyIO deprecation warning remains.

## Next phases

## Phase 6 — Persistent settings and progress/activity history

- [x] Add a singleton settings table with safe defaults and idempotent initialization.
- [x] Add typed, validated `GET /api/settings` and `PUT /api/settings` endpoints.
- [x] Make the saved timezone authoritative for future activity dates, streak boundaries, and history windows without rewriting recorded dates.
- [x] Add bounded `GET /api/progress/activity?days=30` aggregation sourced from completion and XP ledger records.
- [x] Connect settings load/save/loading/error/success states, preserving reminder and celebration preferences as preferences only.
- [x] Add selectable 7/30/90-day activity summaries, an accessible daily XP chart, active-day list, and useful empty state.
- [x] Test settings defaults/validation/persistence/reinitialization, timezone behavior, zero-filled history, ledger reconciliation, and read-only history requests.

### Phase 6 verification status

- `.\.venv\Scripts\python.exe -m pytest backend\tests -q` — **49 passed**, one upstream Starlette/AnyIO deprecation warning.
- `.\.venv\Scripts\python.exe -m ruff check backend` — passed.
- `.\.venv\Scripts\python.exe -m mypy --config-file backend\pyproject.toml` — passed (7 source files).
- `npm --prefix frontend run lint` — passed.
- `npm --prefix frontend run typecheck` — passed.
- `npm --prefix frontend run format:check` — passed.
- `npm --prefix frontend run build` — passed; all seven app routes generated.
- Browser checked settings load/save/refresh against an isolated temporary SQLite database. The progress view was checked with both empty history and a server-recorded quest completion; XP/completion totals matched. The range selector returned seven bars for the 7-day view.
- At 375px viewport width, settings and progress both had `scrollWidth == clientWidth` (360px content viewport); no horizontal overflow. No browser request or console errors occurred during the checked normal flows.
- Browser API traffic was routed to an isolated Phase 6 backend because the pre-existing process on port 8000 did not yet expose the new settings/activity endpoints. Browser writes used only a temporary DB; the existing backend, its development database, and frontend on port 3002 were left untouched.
- Reminder delivery and celebration behavior are not implemented; their current toggles persist as preferences only. User identity/focus profile remains static preview data.

## Phase 7 — PWA, offline resilience, and mobile polish

- [x] Add standalone web manifest metadata, theme colors, and scalable SVG app icon.
- [x] Add install-prompt handling when supported and register a same-origin service worker.
- [x] Cache only a static offline explanation page for failed navigations; never cache API data or queue user actions.
- [x] Show connection/service-worker errors and refresh active API data when connectivity returns.
- [x] Improve mobile action/form touch targets, safe navigation feedback, skip navigation, and Escape handling.
- [x] Preserve visible focus and reduced-motion behavior.
- [x] Verify manifest, icon dimensions, service-worker script, and offline page responses from the local frontend.
- [x] Verify the seven routes at 320, 375, 768, and 1280px, and mobile planning-menu keyboard behavior.
- [x] Run backend and frontend regression checks and record exact results.
- [x] Verify offline navigation fallback and API recovery in a browser; verify failed mutations are not reported as successful.
- [x] Observe `beforeinstallprompt` in an unsynthesized headless Edge run; document native-install verification as platform-dependent and outstanding.

### Phase 7 verification status

- Backend: `.\.venv\Scripts\python.exe -m pytest backend\tests -q` — 49 passed, one upstream Starlette/AnyIO deprecation warning; Ruff and mypy passed.
- Frontend: lint, typecheck, format check, and production build passed; `/manifest.webmanifest` was generated as a static route.
- Production responses returned 200 for the manifest, service worker, offline page, and both PNG icons. The manifest declares 192x192 and 512x512 icons, including a maskable 512x512 icon. Browser inspection confirmed an active service worker and the cached offline page.
- Browser checks rendered all seven routes at 320, 375, 768, and 1280px (28/28 with no horizontal overflow), exercised skip-navigation and mobile-menu keyboard controls, and confirmed app touch targets are at least 44px at mobile/tablet widths. Browser offline mode showed the notice and static fallback; restoring the network reloaded API-backed quests. An aborted completion POST showed an accessible error and did not write completion or XP data.
- Manifest and service-worker assets returned 200; PNG dimensions were confirmed and the full maskable SVG was visually inspected. The worker controlled the app and cached the offline page. Native installation remains unverified; the `beforeinstallprompt` event was observed in a prior unsynthesized headless Edge run.
- At the start of the latest follow-up, port 8000 refused connections; no unknown process was stopped. The current backend was started on the existing `data/questline.db`. Live health, settings, activity, progress, XP history, reviews, deadlines, and quests endpoints returned 200. The verified backup contains 7 phases and 8 quests; the active database preserves those counts and has zero completions/XP, reviews, or deadlines. See `docs/PHASE_7_PLAN.md` for backup hash, listener details, exact commands, and the fact that no older settings/completion/review/deadline records existed to compare.
- Latest regression checks passed: 49 backend tests (one upstream Starlette/AnyIO deprecation warning), Ruff, mypy, frontend lint/typecheck/format, four PWA tests, and production build after the 44px dashboard-action touch-target correction. The temporary frontend verification server was stopped; the current backend remains available on port 8000.

## Goal-driven quest workflow and contextual resources

- [x] Add curated, task-specific resource links to quests and roadmap phases. Each link has a title, short instruction, resource type, and verification date. Program timelines explicitly note that dates vary by year; project-specific repositories and beginner issues are not invented.
- [x] Add persistent quest notes, optional evidence URLs, and checklist progress through the additive `quest_work_state` table and `GET`/`PUT /api/quests/{quest_id}/work` endpoints. Reads do not create rows; locked quests cannot be started.
- [x] Replace shortcut completion controls with a shared quest-details workflow: review the goal and resources, start/resume, save work, complete every checklist step, and request completion from the server. The dialog displays success only after the existing idempotent completion API confirms the result.
- [x] Add a dashboard next-action recommendation based on the API's current quest or first available quest in roadmap order, with the selection reason, estimate, and related resource links. Users can choose other unlocked quests from the quest board.
- [x] Keep the completion dialog mounted until the user dismisses it so successful server confirmation remains visible; refresh quest, progress, and streak data on dismissal.
- [x] Make the quest-dialog close control at least 44px to meet touch-target sizing at mobile widths.

### Verification record — 2026-10-22

- Backend: `python -m pytest backend\tests -q` — 56 passed, with one upstream Starlette/AnyIO deprecation warning. Ruff and mypy passed.
- Frontend: lint passed without warnings after correcting hook dependencies; TypeScript typecheck, Prettier format check, and all four PWA tests passed. `npm --prefix frontend run build` completed successfully and generated all static routes.
- Browser resource/workflow check used a fresh, temporary SQLite database and frontend/API origins on ports 3003/8001. The quest board displayed a contextual Git reference; notes, evidence URL, and all three checked merge-conflict steps persisted through `GET /api/quests/merge-conflict/work`.
- With the completion POST deliberately aborted, the dialog showed an accessible error, retained saved work, and the quest stayed current with no XP award. After restoring the request, the server returned the completion and the dialog stayed open with the confirmed `+25 XP` result; closing it refreshed the board to 2 of 7 complete. This also resolved the earlier discrepancy where the board updated but the dialog lost its success state.
- A second isolated browser run on ports 3004/8002 checked the quest dialog at 320, 375, 768, and 1280px: no horizontal overflow; the close, start, and completion buttons each measured at least 44px. Keyboard focus entered on the close button and Escape closed the dialog.
- The production database was checked read-only after testing: `PRAGMA quick_check` returned `ok`; it still had 3 completion and 3 XP-ledger rows, with 0 weekly reviews, deadlines, and settings rows. All browser writes used only temporary databases. The existing backend on port 8000 was not restarted or written to.
- Live-backend limitation: `GET /health` on port 8000 returned 200, but `GET /api/quests/git-workflow/work` returned 404, so that service does not expose the new workflow endpoint. Its listener was PID 28624, running Python 3.11 Uvicorn with `app.main:app --app-dir backend --host 127.0.0.1 --port 8000`. The process working directory and database environment could not be confirmed; it was not stopped or restarted, and no backup was made for a restart.
- Temporary verification servers were stopped after verifying their command lines and exact PIDs; ports 8001/8002/3003/3004 were not left listening. Temporary environment files, SQLite test data, and temporary VS Code task entries were removed.

## Next phases

1. **Phase 7 remaining platform check:** verify native installation on a supported browser/device when one is available; no installation behavior is simulated.
2. **Phase 8 — Reliability and data portability:** reminders, validated import/export, accessibility, and deployment guidance.
3. **Phase 9 — Release validation:** end-to-end journey, responsive checks, and full regression suite.

Do not mark a phase complete until its acceptance criteria are implemented and verified. Official program dates must be sourced from current announcements before being marked confirmed.
