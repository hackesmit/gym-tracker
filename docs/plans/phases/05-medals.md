# Phase 5 — Medal System (King of the Hill)

## Goal
Each medal has one current holder; surpass the value → take it.

## Done
- Tables:
  - `medals(id, name, metric_type, unit, higher_is_better)` — seeded on startup.
  - `medal_records(id, medal_id, user_id, value, source_type, source_id, achieved_at)`.
  - `medal_current_holder(medal_id PK, user_id, value, updated_at)`.
- Seeded medals (MVP):
  - Strength: `strongest_bench_1rm`, `strongest_squat_1rm`, `strongest_deadlift_1rm`, `highest_total`.
  - Cardio: `longest_run`, `fastest_mile` (higher_is_better=False), `longest_ride`, `longest_swim`.
  - Consistency: `longest_streak`, `most_sessions_30d`, `highest_volume_30d`.
- `medal_engine.py`:
  - `check_strength_medals(db, user_id, workout_log)` — triggered on WorkoutLog insert/update.
  - `check_cardio_medals(db, user_id, cardio_log)` — triggered on CardioLog insert/update.
  - `check_consistency_medals(db, user_id)` — triggered on SessionLog insert/update.
- **Official 1RM rule enforced**: only WorkoutLog with `is_true_1rm_attempt=True` AND `completed_successfully=True` AND `reps==1` updates strength medals. Estimated 1RM never touches official medals.
- Holder swap emits a `FeedEvent` (first claim = `medal_earned`, subsequent takeover = `medal_stolen`).
- Router `/api/medals`:
  - `GET /` — list with current holders.
  - `GET /my` — user's currently held medals.
- Frontend: `pages/Medals.jsx` — grid with holder and badge on your medals.
- Tests: `tests/test_medals.py` — official 1RM takes holder; estimated does not.

## Not done / follow-ups
- No medal history timeline view.
- `fastest_mile` uses min pace over any run of distance ≥ 1.6 km — could be refined to best split from GPX later.
- Consistency medals recompute on every SessionLog write (O(log count) per user). Fine at 4 users.
- No way to contest / re-validate a historic entry.
