# Questo

Questo is a gamified learning tracker for preparing for GSoC 2027 and other open-source
mentorship programs. It turns a long-term contribution goal into small, actionable quests — and
now also tracks real open-source contributions end to end: from studying an issue, through PR
review feedback, to a contribution portfolio you can share.

## What Questo does today

- **Quests, roadmap, deadlines, weekly review** — gamified planning with XP, streaks, and badges.
- **Organization & repository explorer** — browse GitHub organizations, inspect public
  repositories, find "good first issue"-style issues.
- **Contribution journeys** — track one repository contribution per journey: checklist,
  investigation journal (analysis, reproduction steps, proposed solution), personal tasks, and
  real GitHub data (attached issue and PR, verified against the journey's repository).
- **PR review intelligence** — sync reviews and review-thread comments for your PR from GitHub;
  changes-requested items become a personal feedback tracker (your own tracking state and
  response notes, kept separate from GitHub's immutable review state).
- **Contribution portfolio** (`/portfolio`) — an accurate, private summary of your recorded
  journeys. Outcomes (`merged`, `open`, `closed without merging`) come from GitHub-confirmed PR
  data only, and the shareable text summary includes only fields you chose to document.

Everything user-specific is private to the signed-in account; journey data is scoped by user.

## Architecture

```text
Browser
  └── Next.js App Router (frontend/)
      ├── Supabase auth (email sign-in/sign-up) in the browser
      ├── Runtime-validated API client (src/lib/api.ts)
      └── Views: dashboards, explore, journey workspace, portfolio

FastAPI backend (backend/)
  ├── Supabase JWT verification — every /api/journeys and /api/portfolio request
  │   is scoped to the authenticated user id
  ├── SQLite storage (journeys, checklists, journals, tasks, cached PR reviews/feedback)
  └── GitHub REST client for public data (orgs, repos, issues, PRs, reviews)
```

More detail lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local setup

Requirements: Python 3.11+, Node 20+.

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Point the frontend at the local backend with `NEXT_PUBLIC_API_BASE_URL` (see below).

### Environment variables

Frontend (`.env.local` in `frontend/`):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, enables sign-in |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `NEXT_PUBLIC_API_BASE_URL` | Backend base URL (defaults to same-origin `""`) |

Backend:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL used to verify JWTs |
| `SUPABASE_JWT_SECRET` | Secret used to verify Supabase JWT signatures |
| `QUESTLINE_DATABASE_PATH` | SQLite file location (default: `data/questline.db`) |
| `QUESTLINE_TIMEZONE` | IANA timezone for weekly review / streaks (default: UTC) |
| `GITHUB_TOKEN` | **Optional.** Server-side only; raises the GitHub API rate-limit ceiling |
| `GITHUB_CACHE_TTL_REPOS_HOURS` / `GITHUB_CACHE_TTL_ISSUES_MINUTES` / `GSOC_ORGS_SYNC_TTL_HOURS` | GitHub cache TTLs |

Without Supabase variables the app still runs with local/quest features degraded (sign-in shows
a setup notice); without `GITHUB_TOKEN`, GitHub data still works under the unauthenticated
60-requests-per-hour limit, and cached data is served between refreshes.

## Running the tests

```bash
# Backend: pytest and mypy (run pytest from the repository root, tests import backend.app.*)
python -m pytest backend/tests
cd backend && python -m mypy app --config-file pyproject.toml

# Frontend
cd frontend
npm test          # node --test unit tests (API client helpers, portfolio summary)
npm run typecheck
npm run lint
npm run format:check
npm run build     # production build
```

## Current limitations

- The portfolio is private to your account; there is no public sharing page yet.
- PR review sync is manual (a "Sync reviews" button) — nothing is fetched automatically.
- Your review-tracking state (addressed, notes) is private data only; it never claims anything
  on GitHub, and GitHub's own review states are immutable once synced.
- Storage is a single SQLite file; the backend is designed for local/single-process use and
  serverless deployment (Vercel), not multi-instance concurrency.
- GitHub integration reads public data only. Unauthenticated API access is rate-limited by IP;
  configure `GITHUB_TOKEN` if you hit limits.
