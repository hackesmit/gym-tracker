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
│   │   ├── components/
│   │   │   ├── Card.jsx              # Panel with 6 variants (stone, parchment, forged, heraldic, chronicle, rivendell)
│   │   │   ├── Layout.jsx            # App shell: sidebar nav + mobile header + realm toggle
│   │   │   ├── LoadingSpinner.jsx    # Skeleton loader ("Waking up server...")
│   │   │   ├── ErrorMessage.jsx      # Error display
│   │   │   ├── PlateCalculator.jsx   # Plate loading calculator modal
│   │   │   ├── ProgramUpload.jsx     # Excel file uploader
│   │   │   ├── RestTimer.jsx         # Countdown timer + compact bar variant
│   │   │   ├── SessionSummary.jsx    # Post-session chronicle card
│   │   │   ├── AchievementToast.jsx  # Toast notifications for achievements
│   │   │   ├── LotrIcons.jsx         # 11 LOTR SVG icons (Ring, Sword, Shield, Torch, etc.)
│   │   │   └── RealmBorder.jsx       # Decorative dividers (Gondor, Elven) + PageHeader
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx  # Wisdom quote, Today's Quest, Hall of Records, This Week, Recovery
│   │   │   ├── Tracker.jsx    # Grid/calendar views, heatmap, adherence stats
│   │   │   ├── Logger.jsx     # Log sets: auto-fill, warm-up pyramid, plate calc, dropsets, exercise swap
│   │   │   ├── Progress.jsx   # Per-exercise e1RM charts, projections, PR badges
│   │   │   ├── Analytics.jsx  # Volume, tonnage, strength spider, DOTS, muscle balance, bodyweight
│   │   │   ├── Recovery.jsx   # Recovery score, component breakdown, muscle fatigue, trends
│   │   │   ├── History.jsx    # Chronicle: session browser with expandable details + PR indicator
│   │   │   ├── Program.jsx    # Program schedule, status lifecycle, exercise details
│   │   │   ├── Achievements.jsx # Hall of Heroes: PRs, all-time records, milestones, tiered badges
│   │   │   └── Settings.jsx   # Realm theme picker, units, rest timer, manual 1RM, data export
│   │   ├── context/AppContext.jsx  # Global state: programs, units, rest timer, realm theme
│   │   └── hooks/
│   ├── public/
│   │   ├── manifest.json     # PWA manifest
│   │   ├── fonts/Deutsch.ttf # LOTR display font
│   │   ├── icon.svg          # App icon (dumbbell)
│   │   └── sw.js             # Service worker (offline caching)
│   ├── vercel.json           # SPA rewrites
│   ├── vite.config.js
│   └── package.json
├── docs/
│   ├── ideas.md              # Feature roadmap / brainstorm
│   └── known-bugs.md         # Bug audit and fixes
├── data/                     # Local SQLite DB (gitignored)
└── start-dev.ps1             # Local dev launcher
```

## Pages / Routes
| Route | Page | Purpose |
|---|---|---|
| `/` | Dashboard | Wisdom quote, Today's Quest hero, Hall of Records, This Week stats, Recovery |
| `/tracker` | Tracker | Grid/calendar session views, training heatmap, adherence stats |
| `/log` | Logger | Log sets/reps/weight, auto-fill, warm-up pyramid, plate calc, dropsets, exercise swap |
| `/progress` | Progress | Per-exercise e1RM charts, PR badges, projections |
| `/analytics` | Analytics | Volume, tonnage, strength standards spider, DOTS, muscle balance |
| `/recovery` | Recovery | Recovery score, component breakdown, muscle fatigue map |
| `/history` | Chronicle | Browse past sessions by date, expandable details, PR indicators |
| `/program` | Program | View program schedule, status lifecycle |
| `/achievements` | Achievements | Hall of Heroes: recent PRs, all-time records, milestones, tiered badges |
| `/settings` | Settings | Realm theme picker, units (lbs/kg), rest timer, manual 1RM, data export |

## LOTR Theme System
Modern fitness tracker with subtle Tolkien atmosphere. Professional visual hierarchy, heraldic iconography, motivational feedback.

### 5 Switchable Realm Themes
| Realm | Accent | Surfaces | Vibe |
|---|---|---|---|
| **Gondor** (default) | Antique gold `#c9a84c` | Dark slate `#1a1d2e` | Noble, regal stone |
| **Rohan** | Straw gold `#d4a843` | Warm brown `#1c1a15` | Earthy, windswept plains |
| **Rivendell** | Silver-teal `#5ba3a0` | Deep blue-grey `#151d22` | Ethereal, elven calm |
| **Mordor** | Ember red `#c44a2b` | Near-black `#121010` | Dark, volcanic menace |
| **Shire** | Hobbit green `#6d9b4a` | Warm earth `#1a1714` | Cozy, pastoral comfort |

Theme is applied via `data-realm` attribute on `<html>`. Selection persists in localStorage (`gym-realm`). Quick-toggle in nav + full picker in Settings.

### Panel Variants
- `stone-panel` — default elevated surface
- `parchment-panel` — warm chronicle-like
- `forged-panel` — dwarven dark granite + bronze
- `heraldic-card` — gold-trimmed noble card
- `rivendell-card` — teal-accented elven surface
- `chronicle-card` — session summary treatment

### Heraldic Icon System (LotrIcons.jsx)
| Icon | Usage |
|---|---|
| Ring | Estimated 1RM PR |
| Sword | Strength / weight PR |
| Shield | Consistency |
| Torch | Streak |
| Mountain | Lifetime volume / milestone |
| Crown | Elite achievement |
| WhiteTree | Special honor |
| MapScroll | Program / journey |
| Chronicle | Session summary / history |
| Hammer | Dwarven / forging |
| GondorShield | Gondor realm crest |

### Microcopy
- PR achieved → "A new record is forged."
- Session complete → "The day's training is complete."
- Achievement unlocked → "Honor earned."
- Streak → "The Watch continues."
- Primary actions remain clear: Start Workout, Save, Undo, Settings

### Wisdom of Middle-earth (Dashboard)
Daily Tolkien quote system. 19 quotes (60% epic, 35% wisdom, 5% funny). Deterministic day-index selection with optional refresh button.

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
- User settings (units, rest timer, realm theme) persist in localStorage
- Render free tier has ~30s cold starts — skeleton loader handles this with "Waking up server..." message
- Analytics router uses `_default_user_id(db)` to resolve the actual user — never hardcode `user_id=1`

## File Responsibilities
- Database queries/config → `database.py` only
- New API endpoints → appropriate router in `routers/`
- New analytics → `analytics/` module + wire through `routers/analytics.py`
- All frontend API calls → `api/client.js` only
- New UI components → `components/`
- New pages → `pages/`
- Global state/settings → `context/AppContext.jsx`
- LOTR icons → `components/LotrIcons.jsx`
- Decorative borders → `components/RealmBorder.jsx`
- Theme palettes → `index.css` via `[data-realm]` attribute selectors

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
- **Analytics empty data bug** — all analytics functions hardcoded `user_id=1` but logging used `User.first()`. Fixed by adding `_default_user_id()` helper to analytics router.

## Current Program
"The Essentials" by Jeff Nippard — 4x/week, 12 weeks. Imported from .xlsx spreadsheet.
