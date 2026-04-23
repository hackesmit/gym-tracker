# Gym Tracker

## Project Overview
Full-stack multi-user gym workout tracker. Upload training programs from Excel, log sets/reps/weight, track progressive overload, analyze performance, compete on medals/leaderboards, and chat. Originally built for personal use by Daniel (hackesmit); now multi-user with share-code program exchange.

## Live URLs
- **Frontend:** https://gym-tracker-six-virid.vercel.app/
- **Backend API:** https://gym-tracker-api-bold-violet-7582.fly.dev/ (Fly.io — authoritative)
- **Legacy backend (dead):** https://gym-tracker-09w0.onrender.com/ — Render free tier, returns 404, no longer used
- **Database:** Supabase project `cjokzjmmypoxawnftilz` (Postgres)
- **Repo:** https://github.com/hackesmit/gym-tracker

## Tech Stack
- **Frontend:** React 18 + Vite + Tailwind CSS (PWA-enabled)
- **Backend:** FastAPI (Python 3.11+) in a Docker container
- **Database:** Supabase Postgres (production) / SQLite (local dev)
- **Hosting:** Vercel (frontend, auto-deploys on push) + Fly.io (backend, **manual** `flyctl deploy`)
- **Auth:** Username/password with JWT (HS256, 7–30 day TTL, `bcrypt` hashes)

## Deployment notes
- Fly.io does **not** auto-deploy from GitHub. After merging to `master`, run:
  ```powershell
  cd backend
  flyctl deploy --app gym-tracker-api-bold-violet-7582
  ```
- Vercel auto-deploys on every push to `master`.
- DB migrations are executed on FastAPI lifespan startup via `_run_migrations()` in `main.py` (idempotent `ALTER TABLE … ADD COLUMN` with inspector guard). No Alembic.

## Project Structure
```
gym-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI entry, CORS, lifespan migrations
│   │   ├── database.py            # SQLAlchemy engine (Postgres/SQLite)
│   │   ├── models.py              # 18 ORM models (see Database Schema)
│   │   ├── parser.py              # Excel (.xlsx) → program exercise dicts
│   │   ├── seed_catalog.py        # Exercise catalog seeder
│   │   ├── medal_engine.py        # Medal awarding logic + catalog seed
│   │   ├── rank_engine.py         # Fixed-threshold muscle rank engine
│   │   ├── muscle_rank_config.py  # Tier thresholds + qualifying exercise lists
│   │   ├── auth.py                # bcrypt + JWT helpers + get_current_user dep
│   │   ├── routers/
│   │   │   ├── auth.py        # register/login/me/absorb/admin-reset
│   │   │   ├── programs.py    # Import/custom/list/schedule/status + share code
│   │   │   ├── logging.py     # Set/session logging (supports dropsets, bulk)
│   │   │   ├── tracker.py     # Weekly session tracker + adherence
│   │   │   ├── analytics.py   # Volume, e1RM, muscle balance, recovery, DOTS
│   │   │   ├── dashboard.py   # Aggregated dashboard payload
│   │   │   ├── friends.py     # Friend requests/accept/decline + friend IDs
│   │   │   ├── medals.py      # Medal catalog + current holders + my medals
│   │   │   ├── ranks.py       # Muscle ranks (+ friend compare)
│   │   │   ├── social.py      # Feed + leaderboard + compare
│   │   │   ├── chat.py        # Global chat messages (system + user)
│   │   │   ├── cardio.py      # Cardio log CRUD + summary
│   │   │   └── vacation.py    # Vacation period CRUD (streak grace)
│   │   └── analytics/         # Per-metric calculation modules
│   ├── tests/                 # 55+ pytest tests (conftest uses in-mem SQLite)
│   ├── requirements.txt
│   ├── Dockerfile             # Used by Fly.io
│   ├── fly.toml               # Fly.io app config (iad region, shared-cpu-1x)
│   └── Procfile               # Legacy Render start command (unused)
├── frontend/
│   ├── src/
│   │   ├── api/client.js              # All API calls (single file)
│   │   ├── context/
│   │   │   ├── AppContext.jsx         # Programs, units, rest timer, realm theme, language
│   │   │   └── AuthContext.jsx        # Current user + login/logout + token
│   │   ├── components/
│   │   │   ├── Card.jsx               # 6 panel variants (stone/parchment/forged/…)
│   │   │   ├── Layout.jsx             # App shell + sidebar nav + realm toggle
│   │   │   ├── LoadingSpinner.jsx     # "Waking up server…" skeleton (cold-start safe)
│   │   │   ├── ErrorBoundary.jsx      # Catch render crashes with reload option
│   │   │   ├── ErrorMessage.jsx
│   │   │   ├── Toast.jsx              # Replaces alert()
│   │   │   ├── AchievementToast.jsx   # Achievement notifications
│   │   │   ├── PlateCalculator.jsx    # Plate-loading calculator modal
│   │   │   ├── RestTimer.jsx          # Countdown + compact bar variant
│   │   │   ├── WarmUpPyramid.jsx      # Auto-generated warm-up pyramid widget
│   │   │   ├── ProgramUpload.jsx      # Excel (.xlsx) uploader
│   │   │   ├── ProgramBuilder.jsx     # Custom-program builder (sessions + exercises)
│   │   │   ├── ProgramShareModal.jsx  # Enable share / copy code / revoke
│   │   │   ├── ImportSharedProgram.jsx # Paste share code → preview → import copy
│   │   │   ├── SessionSummary.jsx     # Post-session chronicle card
│   │   │   ├── TrainingHeatmap.jsx    # GitHub-style adherence heatmap
│   │   │   ├── JourneyProgress.jsx    # Dashboard/achievements journey rank widget
│   │   │   ├── BodyMap.jsx            # SVG body with per-muscle rank coloring
│   │   │   ├── LotrIcons.jsx          # 11 heraldic SVG icons
│   │   │   └── RealmBorder.jsx        # Decorative dividers + PageHeader
│   │   ├── pages/
│   │   │   ├── Login.jsx | Register.jsx
│   │   │   ├── Dashboard.jsx    # Today's Quest, ranks, PRs, streak, recovery, feed
│   │   │   ├── Tracker.jsx      # Grid/calendar session views + heatmap + adherence
│   │   │   ├── Logger.jsx       # Log sets: auto-fill, warm-up, plates, dropsets, swap
│   │   │   ├── Progress.jsx     # Per-exercise e1RM charts + PR badges + projections
│   │   │   ├── Analytics.jsx    # Volume, tonnage, strength spider, DOTS, balance, BW
│   │   │   ├── Recovery.jsx     # Recovery score breakdown + muscle fatigue map
│   │   │   ├── History.jsx      # Chronicle: session browser with expandable details
│   │   │   ├── Program.jsx      # Schedule, lifecycle, re-import, share code
│   │   │   ├── Achievements.jsx # Hall of Heroes: PRs, all-time, milestones, badges
│   │   │   ├── Cardio.jsx       # Log runs/bikes/rows + summary
│   │   │   ├── Medals.jsx       # Medal catalog + current holders
│   │   │   ├── Friends.jsx      # Find/request/accept friends + pending list
│   │   │   ├── Profile.jsx      # Self or friend profile: BodyMap, medals, PRs
│   │   │   ├── Compare.jsx      # Side-by-side compare with a friend
│   │   │   ├── Chat.jsx         # Global chat (system + user messages)
│   │   │   └── Settings.jsx     # Theme, units, rest timer, manual 1RM, export, language
│   │   ├── i18n.js                    # English + Spanish string table
│   │   ├── utils/units.js             # kg↔lbs conversion (with vitest coverage)
│   │   └── hooks/
│   ├── public/
│   │   ├── manifest.json       # PWA manifest
│   │   ├── fonts/Deutsch.ttf   # LOTR display font
│   │   ├── icon.svg            # App icon
│   │   └── sw.js               # Service worker (offline caching)
│   ├── vercel.json             # SPA rewrites
│   ├── vite.config.js
│   └── package.json
├── docs/
│   ├── ideas.md                # Feature roadmap / brainstorm
│   ├── known-bugs.md           # Bug audit + fixes
│   ├── plans/                  # Phase plans (auth, logging, cardio, friends, medals, ranks…)
│   └── superpowers/            # Architecture/spec docs from brainstorming sessions
├── data/                       # Local SQLite DB (gitignored)
└── start-dev.ps1               # Local dev launcher
```

## Pages / Routes
| Route | Page | Purpose |
|---|---|---|
| `/login`, `/register` | Auth | Username/password auth |
| `/` | Dashboard | Today's Quest, week stats, PRs, muscle ranks, recovery, social feed |
| `/tracker` | Tracker | Grid/calendar session views, training heatmap, adherence |
| `/log` | Logger | Log sets/reps/weight, auto-fill, warm-up, plate calc, dropsets, swap |
| `/progress` | Progress | Per-exercise e1RM charts, PR badges, projections |
| `/analytics` | Analytics | Volume, tonnage, strength standards spider, DOTS, balance, bodyweight |
| `/recovery` | Recovery | Recovery score, component breakdown, muscle fatigue |
| `/history` | Chronicle | Browse past sessions by date with expandable details + PR indicators |
| `/program` | Program | Schedule, lifecycle, re-import Excel, enable share code |
| `/achievements` | Achievements | Hall of Heroes: PRs, all-time records, milestones, tiered badges |
| `/cardio` | Cardio | Log runs/bikes/rows + summary |
| `/medals` | Medals | Medal catalog + current holders |
| `/friends` | Friends | Find/request/accept + pending list |
| `/profile` | Profile (self) | BodyMap, medals, PRs, rank summary |
| `/profile?userId=N` | Profile (friend) | Friend's profile via `/social/compare/:id` |
| `/compare/:id` | Compare | Side-by-side friend comparison |
| `/chat` | Chat | Global chat (user messages + system medal events) |
| `/settings` | Settings | Theme, language, units, rest timer, manual 1RM, change username (captcha-gated), export, admin password reset |

## Preset programs (2026-04-21)
Jeff Nippard's "The Essentials" ships as 4 importable presets covering every training
frequency. They're owned by a synthetic `preset` user whose password hash is `!disabled!`
(can never be logged into) and are permanently shared — any user can import by code.

| Share code | Frequency | Style |
|---|---|---|
| `NIPPARD2` | 2× / week | Full-body minimalist |
| `NIPPARD3` | 3× / week | Full-body classic |
| `NIPPARD4` | 4× / week | Upper / lower split |
| `NIPPARD5` | 5× / week | Push / pull / legs split |

Seeding is idempotent (skip if `share_code` already exists) and runs on lifespan startup
via `seed_preset_programs()` in `backend/app/seed_presets.py`. Fixtures live in
`backend/app/fixtures/nippard_{2,3,4,5}x.json`. UI surface: `NippardPresetPicker`
component on the Dashboard welcome panel and the no-active branch of the Program page.
Reserved usernames `{preset, system, admin}` are rejected at register time. Friend
requests to `preset` are refused.

## Username change + CAPTCHA (2026-04-21)
Users can rename themselves from Settings, gated by a medium-difficulty word problem
(Sally-and-watermelons style). Challenges are **stateless HMAC-signed JWTs** — no
session storage. 5 problem templates in `backend/app/captcha.py`; payload
`{"ans": int, "exp": +10min, "kind": "username_captcha"}` signed with `JWT_SECRET`.

Endpoints:
- `GET  /api/auth/username-captcha` → `{problem, challenge}`
- `POST /api/auth/change-username` → body `{new_username, challenge, answer}`

Reserved usernames are blocked. Duplicates are blocked. On wrong answer the UI
auto-fetches a fresh problem. Covered by `tests/test_username_captcha.py` (6 tests).

## Admin ops (2026-04-21)
Admin-only endpoints gated by `ADMIN_USERNAMES = {"hackesmit"}` in
`backend/app/routers/auth.py`:
- `GET  /api/auth/admin-users` — list `{id, username, name}` of all users
- `POST /api/auth/admin-reset` — set another user's password
- `POST /api/auth/admin-wipe-user` — clear per-user data for a target (programs
  + children, workout/session/cardio logs, achievements, muscle scores, body metrics,
  vacation periods, feed events, chat messages, medal records + holders, friendships,
  bodyweight/height/sex/birth_date/training_age/manual_1rm). **Preserves** the User row
  + username + password so the target can still log in. Refuses admin and preset
  targets. Covered by `tests/test_admin_wipe.py` (4 tests).

## Medal awarding (2026-04-21 fix)
Strength medals (`strength_1rm:bench|squat|deadlift|ohp`) are awarded by
`check_strength_medals()` in `backend/app/medal_engine.py` when a `WorkoutLog` has
`is_true_1rm_attempt=True` + `completed_successfully=True` + `reps_completed=1`. The
Logger UI does not currently expose the `is_true_1rm_attempt` flag.

**Settings → Manual 1RM now also fires the medal engine.** Each category saved via
`PATCH /api/manual-1rm` routes through `_update_holder()` with
`source_type="manual_1rm"`, so users can claim strength medals without logging a
live attempt. Existing `manual_1rm` values saved before this fix won't retroactively
award — a re-save kicks it off.

## Program sharing (2026-04-21)
A user can enable sharing on any of their programs to get an 8-character uppercase share code.
Anyone with the code can preview the program (name, owner, frequency, weeks, exercise count) and
import a **private deep-copy** — every `ProgramExercise` row is cloned into a new Program owned by
the importer; workout logs are never copied. The importer's prior active program is auto-paused so
exactly one program stays active.

Endpoints (all under `/api`):
- `POST   /program/{id}/share` — enable; idempotent; returns `{share_code}`
- `DELETE /program/{id}/share` — revoke
- `GET    /programs/shared/{code}` — preview (case-insensitive)
- `POST   /programs/import-shared` — body `{code, rename?, activate?}`

UI: Share button + modal on Program page; import-by-code input on Dashboard welcome and
on the Program page's no-active branch. Tested in `tests/test_program_share.py` (4 tests).

## Muscle rank engine (2026-04-21 rewrite)
Replaced the old percentile/30-day-rolling engine with fixed global strength standards per
muscle group. Ranks now stay comparable across users — Champion is an earned tier, not the
top of the current cohort.

- MVP groups: `chest, back, shoulders, quads, hamstrings, arms`
- Metric per group:
  - chest = barbell bench 1RM / bodyweight
  - quads = back squat 1RM / bodyweight
  - hamstrings = deadlift 1RM / bodyweight
  - shoulders = OHP 1RM / bodyweight
  - back = weighted-pullup **added** load / bodyweight (bodyweight pullup reps as fallback)
  - arms = weighted-dip **added** load / bodyweight (close-grip bench as low-confidence proxy)
- Window: best valid lift in last **90 days**. Epley for reps up to 10; >10 reps rejected.
- Manual 1RM from `User.manual_1rm` is first-class, not a fallback.
- Outlier guard: ratio > 5× bodyweight is discarded.
- Tiers: `Copper → Bronze → Silver → Gold → Platinum → Emerald → Diamond → Champion`
- Source of truth: `backend/app/muscle_rank_config.py`. Do **not** inline thresholds elsewhere.
- `recompute_for_user(db, user_id)` is called inside `logging.py` after every log write.
- Tested in `tests/test_ranks.py` (6 tests).

## LOTR Theme System
Subtle Tolkien atmosphere over a modern fitness UI. 5 switchable realms with 6 panel variants
and an 11-icon heraldic set. Theme persists in `localStorage`.

### Realms
| Realm | Accent | Surfaces | Vibe |
|---|---|---|---|
| **Gondor** (default) | Antique gold `#c9a84c` | Dark slate `#1a1d2e` | Noble, regal stone |
| **Rohan** | Straw gold `#d4a843` | Warm brown `#1c1a15` | Earthy plains |
| **Rivendell** | Silver-teal `#5ba3a0` | Deep blue-grey `#151d22` | Elven calm |
| **Mordor** | Ember red `#c44a2b` | Near-black `#121010` | Volcanic menace |
| **Shire** | Hobbit green `#6d9b4a` | Warm earth `#1a1714` | Pastoral comfort |

Applied via `data-realm` attribute on `<html>`. `gym-theme-mode` in localStorage toggles between
`lotr` and `neutral` (default neutral for new users).

### Panel Variants
`stone-panel`, `parchment-panel`, `forged-panel`, `heraldic-card`, `rivendell-card`, `chronicle-card`

### Heraldic Icons (LotrIcons.jsx)
Ring (e1RM PR), Sword (weight PR), Shield (consistency), Torch (streak), Mountain (volume),
Crown (elite), WhiteTree (special), MapScroll (journey), Chronicle (history), Hammer (forging),
GondorShield (realm crest).

### Microcopy
- PR → "A new record is forged."
- Session → "The day's training is complete."
- Achievement → "Honor earned."
- Streak → "The Watch continues."
- Primary actions stay literal: Start Workout, Save, Undo, Settings.

### Wisdom of Middle-earth (Dashboard)
Daily Tolkien quote system (19 quotes, ~60% epic / 35% wisdom / 5% funny). Deterministic
day-index selection with a refresh button.

## Internationalization
`frontend/src/i18n.js` holds the full string table. Languages: `en` (default), `es`.
Selection persists in localStorage (`gym-lang`); also sets `<html lang>`.

## Local Development
```powershell
# Option 1: One-click
./start-dev.ps1

# Option 2: Manual
cd backend && python -m uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```
No env vars needed locally — SQLite fallback + Vite proxy handle everything.
First run creates/seeds a default user `hackesmit` / password `password`.

## Environment Variables
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Fly.io | Supabase Postgres connection string (pooler URL) |
| `ALLOWED_ORIGINS` | Fly.io | Comma-separated origins, incl. `https://gym-tracker-six-virid.vercel.app` |
| `JWT_SECRET` | Fly.io | HS256 signing key |
| `UPLOAD_DIR` | Fly.io (optional) | Excel upload temp dir; defaults to `$TMPDIR/uploads` |
| `VITE_API_URL` | Vercel | `https://gym-tracker-api-bold-violet-7582.fly.dev/api` |

## Key Conventions
- All API routes are prefixed with `/api`
- Frontend uses relative `/api` locally (Vite proxy) and `VITE_API_URL` in production
- Database tables auto-create on startup via `Base.metadata.create_all()`; columns added
  after creation are backfilled by `_run_migrations()` in `main.py`
- Exercise catalog + medal catalog auto-seed on startup
- Excel uploads are parsed immediately and stored in DB — file on disk is ephemeral
- Default units are **lbs** (stored internally as kg, converted on display)
- User settings (units, rest timer, realm theme, language) persist in localStorage
- Analytics resolves user via `_default_user_id(db)` helper — never hardcode `user_id=1`
- Auth: `get_current_user` decodes JWT, looks up by `int(sub)`; passwords are bcrypt with 72-byte cap

## File Responsibilities
- Database queries/config → `database.py` only
- New API endpoints → appropriate router in `routers/`
- New analytics → `analytics/` module + wire through `routers/analytics.py`
- All frontend API calls → `api/client.js` only
- New UI components → `components/`
- New pages → `pages/`
- Global state/settings → `context/AppContext.jsx`
- Auth state → `context/AuthContext.jsx`
- LOTR icons → `components/LotrIcons.jsx`
- Decorative borders → `components/RealmBorder.jsx`
- Theme palettes → `index.css` via `[data-realm]` attribute selectors
- Muscle-rank thresholds → `muscle_rank_config.py` ONLY (never inline)

## Database Schema (18 tables)
Core: `users`, `programs`, `program_exercises`, `exercise_catalog`, `workout_logs`,
`session_logs`, `program_progress`, `body_metrics`.

Social & gamification: `achievements`, `friendships`, `medals`, `medal_records`,
`medal_current_holder`, `muscle_scores`, `feed_events`, `chat_messages`.

Ancillary: `vacation_periods` (streak grace), `cardio_logs`.

All managed by SQLAlchemy ORM. Foreign keys enforce referential integrity.

### Notable columns
- `User.manual_1rm` — JSON column storing known 1RMs per lift category. New format:
  `{"bench": {"value_kg": 102.1, "tested_at": "2026-03-20"}}`. Backend also accepts old bare-float format.
- `Program.share_code` — unique, nullable, indexed. Non-null ⇒ sharing is enabled.
- `SessionLog` has `UniqueConstraint("program_id", "week", "session_name")`
- `ProgramExercise` has `UniqueConstraint("program_id", "week", "session_name", "exercise_order")`
- `Friendship` has `UniqueConstraint("requester_id", "addressee_id")`
- `WorkoutLog` supports `is_dropset`, `dropset_load_kg`, `is_bodyweight`, `is_true_1rm_attempt`,
  `completed_successfully`, and `session_log_id` (CASCADE on session delete)

## Strength Standards Engine (Analytics spider — v2)
Separate from the muscle-rank engine. Used only for the Analytics page spider chart.

**Category rules** (only these exercises qualify):
- **Squat:** barbell back squat, paused back squat, front squat, safety bar squat
- **Deadlift:** conventional, sumo, trap bar, paused. Romanian DL as low-confidence
- **Bench:** barbell bench, paused bench, close-grip bench. Incline barbell as low-confidence
- **OHP:** strict press, seated barbell OHP. Seated DB shoulder press as low-confidence
- **Row:** barbell row, Pendlay row, T-bar row. Cable row as low-confidence

**Rejected:** hack squat, leg press, machine squat, machine chest press, DB bench press,
cable shoulder press, Smith machine variants.

**Confidence scoring:** `specificity × rep_range × recency`
- Specificity: primary=1.0, close_variant=0.85, low_confidence=0.65
- Rep range: 1-3=1.0, 4-6=0.9, 7-8=0.75, 9-10=0.6, >10=rejected
- Recency: <2wk=1.0, 2-4wk=0.9, 4-8wk=0.75, 8-12wk=0.6, >12wk=0.4

Manual 1RM is first-class; only loses to logged data if logged is both newer AND higher confidence.

## Testing
- Backend: `pytest -q` from `backend/`. Shared fixtures in `tests/conftest.py` spin up an
  in-memory SQLite DB + TestClient with `get_db`/`get_current_user` overrides.
- Frontend: `npm test -- --run` from `frontend/`. Vitest covers `utils/units.js` and core API/analytics behavior.
- Current state: 55 pass, 1 pre-existing unrelated failure (`test_log_bulk_relog_replaces`).

## Known issues / watch-outs
See `docs/known-bugs.md`.

## Current Program
"The Essentials" by Jeff Nippard — 4x/week, 12 weeks. Imported from .xlsx spreadsheet.
