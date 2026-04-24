# Gym Tracker

Full-stack multi-user workout tracker. Import training programs from Excel, log sets/reps/weight, track progressive overload, view analytics, compete on medals, share programs by code, and chat with friends.

## Features
- **Programs:** import `.xlsx` (Jeff Nippard format), custom builder, share via 8-char code, re-import anytime, plus 4 preset Nippard variants (2×/3×/4×/5× frequency) importable by code
- **Logging:** auto-fill last session, warm-up pyramid, plate calculator, dropsets, exercise swap
- **Tracking:** week-by-week schedule, calendar view, adherence %, training heatmap
- **Analytics:** per-exercise e1RM charts, PR detection, volume/tonnage, muscle balance, strength-standards spider, DOTS, recovery score
- **Muscle ranks:** 7-tier global strength rating (Copper→Champion) using fixed thresholds — same standard for every user. `GET /api/ranks/standards` exposes the full ladder; the Profile page has an expandable "Rank standards" card per muscle group.
- **Social:** friends, leaderboards, medal awards (claimable from in-workout 1RM attempts or Settings → Manual 1RM), side-by-side compare, global chat, profile pages
- **Account management:** rename yourself from Settings (gated by a word-problem captcha), export all data as JSON/CSV, admin password reset + data wipe
- **i18n:** English + Spanish
- **Theming:** Two modes — minimal (default, editorial) with 13 accent presets (lime, amber, cyan, crimson, ember, saffron, mint, teal, sky, indigo, magenta, rose, ivory) and LOTR mode with 5 realm palettes (Gondor/Rohan/Rivendell/Mordor/Shire). Switchable in Settings; persists via localStorage. Rank badges carry a tier-colored halo in both modes.
- **PWA:** offline caching, installable

## Tech Stack
| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | React 18 + Vite + Tailwind CSS | Vercel (auto-deploy on push) |
| Backend | FastAPI (Python 3.11+) in Docker | Fly.io (manual `flyctl deploy`) |
| Database | PostgreSQL | Supabase |
| Auth | Username/password + JWT (bcrypt) | — |

Local dev uses SQLite — no env vars required.

## Live URLs
- Frontend: <https://gym-tracker-six-virid.vercel.app/>
- Backend: <https://gym-tracker-api-bold-violet-7582.fly.dev/>

## Quick Start (Local Dev)
```powershell
git clone https://github.com/hackesmit/gym-tracker.git
cd gym-tracker

# Backend
cd backend
python -m venv .venv
.venv/Scripts/Activate.ps1   # or source .venv/bin/activate on Linux/Mac
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install

# Run both together (from repo root)
cd ..
./start-dev.ps1
```
Default seeded user: `hackesmit` / `password` (only used in a fresh local DB).

## Deployment
- **Frontend:** push to `master` → Vercel auto-deploys.
- **Backend:** push to `master` → **run `flyctl deploy` manually** from `backend/`. Fly does **not** auto-deploy from GitHub. Schema migrations run on lifespan startup.

## Repository
<https://github.com/hackesmit/gym-tracker>

## Documentation
- `CLAUDE.md` — architecture, conventions, schema, ranking rules, deployment notes
- `docs/ideas.md` — feature roadmap / brainstorm
- `docs/known-bugs.md` — bug audit & fixes
- `docs/plans/` — per-phase implementation plans
- `docs/superpowers/` — design specs from brainstorming sessions
