# Known Bugs & Issues

Original audit: 2026-03-24
Last updated: 2026-05-18

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
15. ~~Manual 1RM saved in Settings never awarded strength medals~~ — `PATCH /api/manual-1rm` now calls `_update_holder()` for each saved category, mirroring the WorkoutLog path. Medal holders, feed events, and system chat messages all fire on Settings save (2026-04-21).
16. ~~Mobile page titles too close to the fixed top bar~~ — main content padding bumped from `pt-16` to `pt-20` so the title clears the mobile header by ~28px instead of ~12px (2026-04-21).
17. ~~Muscle ranks stuck on "Champion" after the 2026-04-21 engine rewrite~~ — `GET /api/ranks` and the dashboard now always call `recompute_for_user()` on read instead of only when the table is empty; stale rows from the old percentile engine no longer leak through (2026-04-21).
18. ~~Aragorn-style data corruption: WEIGHTED PULLUP entered as bodyweight inflated back rank to Champion~~ — fixed 2026-04-25. New SetRow component shows BW (auto) + Added fields separately so users can't conflate them. WorkoutLog.added_load_kg column stores plate-only load. Migration audited + corrected historical bogus rows (see CLAUDE.md "BW input migration" section). Rank engine reads added_load_kg directly + applies size_bonus + MAX_ADDED_RATIO_FOR_BACK_ARMS=2.0 guard.
19. ~~Restore-unsaved-workout flow had 7 bugs: BW reps-only never persisted, no TTL, cross-session bleed, etc.~~ — fixed 2026-04-25. Replaced inline localStorage logic in Logger.jsx with useWorkoutDraft hook (commit b0cd3af). Hook persists when ANY set has load OR reps > 0, has 14-day TTL, clears pendingRestore on session/week switch, sweeps orphaned keys on mount, explicit accept/discard cleans the key.
20. ~~`/api/analytics/exercise-catalog` did not return `bodyweight_kind`, so the entire SetRow refactor (pure-BW chip, weighted-capable Added field, SetBwPrompt) silently fell through to the legacy single-load layout in production.~~ Fixed 2026-04-26. One-line addition to the catalog endpoint now exposes the field that Logger.jsx already reads.
21. ~~CAPTCHA wall on username change was symbolic.~~ Fixed 2026-04-26. Three holes: (a) `PATCH /api/auth/me` accepted `username` with no CAPTCHA — now `UpdateMePayload` rejects unknown fields (`extra="forbid"`); (b) the CAPTCHA token had no `sub` claim and reused `JWT_SECRET`, so a token minted for user A was reusable by user B and minted by any code path that signed access tokens — now bound to `user_id` and signed with a domain-separated key derived via `HMAC(JWT_SECRET, b"username_captcha/v1")`; (c) usernames could carry zero-width-space and other format chars, allowing homoglyph squatting — `_normalize_username` NFKC-normalizes, strips, and rejects any character in Unicode category C (control/format/surrogate).
31. ~~Program status PATCH mismatch: frontend sends query string, backend expects JSON body~~ — fixed 2026-05-18. `frontend/src/api/client.js::updateProgramStatus()` was hitting `PATCH /api/programs/{id}/status?status=X` with status as a query parameter, but the backend's `StatusUpdate` pydantic model expected a JSON body `{"status": "X"}`, causing all Pause/Complete/Abandon/Resume buttons to return 422. Changed frontend to send JSON body matching backend schema. All 54 frontend tests pass.
22. ~~Rank engine never recomputed on PATCH `/api/log/set/{id}` or DELETE `/api/log/session/{id}`.~~ Fixed 2026-04-26. A user could log a fake 1RM PR to spike their rank, then delete the session, and the inflated tier persisted until the next POST. Both paths now call `recompute_for_user` after commit (best-effort, non-fatal).
23. ~~`SetUpdateRequest` did not accept `added_load_kg`, so editing a weighted-pullup set in History silently overwrote the post-migration semantic and stranded the row in an inconsistent state.~~ Fixed 2026-04-26. Endpoint now accepts `added_load_kg`; the History edit form computes a corrected `added_load_kg = max(0, new_load - bw_at_log)` from the original row's `load_kg - added_load_kg`. Tracker week payload also surfaces `added_load_kg` so the edit form has the original snapshot to work from.
24. ~~Tonnage / weekly volume / `consistency_volume_30d` / `performance_volume_increase_30d` inflated for any user with weighted-pullup or dip history because the BW migration stored `load_kg = bw + plate` and the SQL summed `load_kg * reps_completed` directly.~~ Fixed 2026-04-26. All four call sites (`analytics/volume.py`, `routers/dashboard.py` `week_volume`, `routers/friends.py` `_aggregate`, `medal_engine.py` lines 453/565/574) now use `coalesce(added_load_kg, load_kg) * reps_completed` so the per-set contribution is plate-only for bodyweight-class lifts and total for external lifts.
25. ~~Per-exercise e1RM chart on Progress page (and the new-vs-old PR detector inside `POST /api/log/bulk`) read raw `load_kg`, so weighted-pullup PRs displayed inflated by the user's bodyweight and "first PR after deploy" events fired spuriously when historical rows hadn't been migrated.~~ Fixed 2026-04-26. `analytics/progress.py::_fetch_exercise_history` now collapses to plate-only via `added_load_kg if not None else load_kg`. PR detection in `routers/logging.py` uses the same effective-load helper for both the new session sets and the historical lookup, keeping both sides on the same scale.
26. ~~`PATCH /api/manual-1rm` only fired `_update_holder` for the four `strength_1rm:*` medals, never the derivative chain (`_recompute_strength_derivatives`).~~ Fixed 2026-04-26. Saves now invoke the derivative chain so Powerlifting Total, Best Relative Strength, and Most Improved fire from Settings without requiring a logged 1RM attempt. Also calls `recompute_for_user` so muscle ranks reflect the new manual value immediately. CLAUDE.md "Medal awarding" section updated to reflect the actual behavior.
27. ~~`POST /api/auth/absorb` raised IntegrityError and rolled back the entire transaction whenever the source user had any Achievement or ChatMessage rows~~ — both have FKs to `users.id` without `ON DELETE CASCADE`. Fixed 2026-04-26. Both models added to the migration list before `db.delete(src)`. Documented "claim my hackesmit data" flow now works for users who have ever earned a PR or sent a chat message. Regression test in `backend/tests/test_absorb.py`.
28. ~~Logging hamstring curls / leg extensions / chest flies / ab work didn't move the corresponding rank~~ — fixed 2026-05-02. Spec at `docs/superpowers/specs/2026-05-02-muscle-rank-coverage-audit-design.md`. New isolation pathways added for every previously-uncovered group; arms split into biceps + triceps; abs added as a ranked group. Pure-isolation cap (`MAX_ISOLATION_ONLY_ELO = 2500`) prevents leg-curl-only Champion claims.
29. ~~Program status PATCH mismatch: frontend sends query string, backend expects JSON body~~ — fixed 2026-05-18. `frontend/src/api/client.js::updateProgramStatus()` was hitting `PATCH /api/programs/{id}/status?status=X` with status as a query parameter, but the backend's `StatusUpdate` pydantic model expected a JSON body `{"status": "X"}`, causing all Pause/Complete/Abandon/Resume buttons to return 422. Changed frontend to send JSON body matching backend schema. All 54 frontend tests pass.
30. ~~No guard against overlapping open vacation periods~~ — fixed 2026-05-18. `POST /api/vacation` now rejects a new period with 409 if an open one (`end_date IS NULL`) already exists for the user, with detail "An open vacation period already exists. End it first." Prevents stale open rows from accumulating. Regression test added in `backend/tests/test_vacation.py`.
31. ~~Render backend decommissioned~~ — fixed 2026-05-18. The free-tier Render deploy at `gym-tracker-09w0.onrender.com` has been dead for months. Fly.io at `gym-tracker-api-bold-violet-7582.fly.dev` is the authoritative backend. CLAUDE.md Live URLs section no longer references Render.
32. ~~Dashboard "Week Streak" label shows a day count (O7)~~ — fixed 2026-05-18. `dashboard.py` now calls `_compute_streaks` on the active program to produce a week-based `current_streak` field in the `week_stats` payload. `Dashboard.jsx` reads `week.current_streak ?? week.streak_days ?? 0` so week-based counts take priority over the old day-count fallback. `streak_days` kept in payload for back-compat.
33. ~~`_compute_streaks` current-streak freezes instead of breaking (O8)~~ — fixed 2026-05-18. `all_weeks` now extends to `max(latest_log_date, today)` so the walk reaches the present. The in-progress current week is skipped (not credited, not penalised) until `frequency` sessions are completed, preventing mid-week flicker. `_compute_streaks` accepts an optional `today` parameter for deterministic testing. Two new regression tests added to `backend/tests/test_tracker_progression.py`.
34. ~~Dead `missed: 0` / `total_missed: 0` fields in tracker responses (O9)~~ — fixed 2026-05-18. Both fields removed from `get_tracker` and `get_adherence` in `tracker.py`. Confirmed no frontend consumer reads either field.

## Still Open

### O1. No session status enum validation (was O11)
**File:** `backend/app/routers/tracker.py` (~line 391)
Status is checked against `{"completed","partial","skipped"}` at the endpoint but the
model accepts any string. A direct DB insert could bypass validation.
**Fix:** SQLAlchemy `Enum` column + DB migration.
**Priority:** Low — endpoint-level validation is sufficient for API access.

### O2. `test_log_bulk_relog_replaces` is flaky / broken
**File:** `backend/tests/test_logging_api.py:71`
Pre-existing test failure — `resp2`'s returned `session_log_id` equals `resp1`'s even
though the payload changed. Unrelated to rank/share work. Skipped/ignored in recent
commits but still present in the suite.
**Priority:** Low — rest of suite passes (55/56 as of 2026-04-21).

### O3. Logger UI never sets `is_true_1rm_attempt`
**Files:** `frontend/src/pages/Logger.jsx`, `backend/app/models.py` (`WorkoutLog.is_true_1rm_attempt`).
The column exists and the backend's `check_strength_medals()` keys off it, but no
frontend control ever sets it. In practice strength medals can only be awarded via
Settings → Manual 1RM (workaround shipped 2026-04-21). Add a "True 1RM attempt"
checkbox in the Logger to close the loop for in-workout 1RM tests.
**Priority:** Low — Manual 1RM path covers the use case.

### O4. Chat has no rooms
An external session implemented room-aware chat with a WebSocket endpoint, but that
work lived in an isolated environment and never reached `origin/master`. Current
`backend/app/routers/chat.py` is global-only, polling-based (no WS). If rooms are
wanted, the design needs to be re-implemented here.
**Priority:** Feature, not bug.

### O5. Friend profile UI renders `undefined` labels and hides medals/PRs
**File:** `frontend/src/pages/UserProfile.jsx` (route `/users/:id`).
`UserProfile.jsx` expects the shape returned by a full `/ranks/compare/:id`-style
endpoint — fields `muscle_group`, `sub_index`, `sub_label`, `elo`, `thresholds`,
`ratio`, plus `recent_prs`, `medals`, and total `elo`. The actual
`/social/compare/:id` response returns only `{group, rank, score}` per rank and
does not include `recent_prs` or `medals`. As a result, sub-tab labels show
"undefined", total ELO shows 0, and the medals/PR sections never render.
This bug predates the nav-consolidation split — it was carried over verbatim from
the old combined `Profile.jsx` friend-view branch. Fix options: extend
`/social/compare` to return the richer shape, or fetch `/ranks/compare/:id`
alongside, or mount a dedicated endpoint.
**Priority:** Medium — friend profile is visually broken for any user who visits it.

~~O10. Theme flash-of-unthemed-content (FOUC) on first paint~~ — **Resolved 2026-05-18.**
A blocking inline `<script>` added to `frontend/index.html` (before the bundle)
reads `gym-tracker-theme`, `gym-theme-mode`, and `gym-realm` from localStorage
and writes the four `--color-accent*` CSS vars (minimal mode) or `data-realm`
(LOTR mode) onto `<html>` before React loads. The 13-preset map in the script is
duplicated from `src/theme/presets.js`; a comment in `AppContext.jsx` flags both
copies as needing to stay in sync.
