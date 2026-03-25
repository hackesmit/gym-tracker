# Known Bugs & Issues

Audit date: 2026-03-24
Last updated: 2026-03-24

## Fixed (commit aba8816 + d33b1cb)

### 1. ~~Bodyweight exercises can't be saved~~ FIXED
Filter changed to `s.load_kg > 0 || s.is_bodyweight` in Logger.jsx.

### 2. ~~Unit change wipes all entered set data~~ FIXED
Removed `units` from the sets-init `useEffect` dependency array.

### 3. Week calculation off-by-one — NOT A BUG
`(elapsed_days // 7) + 1` is correct: days 0-6 = week 1, day 7 = week 2.

### 4. ~~PR detection float comparison~~ FIXED
Changed `prev_best == 0.0` to `prev_best <= 0`.

### 5. ~~Timezone issue in History date display~~ FIXED
Changed `T00:00:00` to `T12:00:00` to avoid midnight boundary shift.

### 6. ~~Analytics race condition on week selector~~ FIXED
Added stale flag in useEffect cleanup to discard outdated responses.

### 7. ~~Duplicate session logging (no DB constraint)~~ FIXED
Added `UniqueConstraint("program_id", "week", "session_name")` to SessionLog model.

### 8. ~~Recovery score misleading when no metrics exist~~ FIXED
Added `has_metrics_data` flag to API response + warning in Recovery UI.

### 9. ~~Parser accepts unbounded week numbers~~ FIXED
`total_weeks` now derived from parsed data (`max_week`) instead of hardcoded 12.

### 10. ~~No unique constraint on program exercises~~ FIXED
Added `UniqueConstraint("program_id", "week", "session_name", "exercise_order")` to ProgramExercise model.

### 11. ~~Silent catalog lookup failure in volume analytics~~ FIXED
Added `logger.warning()` for missing exercises in volume and balance analytics.

## Still Open

### 12. No session status enum validation
**File:** `backend/app/routers/tracker.py:~391`
Status is checked against a set `{"completed", "partial", "skipped"}` at the endpoint level, but the model accepts any string. A direct DB insert could bypass validation.
**Fix:** Use a proper SQLAlchemy `Enum` type on the column. Requires DB migration.
**Priority:** Low — endpoint-level validation is sufficient for API access.
