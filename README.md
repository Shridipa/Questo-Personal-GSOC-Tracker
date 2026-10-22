# Questo

Questo is a gamified learning tracker for preparing for GSoC 2027 and other open-source mentorship programs. It turns a long-term contribution goal into small, actionable quests.

Phase 4 adds persistent quest completion, server-assigned XP, and daily streaks. Phase 5 adds persistent weekly reviews and personal deadlines. Phase 6 adds saved preferences and activity history derived from completion and XP records. Phase 7 adds installable PWA metadata, an offline navigation fallback, and mobile/accessibility refinements. All persistence uses SQLite and FastAPI.

## Requirements

- Node.js 20.9 or newer and npm
- Python 3.11 or newer (Python 3.12+ recommended)

## Configure and run the frontend

```powershell
Copy-Item frontend\.env.example frontend\.env.local
npm --prefix frontend install
npm --prefix frontend run dev
```

The frontend reads `NEXT_PUBLIC_API_BASE_URL` from `frontend/.env.local`; its local default is `http://127.0.0.1:8000`. Open [http://localhost:3000](http://localhost:3000).

The app manifest is available at `/manifest.webmanifest`. On supported browsers, use the browser's Install option or the in-app Install button. The service worker caches only a small offline information page for failed page navigations; it does not cache API data, queue changes, or complete quests offline. A working API connection is required to load current records and save changes. PWA installation and service-worker support require localhost or HTTPS.

## Configure and run the backend

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
cd backend
Copy-Item .env.example .env
uvicorn app.main:app --reload --env-file .env
```

The API uses `QUESTLINE_DATABASE_PATH` for SQLite (defaults to the project-root `data/questline.db`, independent of the working directory), `QUESTLINE_CORS_ORIGINS` for comma-separated frontend origins, and `QUESTLINE_TIMEZONE` for the initial local-timezone default (defaults to `Asia/Kolkata`). After saving settings, the stored timezone is authoritative for future completion local dates, current streaks, and activity windows. Changing it never rewrites activity dates already recorded. XP is configurable via `QUESTLINE_XP_LEARNING`, `QUESTLINE_XP_CODING`, and `QUESTLINE_XP_MILESTONE`. Relative database paths are resolved from the project root. Available endpoints include `GET /health`, `GET /api/quests`, `GET /api/quests/{quest_id}/work`, `PUT /api/quests/{quest_id}/work`, `GET /api/roadmap`, `POST /api/quests/{quest_id}/complete`, `GET /api/progress`, `GET /api/progress/xp-history`, `GET /api/progress/streaks`, `GET /api/progress/activity?days=30`, `GET /api/settings`, `PUT /api/settings`, `GET /api/reviews`, `GET /api/reviews/current`, `GET /api/reviews/{review_id}`, `POST /api/reviews`, `PUT /api/reviews/{review_id}`, `GET /api/deadlines`, `POST /api/deadlines`, `PUT /api/deadlines/{deadline_id}`, `POST /api/deadlines/{deadline_id}/complete`, and `DELETE /api/deadlines/{deadline_id}`. Interactive docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

Quest completion records and their XP ledger row are inserted atomically. Repeated completion requests return the original reward and cannot award XP twice. Seed inserts are idempotent and do not reset completion records. XP defaults: Welcome/Learn/Explore 10, Practice/Build 25, Milestone 150, and unknown categories 10. Locked quests cannot be completed; the current “Locked” pull-request quest does not receive an assumed PR or merged-PR reward.

Quest details provide a task checklist, optional notes, and an optional evidence URL. `GET /api/quests/{quest_id}/work` reads saved work without creating a record; `PUT` saves it to the additive `quest_work_state` table. The UI saves work before requesting completion and enables completion only after the checklist is checked. Completion still requires server confirmation; the existing atomic, idempotent completion endpoint remains responsible for XP and streak updates. Resource links are task-specific, open in a new tab, and are marked with the date they were checked. Project-specific issues and repositories are not invented; users must confirm issue availability and contribution rules with each project.

Weekly reviews are unique per Monday-to-Sunday week and store UTC creation/update timestamps. Deadline dates and optional times are local wall-clock values in `QUESTLINE_TIMEZONE`; a date-only deadline is considered overdue only after that local calendar day ends. `pending`/`completed` is persisted, while `upcoming`/`overdue`/`completed` classification is calculated from the local date.

Settings default to a 45-minute daily goal, `Asia/Kolkata` (or validated `QUESTLINE_TIMEZONE`), reminders enabled, and celebrations enabled. Daily goal choices are 30, 45, 60, and 90 minutes. Reminder and celebration switches are saved preferences only; this phase does not deliver reminders or otherwise schedule notifications. Activity history defaults to 30 days and accepts a bounded `days` value from 1 to 366. It groups completion counts by each completion's recorded local date and sums XP from the linked ledger rows; zero-activity dates are returned for display but are never inserted into the database.

## Checks

```powershell
cd frontend
npm run lint
npm run typecheck
npm run format:check
npm run build
```

```powershell
python -m pytest backend/tests -q
python -m ruff check backend
python -m mypy --config-file backend/pyproject.toml
```

Phase 6 validation: backend pytest — 49 passed (one upstream Starlette/AnyIO deprecation warning); Ruff and mypy passed. Frontend lint, typecheck, format check, and production build passed. Browser checks covered settings load/save/refresh and populated/empty activity views against temporary SQLite data; settings and progress had no horizontal overflow at 375px. The detailed record is in `docs/IMPLEMENTATION_PLAN.md`.

## Project structure

- `frontend/` — Next.js App Router application
- `backend/` — FastAPI service
- `data/` — local SQLite database location (ignored by Git)
- `docs/` — architecture and phase plan

## Route/API coverage

- `/` dashboard: quests and phases from the API; loading, error, and empty states.
- `/quests`: API-backed quest list with persistent completion.
- `/roadmap`: API-backed phases, with the current phase inferred only from a quest whose API status is `current`.
- `/deadlines`: persistent personal deadline CRUD, completion, and upcoming/overdue/completed groups. Official program dates remain unverified.
- `/progress`: saved completion totals, XP ledger history, timezone-aware streaks, and a selectable 7/30/90-day activity chart/list reconciled to completion and XP records.
- `/weekly-review`: API-backed current-week form and saved review history.
- `/settings`: daily goal, timezone, reminder preference, and celebration preference persist through the API. Reminder delivery is not implemented.

The roadmap is personal planning data, not an official GSoC schedule. No GSoC 2027 application date is asserted here.

## Phase 7 behavior and limitations

The static offline page explains when a connection is unavailable. Once connectivity returns, active API-backed views reload their data; failed forms and mutations are never replayed automatically. Mobile navigation includes safe-area spacing, keyboard escape handling, and visible focus/skip-navigation affordances; the skip link moves focus to the main content. The manifest uses a dedicated mask-safe icon, and service-worker installation failure is surfaced in the app shell.

Push notifications, background sync, actual reminder delivery, import/export, and deployment hardening remain later work. See `docs/PHASE_7_PLAN.md` for scope and `docs/IMPLEMENTATION_PLAN.md` for validation status.

Latest Phase 7 checks passed: backend tests (49 passed, one upstream Starlette/AnyIO deprecation warning), Ruff, mypy, frontend lint/typecheck/format/build, and four focused service-worker tests. Browser verification covered all seven routes at 320/375/768/1280px, keyboard skip-navigation and mobile-menu Escape handling, the maskable icon, offline fallback and API recovery, and an aborted completion mutation that produced an accessible error without changing saved data. Native installation remains platform-dependent and unverified. The current backend on port 8000 uses the existing SQLite database; its verified backup and exact evidence are recorded in `docs/PHASE_7_PLAN.md`.

## Quest workflow and resources

Quest details provide curated resources and a task-specific definition-of-done checklist, plus optional notes and an evidence URL. Work is saved through `GET`/`PUT /api/quests/{quest_id}/work` in the additive `quest_work_state` table. The UI persists work before requesting completion; only the server-confirmed completion response updates XP, and duplicate completion remains idempotent. The dashboard recommends the API's current or next available quest, shows why and how long it is expected to take, and links to relevant resources.

Verification of this workflow: 56 backend tests passed (one upstream deprecation warning); Ruff, mypy, frontend lint, typecheck, formatting check, four PWA tests, and production build passed. An isolated browser test confirmed work persistence across a failed completion request, visible server-confirmed XP after retry, and no horizontal overflow in the quest dialog at 320/375/768/1280px. Detailed evidence is in `docs/IMPLEMENTATION_PLAN.md`.

**Live-backend limitation:** the service currently answering on port 8000 returns 200 for `/health` but 404 for `GET /api/quests/git-workflow/work`. It was left running and untouched because its working directory and database environment were not confirmed. The new workflow requires the current backend code; safely refresh that service only after confirming its database path and making a SQLite-consistent backup.
