# Phase 6 — Muscle Group Ranks

## Goal
Rank each body part on a 30-day rolling basis with Rainbow Six tiers.

## Done
- Model `MuscleScore(id, user_id, muscle_group, score_v, score_i, score_f, score, rank, updated_at)` unique `(user_id, muscle_group)`.
- `rank_engine.py`:
  - `recompute_for_user(db, user_id)` — triggered on WorkoutLog write.
  - `recompute_all(db)` — for periodic refresh (not scheduled yet).
- **Rewrite (2026-04-21):** percentile engine replaced with fixed global
  strength standards. See `backend/app/muscle_rank_config.py` for the
  authoritative threshold table.
  - Metric per group: best valid e1RM / bodyweight (chest=bench, quads=squat,
    hamstrings=deadlift, shoulders=OHP) or added-load / bodyweight for
    weighted pullups (back) and weighted dips (arms).
  - Bodyweight-pullup rep count is the fallback for back.
  - Close-grip bench is the fallback proxy for arms.
  - Manual `user.manual_1rm` entries are first-class inputs.
  - Lookback window: 90 days. Reps capped at 10 for Epley accuracy.
  - Outlier guard: ratios > 5x bodyweight are rejected.
- MVP muscle groups unchanged: `chest, back, shoulders, quads, hamstrings, arms`.
- Router `/api/ranks`:
  - `GET /` — current user's ranks.
  - `GET /compare/{user_id}` — friends only.
- Tests: `tests/test_ranks.py`.

## Not done / follow-ups
- No scheduled recompute (currently relies on write-time trigger — users who stop logging will have stale ranks).
- Percentile normalization re-scans all users on every recompute. Acceptable at 4 users.
- No "progression graph" per muscle group (only current rank + score shown).
- Optional muscle groups (glutes, calves, abs, forearms, traps) exist in catalog but are NOT wired into MVP ranking.
