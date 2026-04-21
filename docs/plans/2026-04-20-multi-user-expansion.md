# Multi-User Expansion Plan — 2026-04-20

## Scope
Incremental rebuild-in-place of the Gym Tracker to a 4-user socially competitive platform.
- JWT auth + per-user isolation
- Cardio tracking
- Friend system + aggregate comparison
- Medal system (king-of-the-hill, write-time)
- Muscle group ranking (Rainbow Six tiers, percentile-based, 30d rolling)
- Anatomical body map (custom SVG — more control than a third-party package)
- Performance fixes (dashboard <2s)
- Default neutral theme; LOTR is an optional user setting

## Current State (audited 2026-04-20)
- FastAPI + SQLAlchemy, no Alembic, schema via `Base.metadata.create_all()` + custom `_run_migrations()`.
- Single user via `db.query(User).first()` in 4 places: `logging.py:154`, `programs.py:43`, `analytics.py:23`, `vacation.py:38`.
- ExerciseCatalog already has `muscle_group_primary` and `muscle_groups_secondary`.
- Achievement model exists (can be reused as a records source for medals).
- Dashboard fires 4 parallel requests — none are cached/aggregated.

## Existing Data Migration
All current rows belong to the single default user. We will:
1. Create user `hackesmit` with password `password` (bcrypt).
2. Reassign all existing rows (`programs`, `workout_logs`, `session_logs`, `body_metrics`, `vacation_periods`, `achievements`) to that user's id.
3. Seed 3 additional placeholder users only on explicit request (not auto).

## Phases

### Phase 0 — Perf (indexes + dashboard consolidation)
- Compound indexes: `(user_id, date)` on workout_logs, session_logs, body_metrics; `(user_id)` on programs, achievements, cardio_logs.
- New endpoint `GET /api/dashboard` returning: today's quest, week stats, streak, recent PRs, recovery flag, medal summary, muscle rank snapshot — one query batch.
- Default analytics ranges bounded to last 12 weeks.

### Phase 1 — Auth
- `auth.py` module: bcrypt hashing, JWT (HS256, 7d expiry, 30d if remember=true).
- Routes: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- `get_current_user` FastAPI dependency.
- Replace every `_default_user_id()`/`_get_default_user()` with `current_user: User = Depends(get_current_user)`.

### Phase 2 — Cardio
- `CardioLog` model (`id, user_id, date, modality, duration_minutes, distance_km, elevation_m, avg_hr, calories, rpe, notes, created_at, updated_at`).
- CRUD router + summary endpoint (weekly/modality breakdown, 7d/30d/12w trends, PBs).

### Phase 3 — Friends
- `Friendship` model (`requester_id, addressee_id, status[pending|accepted|declined], created_at, updated_at`).
- Endpoints: request/accept/decline/remove/list.
- Shared aggregate metrics only — raw logs stay private.

### Phase 4 — Medals (king-of-the-hill, write-time)
- Tables: `medals`, `medal_records`, `medal_current_holder`.
- Seeded medal catalog on startup.
- `medal_engine.py`: on log write, compute relevant metrics and update holder if surpassed.
- **Official 1RM rule:** WorkoutLog gains `is_true_1rm_attempt` + `completed_successfully` booleans. Only entries with both true can update strongest_*_1rm medals. Estimated 1RM never touches official medals.

### Phase 5 — Muscle Ranks
- `MuscleScore` table (user_id, muscle_group, score, rank, updated_at).
- Compute on log write: 30d rolling V/I/F → score = 100·(0.6V + 0.3I + 0.1F).
- Ranks assigned via percentile across active user group: Copper/Bronze/Silver/Gold/Platinum/Emerald/Diamond/Champion.
- MVP groups: chest, back, shoulders, quads, hamstrings, arms. (Glutes/calves/abs/traps available via catalog later.)

### Phase 6 — Social feed + leaderboards
- `FeedEvent` table (user_id, event_type, payload_json, created_at).
- Emitted by medal engine + rank engine + streak milestones.
- `GET /api/social/feed`, `/api/social/leaderboard`, `/api/social/compare/{user_id}`.

### Phase 7 — Frontend
- New: `Login.jsx`, `Register.jsx`, `Cardio.jsx`, `Friends.jsx`, `Compare.jsx`, `Medals.jsx`, `Profile.jsx`.
- `AuthContext.jsx`: JWT in localStorage (`gym-token`) with `remember_me` flag; token attached to fetch in `api/client.js`.
- `BodyMap.jsx`: custom SVG anatomical model (front/back, MVP regions mapped to muscle ranks).
- `AppContext` gains `themeMode: 'neutral' | 'lotr'`; neutral is default. LOTR realm picker hidden behind theme mode.
- Dashboard rewired to `/api/dashboard`.

### Phase 8 — Hardening
- Ownership checks on every private route.
- Tests: auth, isolation, cardio CRUD, medal update, rank calc.

## Risks
- Schema changes are additive (new tables + nullable columns) → safe for existing data.
- Rank/medal write-time cost is bounded: O(1) medal check per log, O(1) muscle score update.
- Frontend auth rollout touches every page (wrap in `ProtectedRoute`).

## Validation
- `hackesmit`/`password` logs in, sees all pre-existing data intact.
- Dashboard first paint <2s on warm server.
- Cardio CRUD round-trips.
- Medal holder changes when a friend beats a value.
- Body map highlights muscles by rank.
