# Known Bugs & Issues

Audit date: 2026-03-24

## High Priority

### 1. Bodyweight exercises can't be saved
**File:** `frontend/src/pages/Logger.jsx:167`
Sets are filtered with `s.load_kg > 0`, so bodyweight exercises with load=0 are silently excluded from the save payload.
**Fix:** Change filter to `s.load_kg > 0 || s.is_bodyweight`.

### 2. Unit change wipes all entered set data
**File:** `frontend/src/pages/Logger.jsx:152`
`units` is in the dependency array of the sets-init `useEffect`. If you change units in Settings mid-workout, all entered data resets.
**Fix:** Remove `units` from the dependency array; convert display values on render instead of re-initializing.

### 3. Week calculation off-by-one
**File:** `backend/app/routers/tracker.py:~90`
`(elapsed_days // 7) + 1` advances to week 2 on day 7, but a week should be days 0–6.
**Fix:** Use `(elapsed_days // 7) + 1` only if weeks are 1-indexed with 0-based days, or clarify the intended behavior. Currently users advance a week early.

### 4. PR detection float comparison
**File:** `backend/app/routers/logging.py:~320`
`prev_best == 0.0` is unreliable with floats. Should use `prev_best <= 0`.

### 5. Timezone issue in History date display
**File:** `frontend/src/pages/History.jsx:~21`
Appending `T00:00:00` to a date string without timezone can shift the displayed date by a day depending on the user's timezone.
**Fix:** Use `new Date(dateStr + 'T12:00:00')` to avoid midnight boundary issues, or parse as UTC.

### 6. Analytics race condition on week selector
**File:** `frontend/src/pages/Analytics.jsx`
Rapidly switching between 4w/8w/12w tabs can cause stale responses to overwrite newer ones.
**Fix:** Use an AbortController or a request sequence counter to discard stale responses.

### 7. Duplicate session logging (no DB constraint)
**File:** `backend/app/routers/tracker.py:~413`
No unique constraint on `(program_id, week, session_name)` — two concurrent POSTs can both pass the duplicate check.
**Fix:** Add a unique constraint to the `session_logs` table, or use a DB-level upsert.

## Medium Priority

### 8. Recovery score misleading when no metrics exist
**File:** `backend/app/analytics/recovery.py:129`
Returns default score (~65) using hardcoded fallbacks (sleep=7, stress=3, soreness=3) when no body metrics have been logged. No indication to the user that data is missing.
**Fix:** Return a `has_data: false` flag or null score when no metrics exist.

### 9. Parser accepts unbounded week numbers
**File:** `backend/app/parser.py:~152`
An Excel file with "WEEK 999" is accepted and stored without validation against `total_weeks`.
**Fix:** Validate parsed week numbers against the program's total weeks.

### 10. No unique constraint on program exercises
**File:** `backend/app/models.py`
Re-importing a program can create duplicate exercises since there's no unique constraint on `(program_id, week, session_name, exercise_order)`.
**Fix:** Add `UniqueConstraint` to the model, or delete existing exercises before re-import.

### 11. Silent catalog lookup failure in volume analytics
**File:** `backend/app/analytics/volume.py:~106`
Exercises missing from the catalog are silently skipped, making volume analytics incomplete without any warning.

### 12. No session status enum validation
**File:** `backend/app/routers/tracker.py:~391`
Status is checked against a set `{"completed", "partial", "skipped"}` at the endpoint level, but the model accepts any string. A direct DB insert could bypass validation.
**Fix:** Use a proper SQLAlchemy `Enum` type on the column.
