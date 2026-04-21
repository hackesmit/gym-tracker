# Phase 6 — Muscle Group Ranks

## Goal
Rank each body part on a 30-day rolling basis with Rainbow Six tiers.

## Done
- Model `MuscleScore(id, user_id, muscle_group, score_v, score_i, score_f, score, rank, updated_at)` unique `(user_id, muscle_group)`.
- `rank_engine.py`:
  - `recompute_for_user(db, user_id)` — triggered on WorkoutLog write.
  - `recompute_all(db)` — for periodic refresh (not scheduled yet).
- Score formula (30d rolling): `score = 100 * (0.6*V + 0.3*I + 0.1*F)`.
  - V = normalized total volume per muscle (vs max across users in group).
  - I = avg top-set-weight / bodyweight (clamped).
  - F = sessions hitting the group / 12 (capped at 1.0).
  - All components clamped to [0,1] before combining.
- MVP muscle groups: `chest, back, shoulders, quads, hamstrings, arms` (arms merges biceps+triceps from catalog).
- Mapping layer: `ExerciseCatalog.muscle_group_primary` → MVP bucket.
- Ranks:
  - Multi-user: percentile within active user group. Copper 0-10 / Bronze 10-25 / Silver 25-40 / Gold 40-60 / Platinum 60-75 / Emerald 75-85 / Diamond 85-95 / Champion 95-100.
  - Single-user fallback: absolute score thresholds (same breakpoints).
- Router `/api/ranks`:
  - `GET /` — current user's ranks.
  - `GET /compare/{user_id}` — friends only.
- Tests: `tests/test_ranks.py`.

## Not done / follow-ups
- No scheduled recompute (currently relies on write-time trigger — users who stop logging will have stale ranks).
- Percentile normalization re-scans all users on every recompute. Acceptable at 4 users.
- No "progression graph" per muscle group (only current rank + score shown).
- Optional muscle groups (glutes, calves, abs, forearms, traps) exist in catalog but are NOT wired into MVP ranking.
