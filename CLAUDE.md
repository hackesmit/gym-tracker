# Gym Tracker

## Project Overview
Full-stack gym workout tracker. Upload training programs from Excel spreadsheets, log sets/reps/weight, track progressive overload, and view analytics. Built for personal use by Daniel (hackesmit).

## Live URLs
- **Frontend:** https://gym-tracker-six-virid.vercel.app/
- **Backend API:** https://gym-tracker-09w0.onrender.com/
- **Database:** Supabase project `cjokzjmmypoxawnftilz` (Postgres)
- **Repo:** https://github.com/hackesmit/gym-tracker

## Tech Stack
- **Frontend:** React 18 + Vite + Tailwind CSS (PWA-enabled)
- **Backend:** FastAPI (Python 3.11+)
- **Database:** Supabase Postgres (production) / SQLite (local dev)
- **Hosting:** Vercel (frontend) + Render free tier (backend, cold starts ~30s)

## Project Structure
```
gym-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry point, CORS, lifespan
│   │   ├── database.py       # SQLAlchemy engine (Postgres/SQLite)
│   │   ├── models.py         # All ORM models (8 tables)
│   │   ├── parser.py         # Excel spreadsheet parser
│   │   ├── seed_catalog.py   # Exercise catalog seeder
│   │   ├── routers/
│   │   │   ├── programs.py   # Program CRUD + import + exercise swap
│   │   │   ├── logging.py    # Set/session logging (supports dropsets)
│   │   │   ├── tracker.py    # Workout tracker + calendar
│   │   │   └── analytics.py  # Progress, volume, recovery, DOTS
│   │   └── analytics/        # Analytics calculation modules
│   ├── requirements.txt
│   └── Procfile              # Render start command
├── frontend/
│   ├── src/
│   │   ├── api/client.js     # All API calls (single file)
│   │   ├── components/       # Card, LoadingSpinner (skeleton), RestTimer
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx # Overview + program import
│   │   │   ├── Tracker.jsx   # Guided workout tracker
│   │   │   ├── Logger.jsx    # Log sets with dropset + exercise swap UI
│   │   │   ├── Progress.jsx  # Exercise progress charts
│   │   │   ├── Analytics.jsx # Volume, tonnage, strength, balance
│   │   │   ├── Recovery.jsx  # Recovery metrics
│   │   │   ├── History.jsx   # Past workout sessions browser
│   │   │   ├── Program.jsx   # Program schedule view
│   │   │   └── Settings.jsx  # Units (lbs/kg) + rest timer config
│   │   ├── context/AppContext.jsx  # Global state: programs, units, rest timer
│   │   └── hooks/
│   ├── public/
│   │   ├── manifest.json     # PWA manifest
│   │   ├── icon.svg          # App icon (dumbbell)
│   │   └── sw.js             # Service worker (offline caching)
│   ├── vercel.json           # SPA rewrites
│   ├── vite.config.js
│   └── package.json
├── docs/                     # Design docs
├── data/                     # Local SQLite DB (gitignored)
└── start-dev.ps1             # Local dev launcher
```

## Pages / Routes
| Route | Page | Purpose |
|---|---|---|
| `/` | Dashboard | Overview, program import |
| `/tracker` | Tracker | Guided session tracking |
| `/log` | Logger | Log sets/reps/weight, dropsets, exercise swap |
| `/progress` | Progress | Per-exercise progress charts |
| `/analytics` | Analytics | Volume, tonnage, strength standards, balance |
| `/recovery` | Recovery | Recovery metrics |
| `/history` | History | Browse past sessions by date |
| `/program` | Program | View program schedule |
| `/settings` | Settings | Units (lbs/kg), rest timer defaults, manual 1RM entry |

## Local Development
```powershell
# Option 1: One-click
./start-dev.ps1

# Option 2: Manual
cd backend && python -m uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```
No env vars needed locally — SQLite fallback + Vite proxy handle everything.

## Environment Variables
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Render | Supabase Postgres connection string (pooler URL, port 5432) |
| `ALLOWED_ORIGINS` | Render | Vercel domain: `https://gym-tracker-six-virid.vercel.app` |
| `VITE_API_URL` | Vercel | `https://gym-tracker-09w0.onrender.com/api` |

## Key Conventions
- All API routes are prefixed with `/api`
- Frontend uses relative `/api` path locally (Vite proxy) and `VITE_API_URL` in production
- Database tables auto-create on startup via `Base.metadata.create_all()`
- Exercise catalog auto-seeds on startup
- Excel uploads are parsed immediately and stored in DB — files are ephemeral on Render
- Default units are **lbs** (stored internally as kg, converted on display)
- User settings (units, rest timer) persist in localStorage
- Render free tier has ~30s cold starts — skeleton loader handles this with "Waking up server..." message

## File Responsibilities
- Database queries/config → `database.py` only
- New API endpoints → appropriate router in `routers/`
- New analytics → `analytics/` module + wire through `routers/analytics.py`
- All frontend API calls → `api/client.js` only
- New UI components → `components/`
- New pages → `pages/`
- Global state/settings → `context/AppContext.jsx`

## Database Schema (8 tables)
`users`, `programs`, `program_exercises`, `exercise_catalog`, `workout_logs`, `session_logs`, `program_progress`, `body_metrics`

All managed by SQLAlchemy ORM. Foreign keys enforce referential integrity. WorkoutLog supports `is_dropset` and `dropset_load_kg` fields.

### Notable columns
- `User.manual_1rm` — JSON column storing known 1RMs per lift category. New format: `{"bench": {"value_kg": 102.1, "tested_at": "2026-03-20"}}`. Backend handles old bare-float format for backward compat.
- `SessionLog` has `UniqueConstraint("program_id", "week", "session_name")`
- `ProgramExercise` has `UniqueConstraint("program_id", "week", "session_name", "exercise_order")`

## Strength Standards Engine (v2)
The spider chart in Analytics uses an honest estimation system — no machine-to-barbell conversion factors.

**Category rules** (only these exercises qualify):
- **Squat:** barbell back squat, paused back squat, front squat, safety bar squat
- **Deadlift:** conventional, sumo, trap bar, paused deadlift. Romanian DL as low-confidence only
- **Bench:** barbell bench, paused bench, close-grip bench. Incline barbell as low-confidence
- **OHP:** strict press, seated barbell OHP. Seated DB shoulder press as low-confidence
- **Row:** barbell row, Pendlay row, T-bar row. Cable row as low-confidence

**Rejected** (never used for standards): hack squat, leg press, machine squat, machine chest press, DB bench press, cable shoulder press, Smith machine variants.

**Confidence scoring:** `specificity × rep_range × recency`
- Specificity: primary=1.0, close_variant=0.85, low_confidence=0.65
- Rep range: 1-3=1.0, 4-6=0.9, 7-8=0.75, 9-10=0.6, >10=rejected
- Recency: <2wk=1.0, 2-4wk=0.9, 4-8wk=0.75, 8-12wk=0.6, >12wk=0.4

**Manual 1RM** is first-class (not a fallback). Only loses to logged data if logged is both newer AND higher confidence. Includes `tested_at` date for staleness tracking.

## Known Bug Fixes Applied
See `docs/known-bugs.md` for the original audit. Fixes applied:
- Bodyweight exercises saving, unit change wiping sets, PR float comparison
- History timezone shift, Analytics race condition
- DB unique constraints on SessionLog + ProgramExercise
- Recovery score missing-data flag, parser week validation
- Volume analytics logging for missing catalog entries

## Current Program
"The Essentials" by Jeff Nippard — 4x/week, 12 weeks. Imported from .xlsx spreadsheet.
