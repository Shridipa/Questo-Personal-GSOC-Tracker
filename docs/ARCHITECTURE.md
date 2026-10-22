# Questo architecture

## Current scope

Questo is a modular monolith with a Next.js frontend and a Python FastAPI backend. Quest, roadmap, completion, XP-history, and streak data flow through a SQLite-backed FastAPI service. The frontend validates response payloads at runtime and presents backend errors rather than silently substituting fixtures.

```text
Browser
  └── Next.js App Router (frontend/)
      ├── Responsive app shell and route views
      ├── Runtime-validated API client (src/lib/api.ts)
      └── Loading/error states (src/lib/use-api-data.ts)
      ├── Web app manifest and SVG/PNG app icons
      └── Service worker: navigation network-first; cached offline information page only

FastAPI (backend/)
  ├── GET /health
  ├── GET /api/quests
  ├── GET/PUT /api/quests/{quest_id}/work
  ├── GET /api/roadmap
  ├── POST /api/quests/{quest_id}/complete
  ├── GET /api/progress
  ├── GET /api/progress/xp-history
  ├── GET /api/progress/streaks
  ├── GET /api/progress/activity?days=30
  ├── GET /api/settings
  ├── PUT /api/settings
  ├── /api/reviews (current, list, get, create, update)
  └── /api/deadlines (list, create, update, complete, delete)

SQLite and domain services
  ├── Seeded phases, phase quest titles, and quests in data/questline.db
  ├── Unique quest completion records
  ├── Per-quest notes, evidence URL, and checklist work state
  ├── Append-only, one-row-per-completion XP ledger
  ├── Singleton user settings row
  ├── Date-window activity aggregates from completion and XP records
  ├── Weekly reviews unique by week start
  ├── Personal deadlines with derived local-date classification
  └── Database path configured by QUESTLINE_DATABASE_PATH
```

## Frontend

- Next.js App Router and React with strict TypeScript.
- Tailwind CSS 4 plus centralized CSS custom properties for the Questo palette.
- `lucide-react` for interface icons.
- Route pages share an app shell; reusable view and navigation components live under `src/components/questline/`.
- `src/lib/api.ts` owns requests and validates JSON fields and status values before returning typed data.
- Dashboard and quest/roadmap routes fetch the API directly; failed requests surface a retryable error state.
- Quest completion is submitted to the backend. The frontend displays only the server-confirmed XP reward and reloads the quest/progress state.
- Quest details show verified, task-specific official resources and a definition-of-done checklist. Notes, optional evidence URLs, and checked step IDs are saved to the API before completion; the UI reports errors and never treats an unconfirmed request as success.
- The dashboard recommends the API's current quest or the first available quest in roadmap order, explains that selection, shows its estimated duration, and links directly to relevant resources. The quest board remains available to choose another unlocked task.
- Progress, XP history, streaks, and daily activity are calculated from persisted completion and ledger records.
- The progress page supports 7/30/90-day windows, zero-fills display days without inserting activity, and shows XP by date plus a textual list of active days.
- Weekly reviews use the API for current-week entry, history, creation, and edits.
- The deadline screen uses persistent deadline CRUD and completion; official dates are not inferred from personal plans.
- The dashboard shows the next upcoming deadline, overdue count, and whether the current-week review exists.
- Daily goal, timezone, reminder preference, and celebration preference are loaded and saved through `/api/settings`.
- Reminder preferences do not imply a delivery mechanism; reminders are not sent.
- `src/app/manifest.ts` provides standalone install metadata and a scalable SVG icon.
- `public/questline-sw.js` uses network-first handling for same-origin document navigations and falls back to `public/offline.html`. It does not cache API responses or queue writes; quest completion and other mutations always require server confirmation.
- The app shell reports offline/service-worker support state, offers the browser install prompt where available, and closes the compact planning menu on route changes or Escape. API-backed reads retry when connectivity returns.
- Mobile layouts include safe-area-aware navigation, 44px-or-larger primary controls, visible keyboard focus, a skip-to-content link, and reduced-motion styles.

## Backend

- FastAPI exposes `/health`, `/api/quests`, and `/api/roadmap` with Pydantic response models.
- SQLite initialization is repeatable; seed inserts are idempotent and the database path is absolute after resolving a root-relative configuration value.
- `QUESTLINE_CORS_ORIGINS` configures the allowed browser origins.
- A new completion returns HTTP 201; a repeated completion returns HTTP 200 with the original completion and XP total. Missing quests return 404, and ineligible locked quests return 409.
- Completion writes use `BEGIN IMMEDIATE` and a single transaction for the completion row, XP ledger entry, and quest status update. A unique completion per quest and unique ledger reference prevent duplicate XP. The UI does not update XP optimistically.
- XP is assigned by category: Welcome/Learn/Explore 10, Practice/Build 25, Milestone 150, and unknown categories 10. Reward amounts can be overridden using `QUESTLINE_XP_LEARNING`, `QUESTLINE_XP_CODING`, and `QUESTLINE_XP_MILESTONE`.
- Each completion stores a UTC timestamp and a local calendar date using `QUESTLINE_TIMEZONE` (default `Asia/Kolkata`). Streaks use distinct stored activity dates; multiple completions on one local date count as one day, and no seed activity is created.
- `user_settings` stores one row (`singleton_id = 1`) with a daily goal of 30/45/60/90 minutes, an IANA timezone, reminder/celebration booleans, and a UTC update timestamp. The environment timezone is the default before the row exists; after a save, the stored timezone controls future completion dates, streak boundaries, and history windows.
- Existing completion `local_date` values are immutable when a timezone changes. Historical activity remains attributed to its recorded completion date; new completions use the saved timezone.
- `GET /api/progress/activity?days=N` accepts 1–366 days ending on the current date in the configured timezone. Completion counts come from `quest_completions`; XP comes from linked `xp_ledger` rows grouped by completion local date. Zero-filled dates exist only in the response.
- Weekly review ranges are Monday through Sunday local calendar dates, unique by start date, and timestamped in UTC.
- Deadline due dates and optional times are local wall-clock values in the configured timezone (saved user timezone, falling back to `QUESTLINE_TIMEZONE`). Persisted status is `pending` or `completed`; classification is derived as `upcoming`, `overdue`, or `completed`, with date-only deadlines remaining upcoming through their due date.
- Review and deadline writes use parameterized SQLite operations in transactions. Pydantic validates dates, times, URLs, week ranges, statuses, and UUID route IDs.
- Reminder delivery remains future work; reminder and celebration toggles are persisted preferences only.

## Data and trust boundaries

- Quest and phase definitions, completion records, and XP ledger entries are persisted.
- Quest work state is additive and keyed to existing quest IDs; database initialization creates the table without reseeding or changing existing progress, settings, reviews, or deadlines.
- The backend, not the browser, will determine XP amounts and completion eligibility.
- UTC completion timestamps and configured local dates are stored. Streak calculation treats multiple completions in a date as one active day.
- The roadmap contains personal planning windows only. Official GSoC dates require a verified source and status.
- Environment files are excluded from version control; `.env.example` files contain configuration names and safe local defaults only.

## Planned persistence

The SQLite layer stores roadmap phases, phase quest titles, quest definitions, completion records, an XP ledger, one user settings record, weekly reviews, and personal deadlines. New tables and indexes are created idempotently without resetting existing quest progress or settings.

## Phase 4 validation status

Phase 4 browser verification passed against an isolated temporary SQLite database: the dashboard loaded API quests, completion displayed the server-assigned XP reward, and completed status/XP remained after refresh. Repeated completion returned the original result without a second reward. Stopping FastAPI produced the visible retryable error; restarting it restored the saved state. No unexplained browser console errors occurred in the normal flow.

Phase 5 browser verification also covered review save/history/refresh and deadline create/edit/classification/completion/deletion, including confirmation before deletion. Dashboard deadline and review indicators were checked, and the weekly-review and deadline screens had no horizontal overflow at 375px. The browser check used temporary data; the user's development database and existing services were not modified.

Phase 6 validation: 49 backend tests passed (one upstream Starlette/AnyIO deprecation warning); Ruff, mypy, frontend lint, typecheck, formatting check, and production build passed. Settings save/refresh and empty/populated activity views were browser-checked against a temporary database; at 375px, settings/progress had no horizontal overflow. An additional isolated settings API process restart retained saved settings. Reminders are saved as preferences only and are not delivered.

Phase 7 validation passed the backend/frontend suites, production build and PWA asset responses, active service-worker registration/cache inspection, all seven routes at 320/375/768/1280px, keyboard spot-checks, offline fallback/recovery, and a safely aborted offline completion mutation. The current backend on port 8000 uses the existing SQLite database, and the pre-restart backup was verified. Native installation remains platform-dependent and unverified; see `docs/PHASE_7_PLAN.md` for exact results and data limitations.
