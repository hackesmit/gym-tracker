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
| `/settings` | Settings | Units (lbs/kg), rest timer defaults |

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

## Current Program
"The Essentials" by Jeff Nippard — 4x/week, 12 weeks. Imported from .xlsx spreadsheet.
