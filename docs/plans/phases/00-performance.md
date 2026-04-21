# Phase 0 — Performance

## Goal
Dashboard first paint < 2s locally.

## Done
- Compound indexes added in `_run_migrations()` (main.py) for SQLite and Postgres:
  - `idx_workout_logs_user_date` on `workout_logs(user_id, date)`
  - `idx_session_logs_user_date` on `session_logs(user_id, date)`
  - `idx_body_metrics_user_date` on `body_metrics(user_id, date)`
  - `idx_cardio_logs_user_date` on `cardio_logs(user_id, date)`
  - `idx_achievements_user` on `achievements(user_id)`
  - `idx_feed_events_user_created` on `feed_events(user_id, created_at)`
- New consolidated endpoint `GET /api/dashboard` (`routers/dashboard.py`) returning: `today_quest`, `week_stats`, `recent_prs`, `recovery_flag`, `medal_summary`, `muscle_ranks`, `feed` in a single payload.
- Dashboard default range capped at last 12 weeks.
- Medals + ranks computed on write (engines), never on read.
- Frontend: Dashboard uses single `getDashboard()` call (was 4 parallel). BodyMap lazy-loaded via `React.lazy`.

## Not done / follow-ups
- No true caching layer (e.g., Redis). Fine at 4 users.
- Chunk-size build warning in frontend remains (pre-existing, not a regression).
- `JourneyProgress` + `Deload` widgets were dropped from Dashboard; re-add if wanted (they'd need fields added to the `/api/dashboard` payload).
