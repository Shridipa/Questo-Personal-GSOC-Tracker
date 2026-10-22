# Questo Phase 7 plan

## Scope

Keep the Next.js App Router, FastAPI API, SQLite persistence, and current Questo visual design. Do not add push notifications, background sync, or offline writes.

## Implementation

- Add a web app manifest, scalable app icons, mobile theme metadata, and a standalone display mode.
- Add an app-shell client component that registers a small service worker, reports online/offline state, and offers the browser install prompt when available.
- Cache only a static offline explanation page. Never cache or queue API requests, quest completions, or form submissions; API data remains server-authoritative.
- Review and refine mobile navigation, path/chart/form overflow, touch targets, keyboard focus, and reduced-motion rules without changing desktop navigation or page structure.
- Document local PWA behavior, setup, and limitations in the README and architecture/implementation records.

## Verification

- Run backend tests, Ruff, mypy, and frontend lint, typecheck, formatting check, and production build.
- Inspect the running service and app ports first. Do not stop an unrelated or unidentified process or touch the development database.
- Check manifest/icon/service-worker responses and normal application behavior in a browser; exercise offline fallback and mobile widths where browser controls permit.
- Record any unavailable browser or installability checks as blocked rather than claiming success.

## Final verification record — 2026-10-21

### Completed implementation

- The App Router manifest declares standalone display, theme colors, SVG artwork, 192x192/512x512 PNG icons, and a dedicated mask-safe SVG icon.
- The app shell registers `/questline-sw.js`, reports offline and registration errors, and offers installation only when the browser emits `beforeinstallprompt`.
- The service worker caches the static `/offline.html` page only. Same-origin navigations are network-first; it does not handle API reads, cross-origin requests, or writes.
- API data remains server-authoritative. `useApiData` retries its active loader after the browser reports reconnection; the UI does not queue form submissions or quest completions.
- Added four repeatable Node built-in tests in `frontend/tests/service-worker.test.mjs` and the `npm run test:pwa` script.

### Commands run

- `.\.venv\Scripts\python.exe -m pytest backend\tests -q` — **49 passed**, one upstream Starlette/AnyIO `BlockingPortal` deprecation warning.
- `.\.venv\Scripts\python.exe -m ruff check backend` — passed.
- `.\.venv\Scripts\python.exe -m mypy --config-file backend\pyproject.toml` — passed; 7 source files.
- `npm --prefix frontend run lint` — passed.
- `npm --prefix frontend run typecheck` — passed.
- `npm --prefix frontend run format:check` — passed.
- `npm --prefix frontend run build` — passed; the manifest route and all seven feature routes were generated.
- `npm --prefix frontend run test:pwa` — **4 passed**: installation caching/old-cache cleanup, failed-navigation fallback, network-first navigation, and non-interception of API reads/mutations/cross-origin navigation.
- `npx prettier --check tests/service-worker.test.mjs` — passed.

### Confirmed browser and asset results

- The manifest, worker script, offline page, SVG icon, and both PNG icons returned HTTP 200 from the production frontend. PNG headers confirmed 192x192 and 512x512 dimensions. The manifest contains the expected standalone display and icon entries.
- Browser inspection confirmed an active service-worker controller and the cached offline page. The normal dashboard loaded real seeded data from a temporary updated API.
- Seven app routes were previously rendered at 320px without horizontal overflow. Settings and progress were also checked at 375px; the mobile planning menu opened and Escape closed it. Normal-flow checks had no console errors.
- Offline UI state and reconnection were attempted with browser emulation, but the browser automation session became unresponsive when toggling network state. Therefore, actual offline navigation, recovery, refresh-after-reconnect, and failed form submission are **not confirmed in a real-browser session**. The Node service-worker tests pass, but do not replace that browser check.
- The browser did not emit `beforeinstallprompt`. The site was served from loopback (a secure context suitable for service-worker registration), and manifest/icon/worker eligibility inputs were checked. Native browser installation and the install prompt remain **unverified**; support and event delivery depend on browser/platform installation criteria.
- The complete viewport matrix at 320, 375, 768, and 1280px was not completed. Existing browser evidence covers all seven routes at 320px plus the narrower 375px settings/progress checks; 768px/1280px and a full four-width keyboard/focus/touch/reduced-motion audit remain outstanding.
- Final polish made the skip-navigation destination focusable and replaced the maskable manifest entry with a dedicated icon that keeps its artwork within the mask-safe area. After these changes, frontend lint, typecheck, format check, production build, and all four service-worker tests passed again. Browser verification of skip-link focus and mask rendering remains part of the outstanding browser audit.
- The new maskable SVG parsed successfully, declares a 512x512 viewBox, and is referenced by the manifest. Its HTTP response and rendering in a native install surface were not independently rechecked after the asset change.

### Targeted follow-up — 2026-10-21 23:56 +05:30

- Rechecked the shared browser sessions. `readPage`, navigation, and Playwright failed to connect to the browser over CDP (30-second timeout); the local frontend also has no resolvable Playwright or Puppeteer package. A single screenshot of the shared file tab displayed only a cropped portion of the maskable SVG, and a subsequent full-element capture also timed out. Consequently, this pass did not produce complete rendered-page, offline/reconnect, native-install, keyboard/focus, viewport-matrix, or full-icon safe-area visual evidence. The shared browser connection failure is a blocker, not a passing check.
- From the running frontend on port 3002, `/icons/questline-maskable-512.svg` returned **200** with `image/svg+xml`, and `/manifest.webmanifest` returned **200** and referenced that icon. The icon’s full-bleed background and centered star geometry are within the central mask-safe area by source inspection. A browser/native-install visual rendering remains unverified.
- Rechecked port 8000: `/health` returned **200**, while `/api/settings` and `/api/progress/activity?days=7` returned **404**. Windows TCP-table and process-memory queries identified listener PID 52628 as the expected Python 3.11 executable, with working directory `C:\Users\KIIT\Downloads\GSOC Tracker\` and command line `-m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`. Read-only inspection of that listener's environment confirmed `QUESTLINE_DATABASE_PATH`, `QUESTLINE_TIMEZONE`, and `QUESTLINE_CORS_ORIGINS` are unset. Per `backend/app/database.py`, its database path therefore resolves to the project-root `data\questline.db`. No service or database was changed.
- The listener command and working directory confirm the actual launch configuration needed to reproduce it. The README's documented alternative is to run from `backend\` with `uvicorn app.main:app --reload --env-file .env`; that alternative was not run. Do not restart the existing listener until the intended launch configuration and preservation of the current database are confirmed in an environment with safe process management.
- No new automated suite was run in this follow-up; the previously recorded backend and frontend results remain the latest suite results. Phase 7’s browser-level acceptance items remain open as listed below.

### Backend mismatch follow-up — 2026-10-22

- Confirmed `backend\.env` and `frontend\.env.local` are absent. `backend\.env.example` sets `QUESTLINE_DATABASE_PATH=data/questline.db`; when resolved by `backend/app/database.py`, this is the project-root `data\questline.db`, matching the running process's unset override/default. The current frontend API client defaults to port 8000.
- Compared the running listener's start time (**2026-10-21 13:44:09 UTC**) with `backend/app/main.py`'s last modification (**2026-10-21 15:23:36 UTC**). The source was changed after the process started. Combined with the current source declaring the endpoints and the live listener returning 404 for them, this confirms the service is stale/unreloaded; its command and database path are not the mismatch.
- Fresh backend validation: `.\.venv\Scripts\python.exe -m pytest backend\tests -q` — **49 passed**, one upstream Starlette/AnyIO deprecation warning; `ruff check backend` — passed; `mypy --config-file backend\pyproject.toml` — passed, 7 files.
- Ran the current FastAPI app with `TestClient` and an automatically cleaned temporary SQLite database. `/health`, `/api/settings`, and `/api/progress/activity?days=7` all returned **200**. This verifies current route wiring without touching the listener or development database.
- Retried reading the shared localhost frontend page in the browser integration; CDP again timed out after 30 seconds. No new responsive viewport, keyboard/accessibility, offline/reconnect, installability, or full-frame icon-render evidence was obtained.
- At the time of this follow-up, restart remained **not performed** because PowerShell was unavailable. The later restart and preservation verification are recorded below.

### Historical backend process state

- The original PID 52628 returned 200 for `/health` and 404 for the newer settings/activity endpoints. It was later confirmed stale because `backend/app/main.py` had been modified after that process started.
- The process and database were left untouched during the initial investigation. The subsequent backed-up, PID-specific restart and live endpoint verification are recorded below.

### Historical remaining checks — intermediate snapshot

- Repeat offline navigation, reconnection, and a failed mutation in a responsive real-browser session that supports reliable network emulation.
- Complete all seven routes at 375, 768, and 1280px; verify keyboard activation, visible focus, skip navigation, touch targets, and reduced motion.
- Verify native install behavior on a supported browser/device. Do not synthesize `beforeinstallprompt`.
- At this intermediate snapshot, the current API was running on port 8000 against the existing database; browser-level acceptance was still open. The backed-up restart and later browser evidence below supersede this status.

### Backed-up backend restart and persistence check — 2026-10-22

- Before stopping the stale listener, created a SQLite-consistent online backup at `data/backups/questline-pre-restart-20261022-000817+0530.sqlite3`. `PRAGMA quick_check` returned `ok`; SHA-256: `072349997b0714d4104566af288812edf7bff8a283d0b4b3fcb88e568761a07f`.
- The backup contained 7 phases and 8 quests, but no `user_settings`, `quest_completions`, or `xp_ledger` tables. Thus the old database had no persisted completion/XP or settings values to compare; settings had been served as defaults. A dry-run initialization on a disposable backup copy created the expected newer tables while preserving all existing phase and quest rows exactly. The dry-run file was removed.
- Re-verified that port 8000 belonged to PID 52628, with the exact stale Uvicorn command and project-root working directory, immediately before stopping only that PID. No broad process-name termination was used.
- Started the current app with the repository `.venv` Python, from the project root, using `-m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`. The running listener is PID 30392 (launched through parent PID 46852). The database path was explicitly set to the existing project-root `data/questline.db`; timezone and CORS settings match `backend/.env.example`. Startup log: `data/backups/backend-restart-20261022.log`.
- Live endpoint checks returned **200**: `/health`, `/api/settings`, `/api/progress/activity?days=7`, `/api/progress`, and `/api/quests`. Database integrity remained `ok`; all 8 quest rows and 7 phase rows matched the pre-restart backup exactly. Completion and XP counts remain zero. The settings endpoint correctly returns default values (`45` daily-goal minutes, `Asia/Kolkata`, reminders and celebrations enabled, `updated_at_utc: null`); these are defaults, not previously persisted settings.
- At the time of restart, the shared browser integration still timed out on CDP, so no browser evidence was available yet. The subsequent local Edge results are recorded below.

### Final local Edge browser follow-up — 2026-10-22

- Used a temporary Edge 155 headless profile against the existing local frontend on port 3002. The profile and its temporary browser process were cleaned up after testing; the backend and development database were not restarted or modified for browser checks.
- Rendered `/`, `/quests`, `/roadmap`, `/progress`, `/weekly-review`, `/deadlines`, and `/settings` at 320, 375, 768, and 1280 CSS pixels: **28 route/viewport checks passed with no horizontal overflow**. After the mobile sizing fix in `frontend/src/app/globals.css`, visible action buttons and bottom-navigation links in the tested views were at least 44px high/wide.
- Keyboard checks confirmed Tab focuses the skip-navigation link, Enter moves focus to `main#main-content`, Enter and Space activate the planning menu, and Escape closes it. The reduced-motion preference was recognized and the reduced-motion stylesheet rule was present.
- Inspected the complete 512x512 maskable SVG in Edge: the white star is centered with padding inside the safe area. The service worker was active and controlled the app document, its offline fallback was cached, and the manifest referenced the maskable icon.
- Offline emulation showed the accessible offline notice. An uncached same-origin navigation returned the static offline fallback from the service worker. In that browser run, restoring connectivity and reloading `/quests` returned the API-backed quest page without a loading error. No browser console errors were recorded during this offline/fallback/recovery run.
- In a separate isolated offline browser run, clicked the eligible “Review Git branching, commits & pull requests” quest while the page and worker were offline. CDP intercepted and failed the `POST /api/quests/git-workflow/complete` before it reached FastAPI. The UI displayed an accessible `role="alert"` with the API connection failure, and the completion button remained available. The database still had **0 completions, 0 XP ledger points, and 0 completed quests**; `PRAGMA quick_check` returned `ok`. This confirms the failed mutation was not reported as successful and did not change real user data.
- Headless Edge emitted `beforeinstallprompt` without synthesizing the event. This confirms the event path in that test browser only; native installation on a supported desktop or mobile browser/device remains **unverified**.
- The local headless-browser checks close the viewport, keyboard spot-check, icon safe-area, offline-fallback/recovery, and failed-mutation items above. Native installation remains the outstanding platform-dependent browser check. No Phase 8 implementation has started.

### Follow-up verification — 2026-10-22

#### Backend and data

- At the start of this pass, port 8000 refused connections; no listener was available to identify or stop. The prior stale listener had already been handled in the backed-up restart recorded above. The existing SQLite-consistent backup still passes `PRAGMA quick_check` and retains SHA-256 `072349997b0714d4104566af288812edf7bff8a283d0b4b3fcb88e568761a07f`.
- Started the current FastAPI app against the existing `data/questline.db`, from the project root, using the repository `.venv` Python and `uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`. The live TCP listener was confirmed as the Python 3.11 process running that exact command (PID 28624 at final inspection). Startup output is in `data/backups/backend-phase7-20261022.log`.
- Read-only checks returned **200** for `/health`, `/api/settings`, `/api/progress/activity?days=7`, `/api/progress`, `/api/progress/xp-history`, `/api/reviews`, `/api/deadlines`, and `/api/quests`. Settings contain the documented defaults, not previously saved preferences. The active database has **7 phases, 8 quests, 0 completions, 0 XP ledger points, 0 deadlines, and 0 weekly reviews**; `PRAGMA quick_check` is `ok`.
- The pre-restart backup contains the same 7 phase and 8 quest rows and no progress/settings/review/deadline tables. Thus there were no prior records in those newer data sets to compare; no browser test wrote to the actual database.

#### Browser and assets

- Repeated all seven routes at **320, 375, 768, and 1280px** in the local browser: **28/28 returned 200, with no horizontal overflow, console errors, or failed network requests** in the normal route flow.
- A second touch-target pass found the dashboard’s `.start-quest` button was only 38px high at tablet width. Raised its minimum height to 44px in `frontend/src/app/globals.css` and repeated the matrix. No app action button or navigation link below 44px remained at 320, 375, or 768px.
- Keyboard verification: Tab focused “Skip to content”, whose rendered focus indicator was visible (solid 2.67px outline); Enter moved focus to `main#main-content`; Enter opened the mobile “More navigation” menu; Escape closed it and returned `aria-expanded` to `false`. Emulated reduced motion was reflected by `prefers-reduced-motion: reduce`.
- The active worker had scope `http://127.0.0.1:3002/`, controlled the app, and had `/offline.html` cached. Offline mode showed the visible offline notice; an uncached same-origin navigation rendered “You’re offline”. Restoring the network and loading `/quests` returned API-backed quest data without an error.
- Aborted the eligible quest completion POST in the browser before it reached the API. The UI displayed the API failure in an accessible alert, kept the completion button available, and did not show success. Read-only database checks remained at zero completions/XP and integrity `ok`. The service-worker tests also confirm API reads and mutations are not intercepted.
- The manifest returned valid JSON with `display: standalone`; the 192 and 512 PNG icons were HTTP 200 with matching dimensions, and the worker, offline page, and maskable SVG returned 200 with expected content types. Inspected the full 512x512 maskable SVG in the browser; its centered star sits within the mask-safe area.
- `beforeinstallprompt` had been observed in the previous unsynthesized headless Edge run. Actual native installation remains **unverified** because no supported native install surface was available. On direct SVG inspection, the VS Code browser-view injected preload logged its own errors; no Questline application error occurred in the normal-route matrix. The deliberately aborted POST produced the expected failed-request console event.
- The temporary frontend process used for browser verification was identified by its Next.js command line and stopped by its specific PIDs. Port 3002 is now closed; the current backend on port 8000 remains running.

#### Fresh automated checks

- `.\.venv\Scripts\python.exe -m pytest backend\tests -q` — **49 passed**, one upstream Starlette/AnyIO `BlockingPortal` deprecation warning.
- `.\.venv\Scripts\python.exe -m ruff check backend` — passed.
- `.\.venv\Scripts\python.exe -m mypy --config-file backend\pyproject.toml` — passed; 7 source files.
- `npm --prefix frontend run lint` — passed.
- `npm --prefix frontend run typecheck` — passed.
- `npm --prefix frontend run format:check` — passed.
- `npm --prefix frontend run test:pwa` — **4 passed**.
- `npm --prefix frontend run build` — passed after the 44px touch-target correction; all seven app routes and the manifest route were generated.

The viewport, keyboard spot-check, offline fallback/recovery, safe failed-mutation, backend, asset, and automated checks are now evidenced. Native installation remains the only platform-specific limitation; keep Phase 8 on hold until that limitation is accepted or separately verified.

### Native-browser installability attempt — 2026-10-22

- Checked the app in Microsoft Edge **155.0.4283.62** on Windows, using a disposable Edge profile and the local app at `http://127.0.0.1:3002/`. The origin was a secure context, `Page.getAppManifest` parsed the manifest with no errors, and `Page.getInstallabilityErrors` returned an empty list.
- An unsynthesized `beforeinstallprompt` event was observed in the non-headless Edge window, and the Questline install affordance appeared. The page was not running in standalone display mode.
- The browser-native installation confirmation could not be completed through the available browser automation. No `appinstalled` event was observed, and standalone launch mode was not verified. Therefore **native installation remains unverified**; do not claim Phase 7's install acceptance check passed.
- The Edge profile was temporary and removed without completing installation. The temporary frontend on port 3002 was stopped after verification; the current backend on port 8000 was left running.
- A final read-only database check found a change since the earlier zero-progress snapshot: three completion records (`git-workflow`, `first-issue`, and `openvino`) and 170 XP, recorded between 06:03:59Z and 06:04:51Z on 2026-10-22. The separate failed-mutation test had intercepted its POST before it reached the API, but the source of these later successful records cannot be established from the available evidence. They were not reverted. To preserve the newly observed state, created a SQLite online backup at `data/backups/questline-native-install-check-20261022-113803+0530.sqlite3`; `PRAGMA quick_check` returned `ok`, SHA-256 `1784c717e2b536456cf876ca5a6daf082ecd549dcd697e6d7a52746fd251c5dc`. The earlier pre-restart backup remains unchanged.
