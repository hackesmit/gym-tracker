# Gym Tracker

## Project Overview
Full-stack multi-user gym workout tracker. Upload training programs from Excel, log sets/reps/weight, track progressive overload, analyze performance, compete on medals/leaderboards, and chat. Originally built for personal use by Daniel (hackesmit); now multi-user with share-code program exchange.

## Live URLs
- **Frontend:** https://gym-tracker-six-virid.vercel.app/
- **Backend API:** https://gym-tracker-api-bold-violet-7582.fly.dev/ (Fly.io — authoritative)
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
│   │   │   ├── chat.py        # Chat messages with free-form rooms (system + user)
│   │   │   ├── cardio.py      # Cardio log CRUD + summary
│   │   │   └── vacation.py    # Vacation period CRUD (streak grace)
│   │   └── analytics/         # Per-metric calculation modules
│   ├── tests/                 # 55+ pytest tests (conftest uses in-mem SQLite)
│   ├── requirements.txt
│   ├── Dockerfile             # Used by Fly.io
│   ├── fly.toml               # Fly.io app config (iad region, shared-cpu-1x)
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
│   │   │   ├── LotrIcons.jsx          # 8 heraldic SVG icons
│   │   │   └── RealmBorder.jsx        # Decorative dividers + PageHeader
│   │   ├── pages/
│   │   │   ├── Login.jsx | Register.jsx
│   │   │   ├── Dashboard.jsx    # Today's Quest, ranks, PRs, streak, social feed
│   │   │   ├── Tracker.jsx      # Grid/calendar session views + heatmap + adherence
│   │   │   ├── Logger.jsx       # Log sets: auto-fill, warm-up, plates, dropsets, swap
│   │   │   ├── Progress.jsx     # Per-exercise e1RM charts + PR badges + projections
│   │   │   ├── Analytics.jsx    # Volume, tonnage, strength spider, DOTS, balance, BW
│   │   │   ├── History.jsx      # Chronicle: session browser with expandable details
│   │   │   ├── Program.jsx      # Schedule, lifecycle, re-import, share code
│   │   │   ├── Achievements.jsx # Hall of Heroes: PRs, all-time, milestones, badges
│   │   │   ├── Cardio.jsx       # Log runs/bikes/rows + summary
│   │   │   ├── Medals.jsx       # Medal catalog + current holders
│   │   │   ├── Friends.jsx      # Find/request/accept friends + pending list
│   │   │   ├── Profile.jsx      # Self profile: BodyMap, medals, PRs (hub sub-tab /profile/me)
│   │   │   ├── UserProfile.jsx  # Friend profile view at /users/:id
│   │   │   ├── Compare.jsx      # Side-by-side compare with a friend
│   │   │   ├── Chat.jsx         # Rooms sidebar + per-room polling chat
│   │   │   ├── Settings.jsx     # Theme, units, rest timer, manual 1RM, export, language
│   │   │   └── hubs/
│   │   │       ├── StatsHub.jsx    # /stats hub → Progress · Analytics · History
│   │   │       ├── ProfileHub.jsx  # /profile hub → Profile · Achievements · Medals
│   │   │       └── SocialHub.jsx   # /social hub → Friends · Chat
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
| `/` | Dashboard | Today's Quest, week stats, PRs, muscle ranks, social feed |
| `/tracker` | Tracker | Grid/calendar session views, training heatmap, adherence |
| `/log` | Logger | Log sets/reps/weight, auto-fill, warm-up, plate calc, dropsets, swap |
| `/stats`, `/stats/{progress,analytics,history}` | Stats hub | Per-exercise e1RM; volume/tonnage/DOTS/spider; session chronicle |
| `/program` | Program | Schedule, lifecycle, re-import Excel, enable share code |
| `/cardio` | Cardio | Log runs/bikes/rows + summary |
| `/social`, `/social/{friends,chat}` | Social hub | Friend management + global chat |
| `/profile`, `/profile/{me,achievements,medals}` | Profile hub | BodyMap + PRs; Hall of Heroes; medal catalog |
| `/users/:id` | User profile | Friend's profile (ranks, medals, PRs) |
| `/compare/:id` | Compare | Side-by-side friend comparison |
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

## Username change + CAPTCHA (2026-04-21, hardened 2026-04-26)
Users can rename themselves from Settings, gated by a medium-difficulty word problem
(Sally-and-watermelons style). Challenges are **stateless HMAC-signed JWTs** — no
session storage. 5 problem templates in `backend/app/captcha.py`.

The CAPTCHA token payload is
`{"ans": int, "exp": +10min, "iat", "kind": "username_captcha", "sub": <user_id>}`,
signed with a domain-separated key derived as `HMAC(JWT_SECRET, b"username_captcha/v1")`.
The `sub` binding rejects cross-user replay; the derived key prevents any code path
that signs access tokens from accidentally minting a CAPTCHA. `verify_challenge` takes
`user_id` and refuses tokens whose `sub` doesn't match.

Endpoints:
- `GET  /api/auth/username-captcha` → `{problem, challenge}` (challenge bound to caller)
- `POST /api/auth/change-username` → body `{new_username, challenge, answer}`

Username sanitization: `_normalize_username` (in `routers/auth.py`) NFKC-normalizes
input, strips whitespace, and rejects any character in Unicode category C
(control/format/surrogate). This blocks zero-width-space squatting like
`hackesmit​`. Applied at `register` and `change-username`.

`PATCH /api/auth/me` does **not** accept `username` — its `UpdateMePayload` uses
`extra="forbid"`, so any client that tries to smuggle `username` through gets a 422.
This closes the bypass that previously let any logged-in user rename without solving
the CAPTCHA.

Reserved usernames are blocked. Duplicates are blocked. On wrong answer the UI
auto-fetches a fresh problem. Covered by `tests/test_username_captcha.py`.

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

## Medal awarding (2026-04-21 fix, derivatives wired 2026-04-26, in-workout 1RM UI 2026-05-18)
Strength medals (`strength_1rm:bench|squat|deadlift|ohp`) are awarded by
`check_strength_medals()` in `backend/app/medal_engine.py` when a `WorkoutLog` has
`is_true_1rm_attempt=True` + `completed_successfully=True` + `reps_completed=1`. The
Logger surfaces this via a small **1RM** toggle on each set row (next to the **DS**
drop-set toggle), rendered only when `reps_completed === 1`. Tapping the toggle
sets `is_true_1rm_attempt: true` AND `completed_successfully: true` in the saved
bulk payload, so the medal engine fires for in-workout 1RM attempts without
needing the Settings → Manual 1RM workaround.

**Settings → Manual 1RM fires the full medal chain (2026-04-26).** `PATCH /api/manual-1rm`
routes each category through `_update_holder()` with `source_type="manual_1rm"` AND
calls `_recompute_strength_derivatives()` so the derived medals
(`strength_pl_total`, `strength_relative`, `performance_most_improved_pct`)
also fire — without this call users could claim the four direct medals but never
the derivatives. The same path also calls `recompute_for_user` so muscle ranks
refresh immediately on a manual 1RM save.

Existing `manual_1rm` values saved before this fix won't retroactively
award — a re-save kicks it off.

## Medal leaderboards (2026-05-11)
`GET /api/medals/{id}/leaderboard` returns every user's current value for the
medal's metric, sorted. Backed by `backend/app/medal_leaderboards.py` — a single
dispatch module that reuses the medal engine's categorization rules so the top
of the leaderboard always matches `MedalCurrentHolder`.

The `consistency_longest_streak` medal is never awarded by the engine today, so
its leaderboard may have entries while `MedalCurrentHolder` is empty — accepted.

UI: clicking any `MedalCard` on the Medals page opens
`MedalLeaderboardModal`. Trophy-case tiles open the same modal.

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

- MVP groups: `chest, back, shoulders, quads, hamstrings, biceps, triceps, abs`
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
- Tiers: `Copper → Bronze → Silver → Gold → Platinum → Diamond → Champion` (7 tiers; Emerald was dropped on 2026-04-22 to match the badge system)
- Each non-Champion tier subdivides into 5 equal slots (V → I). Champion is a single elite rank.
- Source of truth: `backend/app/muscle_rank_config.py`. Do **not** inline thresholds elsewhere.
- `recompute_for_user(db, user_id)` is called from `logging.py` on:
  - `POST /api/log` (single set)
  - `POST /api/log/bulk` (session save)
  - `PATCH /api/log/set/{id}` (set edit) — added 2026-04-26 to avoid stranded inflated tiers
  - `DELETE /api/log/session/{id}` (undo) — added 2026-04-26 so deleting a fake-PR session releases the tier
  - `PATCH /api/manual-1rm` — added 2026-04-26 since manual 1RM is a first-class rank input
- Reference endpoint: `GET /api/ranks/standards` returns the full 7-tier × 6-group table (thresholds + qualifying exercises) sourced from `muscle_rank_config.py`. Consumed by the Profile page's new "Rank standards" expandable card (`frontend/src/components/RankStandards.jsx`).
- Tested in `tests/test_ranks.py` (6 tests).
- 2026-04-25: rank engine reads `WorkoutLog.added_load_kg` directly for
  weighted-pullup / weighted-dip lifts (no longer derives added load from
  `load_kg - bw`).
- 2026-04-25: `size_bonus(bw) = (bw/80)^0.5` multiplier applied to back
  and arms ratios + back rep-count fallback. Heavier athletes get partial
  credit for moving more absolute mass on bodyweight-class lifts. Interim
  fairness correction — Phase 2 (separate spec) replaces with DOTS.
- 2026-04-25: `MAX_ADDED_RATIO_FOR_BACK_ARMS = 2.0` silent-drop guard
  for back/arms candidates (prevents Aragorn-style legacy rows that
  escaped the 2026-04 migration from regranting Champion rank).
- 2026-05-02: Coverage audit — split arms into independent biceps + triceps
  ranks; added abs as the 8th MVP group; new isolation pathways for
  hamstrings (leg curl + glute-ham proxy), quads (leg extension), and
  chest (fly). Threshold tables sourced from strengthlevel.com percentile
  data. `MAX_ISOLATION_ONLY_ELO = 2500` cap means pure-isolation lifters
  reach Diamond at most. Back Diamond/Champion thresholds tightened
  (1.25→1.00, 1.50→1.20) to match published Elite +1.08 BW. Tricep
  isolation thresholds bumped to raw-ratio scale (`ARMS_TRICEP_ISOLATION`
  spec multipliers all 1.0). One-shot `split_arms_2026_05` lifespan
  migration deletes legacy `arms` MuscleScore rows and recomputes against
  unbounded historical lookback. CATALOG_AUDIT table in
  `muscle_rank_config.py` documents every catalog exclusion with a reason.

## BW input migration (2026-04-25)

One-shot migration ran on first deploy after 2026-04-25 to backfill
`WorkoutLog.added_load_kg` and correct historical Aragorn-style bogus
weighted-pullup rows. Gated by a `migration_log` row named
`bw_input_2026_04`; idempotent on subsequent deploys.

Migration logic in `backend/app/bw_migration.py`:
- Pure BW exercises with `load_kg = 0` → `load_kg = bw_at_log_time`,
  `added_load_kg = 0`.
- Weighted-capable exercises:
  - `load_kg ≤ 0` → bodyweight-only attempt; same as pure pure-BW
    backfill (`reason = "weighted_capable_zero_load"`).
  - 0.85 × bw ≤ `load_kg` ≤ 1.15 × bw → user entered their bodyweight
    by mistake (Aragorn bug); set `load_kg = bw`, `added_load_kg = 0`
    (`reason = "aragorn_correction"`).
  - Else → genuine added load; `load_kg = bw + load_kg`,
    `added_load_kg = old load_kg` (`reason = "weighted_capable_added_promoted"`).
- Pure exercises with pre-existing nonzero load (e.g. vested pushup)
  → flagged but untouched (`reason = "pure_with_nonzero_load_skipped"`).

Every change inserts an audit row in `bw_migration_audit`. Admin rollback
at `POST /api/auth/admin/bw-migration-rollback` reverts every audited row
and clears the audit table. Per-user re-run at
`POST /api/auth/admin/bw-migration-rerun-for-user/{user_id}` for users
who set their bodyweight after the initial migration.

Catalog tagging: `seed_catalog.py` sets `bodyweight_kind` on PULLUP, DIP,
WEIGHTED PULLUP, WEIGHTED DIP, BW WALKING LUNGES, ab/core lifts.
`backfill_catalog_bodyweight_kind` runs on every lifespan startup to
update existing rows idempotently. **`bodyweight_kind` is exposed on
`GET /api/analytics/exercise-catalog`** — without this the SetRow
component on the Logger silently falls back to the legacy single-load
layout for every exercise (closed 2026-04-26).

## Untag-BW data fix (2026-05-18)

PLATE-WEIGHTED CRUNCH, WALKING LUNGES, and LEG RAISES were retagged from
BW-class to normal weighted on 2026-05-18 (user flagged them as
ambiguous). A one-shot lifespan migration `_untag_bw_data_fix_once`
(in `backend/app/main.py`, gated by `migration_log` row
`untag_bw_2026_05`) collapses plate-only semantics on existing WorkoutLog
rows for these three exercises:

- If `added_load_kg > 0` (weighted_capable era): `load_kg <- added_load_kg`,
  `added_load_kg <- NULL`.
- If `added_load_kg = 0` (pure era): `load_kg <- 0`, `added_load_kg <- NULL`.

Every change is audited into the new `untag_bw_audit` table
(model: `UntagBwAudit`). The locked-classification test
`test_bw_classification_locked` in
`backend/tests/test_catalog_bodyweight_kind.py` prevents future seed-list
edits from silently flipping a row back. Round-trip test:
`backend/tests/test_untag_bw_migration.py`.

## is_bodyweight column removal (2026-05-18)

The deprecated `workout_logs.is_bodyweight` column is dropped via the
`_drop_is_bodyweight_column_once` lifespan migration (gated by
`migration_log` row `drop_is_bodyweight_2026_05`). The authoritative
test for a bodyweight-class set has been `added_load_kg IS NOT NULL`
since 2026-04-25 (see "Plate-only display semantics"). The frontend
SessionSummary set-counter now reads `added_load_kg != null` instead.

## Plate-only display semantics (2026-04-26)

After the BW input migration, `WorkoutLog.load_kg` for bodyweight-class
lifts is `bodyweight + plate`. Anything that reads `load_kg` directly
will be inflated by the user's bodyweight unless it accounts for the
new column. The conventions used downstream:

- **Volume / tonnage queries** (`analytics/volume.py`, `routers/dashboard.py`,
  `routers/friends.py`, `medal_engine.py` `consistency_volume_30d` /
  `performance_volume_increase_30d`): use
  `coalesce(added_load_kg, load_kg) * reps_completed` per row. For
  bodyweight-class lifts this collapses to plate-only; for external
  lifts `added_load_kg` is NULL and the total `load_kg` is used.
- **Per-exercise e1RM** (`analytics/progress.py`): the history fetcher
  returns `added_load_kg if not None else load_kg` so the Progress
  chart, all-time PR card, and CSV export all stay on the plate-only
  scale for weighted pullups/dips.
- **PR detection** in `routers/logging.py` (called from
  `POST /api/log/bulk`): both the new-session sets and the historical
  lookup use the same `_effective(load_kg, added_load_kg)` helper, so
  a fresh weighted-pullup row never spuriously beats an old one purely
  because the migration semantics changed.
- **Edit form** in `frontend/src/pages/History.jsx`: `updateSet` now
  passes `added_load_kg = max(0, new_load_kg - bw_at_log)` derived
  from the original row's `load_kg - added_load_kg`, so editing a
  weighted-pullup set keeps the plate semantic intact instead of
  stranding the row.

These rules apply only to bodyweight-class catalog rows
(`bodyweight_kind IS NOT NULL`). External lifts continue to use
`load_kg` directly.

## Logger exercise grouping (2026-05-18)

The Logger groups consecutive sets by `program_exercise_id`, not by
canonical `exercise_name`. Post-HEAVY/BACK-OFF-collapse (2026-05-13)
two ProgramExercise rows can share an `exercise_name_canonical` (e.g.
both pullup variants resolve to "PULLUP"). Grouping by canonical name
merged them into one rendered Card, which let React reconciliation
swap state across sibling SetRows (typing in set 1 mirrored into
set 2 in real time). Grouping by `program_exercise_id` gives each PE
its own Card with stable `key`, isolating state. Pure helper:
`groupSetsByProgramExercise` in `frontend/src/pages/Logger.jsx`,
covered by `frontend/src/pages/__tests__/Logger.test.jsx`.

## Program switcher, add-exercise, swap-by-id, Logger unit cleanup (2026-06-08)

**Exercise swap by `program_exercise_id` (this-week-only).** The swap
endpoint is now `PATCH /api/program/{id}/exercise/{pe_id}/swap` with
body `{new_exercise_name}`. It updates exactly one `ProgramExercise`
row (the canonical name is uppercased on write), so a swap only affects
the current week — it never modifies other weeks. The old name-based
route `PATCH /program/{id}/exercise/{old_name}` was removed. The Logger
swap button passes `group.pe_id`; it is hidden for legacy set groups
that carry no `pe_id`.

**Add-exercise endpoint.** `POST /api/program/{id}/exercise` accepts
`{week, session_name, exercise_name, scope}` where `scope` is a
`Literal["week", "all_weeks"]` (invalid values → 422). `"week"` inserts
the exercise into the named session of the given week only; `"all_weeks"`
inserts it into every week that already contains a session with that
name. Returns 404 if the target session does not exist in the specified
week(s). The Logger exposes this as a "+ Add exercise" button that opens
a catalog picker, then asks "Today only" (`scope=week`) vs "Add to
program" (`scope=all_weeks`).

**Program activate endpoint (one-active invariant).** `POST /api/program/{id}/activate`
makes the target program active, bulk-pauses every other active program
for that user, and clears any stale `end_date` on the target. This
enforces the invariant that exactly one program is active at a time. The
Program page now renders a "My Programs" panel listing all of the user's
programs with a status badge and an Activate button for non-active programs.

**Logger unit display.** The weight unit is now shown once as a banner
at the top of the session ("Weights in kg" / "Weights in lbs") rather
than repeated on every input field. Per-field unit labels were removed;
bodyweight-class field labels are now "Weight" / "Added" / "BW" (the
previous "auto" wording was dropped). No data or API changes.

## Editorial Theme System (2026-04-23)
The frontend ships two coexisting modes, defaulting to minimal.

**Minimal mode (default):** 13 accent presets in `frontend/src/theme/presets.js`
— lime (default), amber, cyan, crimson, ember, saffron, mint, teal, sky,
indigo, magenta, rose, ivory. `AppContext.setThemeColor` writes 4 CSS
variables on `<html>` (`--color-accent`, `--color-accent-ink`,
`--color-accent-tint`, `--color-accent-border`); all other accent
derivatives (`--color-accent-light`, `--color-accent-dark`,
`--color-primary*`) are computed via CSS `color-mix` in `:root`. Adding
a 14th preset = one array entry in `presets.js` + 2 i18n strings in
`i18n.js` (en + es). No CSS edits required.

**LOTR mode (opt-in, editorial):** 5 realms — gondor, rohan, rivendell,
mordor, shire — each with a unique surface + accent palette. Flat visuals
(no gradients, no glows); heraldic icons + Cinzel display font + mode-
conditional copy swaps ("Today's Quest", "Hall of Heroes") are the visual
identity.

Rank badges carry a subtle tier-colored `filter: drop-shadow` halo in
both modes (the one "meaningful moment" carve-out from the no-glow rule).

Known limitation: first-paint FOUC when the stored preset is not lime —
see `docs/known-bugs.md`.

## LOTR Theme System
Subtle Tolkien atmosphere over a modern fitness UI. 5 switchable realms with 6 panel variants
and an 8-icon heraldic set. Theme persists in `localStorage`.

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
Ring (e1RM PR), Sword (weight PR), Torch (streak), MapScroll (journey), Chronicle (history),
TodaysQuest (dashboard nav), EyeOfSauron (tracker nav), SettingsGear (settings nav).

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
- `ChatMessage.room` — VARCHAR, default `"general"`, indexed. Filters messages by room. `GET /api/chat?room=<name>` and `POST /api/chat` body field `room` (default `"general"`). `GET /api/chat/rooms` returns distinct rooms with `{name, message_count, last_message_at, last_message_preview}` ordered by last-activity, `general` always first. Rows written before the column existed are backfilled to `"general"` by a one-shot migration `backfill_chat_room_2026_05`.
- `SessionLog` has `UniqueConstraint("program_id", "week", "session_name")`
- `ProgramExercise` has `UniqueConstraint("program_id", "week", "session_name", "exercise_order")`
- `Friendship` has `UniqueConstraint("requester_id", "addressee_id")`
- `WorkoutLog` supports `is_dropset`, `dropset_load_kg`, `is_true_1rm_attempt`,
  `completed_successfully`, and `session_log_id` (CASCADE on session delete)
- `WorkoutLog.added_load_kg` (2026-04-25): plate-only load for
  bodyweight-class lifts. NULL = external load (barbell/DB/machine).
  0 = pure BW set (pushup, ab work, BW pullup). >0 = weighted-capable
  set (weighted pullup/dip). `WorkoutLog.load_kg` always = effective
  load (BW + plate for bodyweight class). The deprecated `is_bodyweight`
  column was dropped via `_drop_is_bodyweight_column_once` on 2026-05-18.
- `ExerciseCatalog.bodyweight_kind` (2026-04-25): drives Logger SetRow
  layout. "pure" / "weighted_capable" / NULL.

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
- Current state (2026-06-10): 242 backend pass, 61 frontend pass (all green).

## Logging ownership hardening (2026-06-10)
`POST /api/log` and `POST /api/log/bulk` now verify that the `program_id` and
every `program_exercise_id` belong to the calling user (404 otherwise). Before
this, any authenticated user could log sets into another user's program and —
via the bulk relog-replace path — delete another user's SessionLog, WorkoutLogs,
and Achievements just by posting that user's `program_id`. Bulk PR detection
also scopes its historical-best query to `WorkoutLog.user_id` (it previously
compared against every user's logs sharing the canonical exercise name).
Covered by `tests/test_logging_security.py`. Same sweep fixed: custom-program
canonical names now uppercased (were lowercase, invisible to catalog/rank
engine), Excel uploads parse from a unique temp file that is deleted after
parsing (was a shared user-controlled filename), `/api/auth/absorb` no longer
rolls back when source and absorber share a mutual friend, and the
import-program response reports the real `total_weeks`.

## Known issues / watch-outs
See `docs/known-bugs.md`.

## Current Program
"The Essentials" by Jeff Nippard — 4x/week, 12 weeks. Imported from .xlsx spreadsheet.
