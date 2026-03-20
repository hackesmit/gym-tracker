# Gym Tracker

Full-stack workout tracker for structured training programs. Upload programs from Excel, log workouts, track progressive overload, and analyze performance.

## Features
- Import training programs from `.xlsx` spreadsheets (e.g., Jeff Nippard templates)
- Log sets, reps, and weight for each exercise
- Track workout sessions with a guided interface
- View analytics: progress charts, volume tracking, muscle balance, recovery metrics
- Calendar view of completed workouts

## Tech Stack
| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | React + Vite + Tailwind CSS | Vercel |
| Backend | FastAPI (Python) | Render |
| Database | PostgreSQL | Supabase |

## Quick Start (Local Dev)
```powershell
# Clone and setup
git clone https://github.com/yourusername/gym-tracker.git
cd gym-tracker

# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate  # Windows
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install

# Run both
cd ..
./start-dev.ps1
```

No environment variables needed for local dev — uses SQLite and Vite proxy.

## Deployment
- **Frontend:** Auto-deploys to Vercel on push
- **Backend:** Auto-deploys to Render on push
- **Database:** Supabase Postgres (tables auto-create on first startup)

See `.env.example` for required environment variables.
