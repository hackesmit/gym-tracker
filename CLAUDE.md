# Gym Tracker

## Project Overview
Full-stack gym workout tracker. Upload training programs from Excel spreadsheets, log sets/reps/weight, track progressive overload, and view analytics. Built for personal use.

## Tech Stack
- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** FastAPI (Python 3.11+)
- **Database:** Supabase Postgres (production) / SQLite (local dev)
- **Hosting:** Vercel (frontend) + Render (backend)

## Project Structure
```
gym-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry point, CORS, lifespan
│   │   ├── database.py       # SQLAlchemy engine (Postgres/SQLite)
│   │   ├── models.py         # All ORM models
│   │   ├── parser.py         # Excel spreadsheet parser
│   │   ├── seed_catalog.py   # Exercise catalog seeder
│   │   ├── routers/
│   │   │   ├── programs.py   # Program CRUD + import
│   │   │   ├── logging.py    # Set/session logging
│   │   │   ├── tracker.py    # Workout tracker + calendar
│   │   │   └── analytics.py  # Progress, volume, recovery
│   │   └── analytics/        # Analytics calculation modules
│   ├── requirements.txt
│   └── Procfile              # Render start command
├── frontend/
│   ├── src/
│   │   ├── api/client.js     # All API calls (single file)
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route pages
│   │   ├── context/          # React context providers
│   │   └── hooks/            # Custom hooks
│   ├── vercel.json           # SPA rewrites
│   ├── vite.config.js
│   └── package.json
├── docs/                     # Design docs
├── data/                     # Local SQLite DB (gitignored)
└── start-dev.ps1             # Local dev launcher
```

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
| `DATABASE_URL` | Render | Supabase Postgres connection string |
| `ALLOWED_ORIGINS` | Render | Comma-separated allowed CORS origins |
| `VITE_API_URL` | Vercel | Backend URL (e.g. `https://app.onrender.com/api`) |

## Key Conventions
- All API routes are prefixed with `/api`
- Frontend uses relative `/api` path locally (Vite proxy) and `VITE_API_URL` in production
- Database tables auto-create on startup via `Base.metadata.create_all()`
- Exercise catalog auto-seeds on startup
- Excel uploads are parsed immediately and stored in DB — files are ephemeral

## File Responsibilities
- Database queries/config → `database.py` only
- New API endpoints → appropriate router in `routers/`
- New analytics → `analytics/` module + wire through `routers/analytics.py`
- All frontend API calls → `api/client.js` only
- New UI components → `components/`
- New pages → `pages/`
