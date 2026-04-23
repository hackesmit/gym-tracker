# Known Bugs & Issues

Original audit: 2026-03-24
Last updated: 2026-04-22

## Resolved

Bugs 1–11 (pre-multi-user phase) — see git history around commits `aba8816` and `d33b1cb`:

1. ~~Bodyweight exercises can't be saved~~ — Logger filter now allows `s.load_kg > 0 || s.is_bodyweight`.
2. ~~Unit change wipes all entered set data~~ — `units` removed from sets-init `useEffect` deps.
3. Week calculation off-by-one — **NOT A BUG**. `(elapsed_days // 7) + 1` is correct.
4. ~~PR detection float comparison~~ — changed `prev_best == 0.0` to `prev_best <= 0`.
5. ~~Timezone shift in History date display~~ — use `T12:00:00` instead of `T00:00:00`.
6. ~~Analytics race condition on week selector~~ — stale flag in `useEffect` cleanup.
7. ~~Duplicate session logging (no DB constraint)~~ — `UniqueConstraint("program_id","week","session_name")` on `SessionLog`.
8. ~~Recovery score misleading when no metrics exist~~ — added `has_metrics_data` flag + UI warning.
9. ~~Parser accepts unbounded week numbers~~ — `total_weeks = max(parsed_max_week, 12)`.
10. ~~No unique constraint on program exercises~~ — `UniqueConstraint("program_id","week","session_name","exercise_order")` on `ProgramExercise`.
11. ~~Silent catalog lookup failure in volume analytics~~ — `logger.warning()` on missing exercises.
12. ~~Analytics empty data bug~~ — analytics hardcoded `user_id=1` but logging used `User.first()`. Fixed via `_default_user_id()` helper in analytics router.
13. ~~Progressive overload queried only current week for previous weight~~ — now queries all weeks, newest first (commit `1033862`).
14. ~~Re-uploading an Excel program silently stranded the user~~ — `ProgramUpload` now surfaces on Program page via a "Re-import from Excel" button, and the backend pauses any prior active program before creating the new one (commit `d2027aa`, 2026-04-21).

## Still Open

### O1. No session status enum validation
**File:** `backend/app/routers/tracker.py` (~line 391)
Status is checked against `{"completed","partial","skipped"}` at the endpoint but the
model accepts any string. A direct DB insert could bypass validation.
**Fix:** SQLAlchemy `Enum` column + DB migration.
**Priority:** Low — endpoint-level validation is sufficient for API access.

### O2. Program status PATCH mismatch (frontend/backend)
**Files:** `frontend/src/api/client.js` `updateProgramStatus()` sends `?status=X` as
**query string**; `backend/app/routers/programs.py` expects a JSON body
`{"status": "X"}` via the `StatusUpdate` pydantic model.
**Effect:** Pause / Complete / Abandon / Resume buttons on the Program page do not
currently update status on the backend (FastAPI returns 422 for missing body).
**Fix:** Either change the frontend to POST a JSON body, or make the backend accept
`status` as a query param. One-line fix either way.
**Priority:** Medium — blocks the lifecycle UI, but users can still pause via re-import.

### O3. Dead Render backend still referenced by CLAUDE.md history
The Render free-tier deploy at `gym-tracker-09w0.onrender.com` no longer responds.
Fly.io at `gym-tracker-api-bold-violet-7582.fly.dev` is now the authoritative backend.
`CLAUDE.md` has been updated to reflect this; `VITE_API_URL` on Vercel should point
to Fly.io. Render deploy can be formally decommissioned.
**Priority:** Low — nothing is actually broken.

### O4. `test_log_bulk_relog_replaces` is flaky / broken
**File:** `backend/tests/test_logging_api.py:71`
Pre-existing test failure — `resp2`'s returned `session_log_id` equals `resp1`'s even
though the payload changed. Unrelated to rank/share work. Skipped/ignored in recent
commits but still present in the suite.
**Priority:** Low — rest of suite passes (55/56 as of 2026-04-21).

### O5. Chat has no rooms
An external session implemented room-aware chat with a WebSocket endpoint, but that
work lived in an isolated environment and never reached `origin/master`. Current
`backend/app/routers/chat.py` is global-only, polling-based (no WS). If rooms are
wanted, the design needs to be re-implemented here.
**Priority:** Feature, not bug.

### O6. Dashboard "Week Streak" label shows a day count
**Files:** `frontend/src/pages/Dashboard.jsx:161`, `backend/app/routers/dashboard.py:94-110`, `frontend/src/i18n.js` (`common.streak`).
Label was renamed to "Week Streak" as part of the 2026-04-22 completion-based
progression work, but Dashboard still reads `week.streak_days` — a count of
consecutive calendar **days** with a completed session, not weeks. A user with one
session/day for 5 days displays "5 Week Streak."
**Fix options:**
1. Replace `streak_days` in `dashboard.py` with the new week-based
   `current_streak` from `tracker._compute_streaks` (requires fetching the active
   program + vacations in the dashboard payload).
2. Keep day semantics and undo the label rename (revert `common.streak` to
   "Streak" and keep the day count honest).
**Priority:** Medium — user-visible inconsistency, not a crash.

### O7. `_compute_streaks` current-streak freezes instead of breaking
**File:** `backend/app/routers/tracker.py:190` (and the trailing `reversed(all_weeks)` walk at 204-212).
`all_weeks` is built from the earliest to the **latest logged** date. If a user
stops training, the trailing walk never considers weeks between their last log and
today — so `current_streak` reports whatever it was at the last log, forever. A user
who completed week 10 and then logged nothing for a month still shows their
pre-gap streak instead of 0.
**Fix sketch:** use `latest_date = max(latest_logged_date, today)` (or `today`
outright) so the walk includes the present. Also decide whether the in-progress
current week should count before `frequency` sessions are hit — probably not, or
the streak flickers mid-week.
**Missing test:** "user takes 2 unlogged weeks without a vacation period →
current_streak == 0" — would have caught this.
**Priority:** Medium — the streak is a core gamification signal; a frozen streak
is misleading.

### O8. `missed: 0` is dead weight in tracker responses
**Files:** `backend/app/routers/tracker.py:328, 805`.
The `missed` / `total_missed` fields are kept "for backward compat" in
`get_tracker` and `get_adherence`, but the frontend already dropped the `missed`
status icon from `Tracker.jsx` and nothing else reads the field. Remove it and
any client that still references it.
**Priority:** Low — cosmetic.

### O9. No guard against overlapping open vacation periods
**File:** `backend/app/routers/vacation.py` (`create_vacation`).
Nothing prevents a user from creating a second vacation while one is still
open (`end_date is None`). `get_active_vacation` hides the problem by returning
the most recent, but stale open rows accumulate. Either reject a new POST
while an open one exists, or auto-close the prior one on the new request.
**Priority:** Low — no user-visible effect today.
