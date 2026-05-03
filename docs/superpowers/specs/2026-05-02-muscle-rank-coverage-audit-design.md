# Muscle rank coverage audit — design

**Date:** 2026-05-02
**Author:** Claude (with hackesmit)
**Status:** Draft, awaiting user review before plan-writing

## Problem

The fixed-threshold muscle-rank engine in `backend/app/rank_engine.py` only updates ranks from a narrow set of barbell anchor lifts per group. Logging a seated/lying hamstring curl tags the workout `muscle_group_primary: hamstrings` in the catalog but never moves the hamstrings rank, because the engine only reads deadlift variants for that group. The same silent omission exists for quads (leg extension is ignored), chest (cable / pec deck / DB flies are ignored), and abs (no group exists at all).

Additionally, "arms" is a single rank covering both biceps and triceps, which makes weak-point identification impossible — a strong-pulling, weak-pressing user looks identical to the inverse on the body map.

Finally, several existing thresholds were never calibrated against published strength standards. The rank engine's claim — that Champion is an *earned, comparable-across-users* tier — only holds if the threshold tables reflect real-world strength data.

## Goal

Audit every catalog entry and ensure each one either contributes to its primary muscle group's rank with a calibrated specificity, or is explicitly excluded with a documented reason. Split arms into independent biceps and triceps groups. Add abs as a ranked group. Recalibrate threshold tables against published strength data ([Strength Level](https://strengthlevel.com)) so the ratios are representative of real strength rather than author guesses.

## Non-goals

- Calves remain unranked. Catalog entries stay (volume still tracked) but contribute to no rank.
- No frontend test additions. `BodyMap.jsx` has no unit tests today; the label changes are caught manually.
- No change to medal logic. Medals continue to fire from the same `medal_engine.py` paths.
- No change to the analytics spider chart's separate strength-standards engine.
- No new abs anchor lift in the catalog. Existing entries (cable crunch, machine crunch, hanging leg raise, etc.) are sufficient.

## Design

### Group structure

`MVP_GROUPS` grows from 6 to 8:
```
chest, back, shoulders, quads, hamstrings, biceps, triceps, abs
```
- `"arms"` is removed entirely.
- `biceps` and `triceps` each persist their own `MuscleScore` rows.
- `abs` joins the ranked set; calves stays unranked.

### Per-group pathway template

Every ranked group follows the same hybrid template proven by the existing arms / shoulders code: an anchor pathway and a secondary pathway, each with its own calibrated threshold table, blended in ELO space using `continuous_score` → weighted average → `tier_sub_from_elo`, then reverse-mapped to a "pseudo-ratio" against the group's display table for the Profile progress bar.

| Group | Anchor pathway | Secondary pathway | Anchor / secondary blend |
|---|---|---|---|
| chest | barbell bench + variants (`EXERCISE_MAP["chest"]`, unchanged) | chest fly isolation (cable, machine, pec deck, DB fly) | 0.85 / 0.15 |
| back | weighted pullup + bodyweight rep fallback + row/pulldown compound (unchanged) | — (already hybrid) | unchanged |
| shoulders | barbell / DB OHP (unchanged) | lateral raise isolation (unchanged) | 0.70 / 0.30 (unchanged) |
| quads | back squat + variants (unchanged) | leg extension isolation | 0.85 / 0.15 |
| hamstrings | deadlift variants (unchanged) | leg curl isolation + hyperextension/glute-ham as low-spec compound | 0.80 / 0.20 |
| biceps | back ELO (pullup + row pathway) | curl isolation (existing `ARMS_CURL_ISOLATION`) | 0.70 / 0.30 |
| triceps | max(chest, shoulder press) ELO + dip / close-grip / heavy compound (existing `ARMS_TRICEP_COMPOUND`) | tricep isolation (existing `ARMS_TRICEP_ISOLATION`, recalibrated) | 0.70 / 0.30 |
| abs | weighted crunch e1RM/BW (cable / machine / plate-weighted / roman chair) | bodyweight rep fallback (hanging leg raise / leg raise / dead bug) with `size_bonus` | weighted wins if present; rep fallback otherwise |

The chest / quads / hamstrings 0.15–0.20 secondary weight is intentionally smaller than the 0.30 used for arms/shoulders. Rationale: barbell bench, squat, and deadlift translate ~directly to "chest / quads / hamstring strength," whereas press translates only loosely to triceps and pullups translate only loosely to biceps. Isolation deserves more weight in the latter pair.

**Pure-isolation cap.** When the anchor pathway has no data and only the secondary pathway is logged, the secondary's ELO is clipped to `MAX_ISOLATION_ONLY_ELO = 2500` (Diamond V floor) *before* blending. This guarantees Champion always requires anchor-pathway evidence (real deadlift / squat / bench / weighted dip / weighted pullup), while still letting isolation work meaningfully populate the rank up to Diamond. The cap applies to: hamstrings (leg curl), quads (leg extension), chest (fly), biceps (curl), triceps (iso pushdowns/extensions). It does **not** apply to:

- **Shoulders** — laterals max out around ratio 0.85 against `LATERAL_THRESHOLDS` (below Champion 1.30) so a natural cap exists.
- **Back** — already uses `max(weighted_tier, rep_tier)` for the bodyweight rep fallback, no anchor/secondary structure.
- **Abs** — has no clean anchor; weighted crunch and rep fallback are co-equal pathways. A 48-rep hanging leg raise (published Elite) legitimately earns Champion abs.

### Threshold tables (research-backed)

All numbers are 1RM ÷ bodyweight ratios for an adult male @ 80 kg BW reference, sourced from [Strength Level](https://strengthlevel.com) percentile data. Mapping convention: Beginner→Bronze, Novice→Silver, Intermediate→Gold, mid-Advanced→Platinum, Advanced→Diamond, Elite-or-above→Champion.

**New tables in `muscle_rank_config.py`:**

| Table | Bronze | Silver | Gold | Platinum | Diamond | Champion |
|---|---|---|---|---|---|---|
| `LEG_CURL_THRESHOLDS` (seated/lying leg curl e1RM ÷ BW) | 0.40 | 0.65 | 1.00 | 1.30 | 1.60 | 1.90 |
| `LEG_EXTENSION_THRESHOLDS` (e1RM ÷ BW) | 0.50 | 0.80 | 1.25 | 1.75 | 2.10 | 2.40 |
| `CHEST_FLY_THRESHOLDS` (cable / pec deck / DB×2 e1RM ÷ BW) | 0.10 | 0.25 | 0.50 | 0.85 | 1.10 | 1.30 |
| `ABS_WEIGHTED_THRESHOLDS` (cable crunch e1RM ÷ BW) | 0.25 | 0.55 | 1.00 | 1.50 | 1.90 | 2.20 |
| `ABS_FALLBACK_REPS` (strict hanging leg raise reps, `size_bonus` applied) | 1 | 7 | 18 | 28 | 38 | 48 |

**Existing-table recalibrations:**

- `TRICEP_ISOLATION_THRESHOLDS`: bump from `0.08 / 0.15 / 0.22 / 0.30 / 0.40 / 0.55` to **`0.30 / 0.50 / 0.75 / 1.00 / 1.20 / 1.40`** (raw-ratio scale matching Strength Level).
- `ARMS_TRICEP_ISOLATION` spec multipliers: drop from 0.20–0.35 down to **1.0** for every entry, since the new threshold table now operates on raw ratios.
- `MUSCLE_RANK_THRESHOLDS["back"]`: tighten Diamond from 1.25 to **1.00**, Champion from 1.50 to **1.20** (published Elite weighted pullup is +1.08 BW; current values are aspirational beyond Elite). Side effect: existing back ranks deflate ~half a tier for users currently at Diamond+; biceps deflates slightly too since it consumes back ELO at 0.70.

**Display tables for biceps and triceps:** both reuse the existing arms-shape ratio table (Bronze 0.00 → Champion 1.50, weighted-dip-added scale) as `BICEPS_THRESHOLDS` and `TRICEPS_THRESHOLDS`. These exist solely for the Profile progress bar reverse-mapping; the actual rank is determined by the blended ELO. Published Elite weighted dip = +1.45 BW lands at Champion exactly — table is correctly calibrated.

### Catalog audit process

Every row in `seed_catalog.py` gets one of four dispositions, listed in a single new `CATALOG_AUDIT` table at the bottom of `muscle_rank_config.py`:

- **`anchor`** — counts toward the group's primary pathway with a specificity multiplier. Stored in `EXERCISE_MAP[group]`.
- **`isolation`** — counts toward the group's secondary pathway against a separate threshold table. Stored in a per-group `*_ISOLATION` map.
- **`compound_proxy`** — counts toward a *different* group's anchor with a discounted spec (e.g., close-grip bench → triceps anchor at 0.65; heavy skull crusher → triceps anchor at 0.55).
- **`excluded`** — explicitly does not feed any rank, with a one-line `# reason: …`.

Acceptance criterion: every catalog entry whose `muscle_group_primary` is in `MVP_GROUPS` must either appear in an `EXERCISE_MAP` / isolation / compound map for its group, or be named in `CATALOG_AUDIT` with disposition `"excluded"` and a documented reason. Asserted by a new test (Section "Tests" #8 below).

### Migration

A single one-shot migration block runs in `main.py`'s lifespan, gated by a `migration_log` row named `split_arms_2026_05`. On first deploy:

1. `DELETE FROM muscle_scores WHERE muscle_group = 'arms'` for every user.
2. Insert the `migration_log` row.
3. Call `recompute_all(db, lookback_days_override=9999)` so the new groups are populated from each user's *full* historical `WorkoutLog` history — not just the 90-day window. Without this, users who logged leg curls 6 months ago but haven't recently would see Copper hamstrings until they retrain.
4. Subsequent recomputes (on every log/edit/delete/manual-1RM, plus every read) revert to the standard `LOOKBACK_DAYS = 90` window.

Implementation: add an optional `lookback_days_override: int | None = None` parameter to `recompute_for_user` and `recompute_all`. Defaults to None → use `LOOKBACK_DAYS`. Only the migration block passes a non-default value.

The catalog itself needs no migration — `seed_catalog.py` already tags `muscle_group_primary` correctly for every entry; the engine simply wasn't reading those rows.

### Manual 1RM extension

Extend `MANUAL_1RM_KEY` in `muscle_rank_config.py`:
```python
"biceps":  "biceps_curl"   # 1RM standing barbell curl
"triceps": "dip"           # added-load weighted dip 1RM — same key as the existing "arms_added" entry, intentionally shared so the user's single dip 1RM feeds both the legacy alias and the new triceps key
"abs":     "cable_crunch"  # 1RM cable crunch
```
The existing `User.manual_1rm` JSON column accepts arbitrary keys. The Settings → Manual 1RM panel grows three optional input rows below a divider, leaving the four primary lifts (bench / squat / deadlift / ohp) unchanged at the top.

### Backend code shape

**`muscle_rank_config.py`:**
- Update `MVP_GROUPS` to the new 8-group list.
- Remove `"arms"` from `MUSCLE_RANK_THRESHOLDS`; add `"biceps"`, `"triceps"`, `"abs"` entries.
- Add the five new threshold tables, four new isolation/pathway maps, and the `MAX_ISOLATION_ONLY_ELO = 2500` constant.
- Recalibrate `TRICEP_ISOLATION_THRESHOLDS` and zero-out `ARMS_TRICEP_ISOLATION` spec multipliers to 1.0.
- Tighten `MUSCLE_RANK_THRESHOLDS["back"]` Diamond/Champion thresholds.
- Extend `MANUAL_1RM_KEY` with the three new keys.
- Append the `CATALOG_AUDIT` table.

**`rank_engine.py`:**
- Replace `_compute_arms_hybrid` with `_compute_biceps` and `_compute_triceps`.
- Add `_compute_hamstrings_hybrid`, `_compute_quads_hybrid`, `_compute_chest_hybrid` wrappers around a generalized barbell-plus-isolation helper.
- Add `_compute_abs` (weighted crunch first; bodyweight rep fallback against `ABS_FALLBACK_REPS` with `size_bonus` mirroring the back pullup-rep fallback).
- Update `recompute_for_user`'s pass-1 anchors (chest, back, shoulders-press, quads, hamstrings) and pass-2 dispatch (biceps, triceps, abs).
- Add `lookback_days_override` parameter (threaded through to `cutoff = today - timedelta(days=override or LOOKBACK_DAYS)`).
- Remove the `if group == "arms"` special case.

**`routers/ranks.py`:**
- Update `_GROUP_LABELS` and `_METRIC_HUMAN` (add biceps / triceps / abs; remove arms).
- Update `_group_exercises` — replace the `arms` branch with `biceps` + `triceps` branches; add `hamstrings`, `quads`, `chest`, `abs` branches that union in the new isolation pools.

**`main.py`:** add the `split_arms_2026_05` lifespan migration block per "Migration" above.

### Frontend changes

- Extract `MUSCLE_LABELS` from `Profile.jsx`, `UserProfile.jsx`, `Compare.jsx` into a shared `frontend/src/constants/muscleGroups.js`. Add `biceps: 'Biceps'`, `triceps: 'Triceps'`, `abs: 'Abs'`; remove `arms: 'Arms'`.
- `BodyMap.jsx`:
  - Front upper-arm regions (`BodyMap.jsx:168-175`) — change `regionProps('arms', 'Arms')` to `regionProps('biceps', 'Biceps')`.
  - Back upper-arm regions (`BodyMap.jsx:222-224`) — change to `regionProps('triceps', 'Triceps')`.
  - Existing abs region (`BodyMap.jsx:163-165`) — already wired; lights up automatically once the rank engine populates abs.
- `Settings.jsx` Manual 1RM panel — add three optional input rows for `biceps_curl`, `tricep_dip`, `cable_crunch` below a divider. Existing `PATCH /api/manual-1rm` endpoint accepts arbitrary keys.
- i18n — add `en` + `es` strings for "Biceps", "Triceps", "Abs", and the three new manual-1RM input labels.
- `RankStandards.jsx`, `Profile.jsx`, `UserProfile.jsx`, `Compare.jsx` rank-card iteration — already dynamic; new groups render automatically from the API response.

### Tests

Backend tests in `backend/tests/test_ranks.py`:

- Update existing assertions: `result["arms"]` (lines 152, 411–441) → run each scenario against `result["biceps"]` and `result["triceps"]` so prior coverage isn't lost. The two `body["groups"]` arms-key lookups (lines 59, 71) become biceps/triceps lookups. `MVP_GROUPS` size assertions pass automatically.

New tests:

1. **Hamstring leg curls populate hamstring rank.** Seed only seated leg curl logs at Gold-tier weight (ratio 1.00) → assert hamstrings tier ≥ Silver (iso ELO ~1500 = Gold V; pure-iso cap at Diamond V = ELO 2500 doesn't bind here, so the result lands ~Gold-ish).
2. **Quad leg extensions populate quad rank.** Same shape against `LEG_EXTENSION_THRESHOLDS`.
3. **Chest flies populate chest rank.** Same shape against `CHEST_FLY_THRESHOLDS`.
4. **Pure isolation cannot reach Champion.** Seed leg-curl-only at the published Elite ratio (1.90) → assert hamstrings is Diamond, never Champion (verifies `MAX_ISOLATION_ONLY_ELO = 2500` cap binds). Repeat for quads (leg extension at 2.40) and chest (fly at 1.30) — all should clip to Diamond.
5. **Abs weighted pathway.** Seed cable crunch at Gold-tier weight → assert abs tier is Gold.
6. **Abs rep-count fallback.** Seed only hanging leg raises (zero load, high reps) → assert abs tier comes from the rep fallback table; assert `size_bonus` applies (heavier athlete with same reps ranks higher).
7. **Arms split — biceps and triceps are independent.** Seed weighted dips heavy + zero biceps work → assert triceps is high, biceps is Copper. Seed weighted pullups heavy + zero tricep work → reverse.
8. **Catalog audit completeness.** Iterate every catalog entry; assert each `muscle_group_primary ∈ MVP_GROUPS` is present in an `EXERCISE_MAP` / isolation / compound map for its group OR named in `CATALOG_AUDIT` with disposition `"excluded"` and a non-empty reason.
9. **Migration is idempotent.** Run the `split_arms_2026_05` block twice; assert no duplicate `migration_log` rows and the second run is a no-op.
10. **Tricep pushdown recalibration.** Seed only an Elite-grade tricep pushdown (ratio ≥ 1.40 against the new `TRICEP_ISOLATION_THRESHOLDS`) and no other tricep work → assert the resolver returns Champion on the tricep-isolation pathway when measured in isolation, then assert the *blended* triceps group rank lands at Diamond (the pure-isolation cap binds here too).
11. **Weighted pullup ceiling tightening.** Seed a +1.20 BW weighted pullup → assert back rank is Champion. Seed +1.05 BW → assert back rank is Diamond (was Champion under the old 1.50 cutoff).
12. **Migration unbounded lookback.** Seed a workout log dated 200 days ago for a leg curl → run the migration recompute → assert hamstrings ELO reflects the historical lift; then run a normal `recompute_for_user` → assert ELO drops back to Copper since the lift falls outside the 90-day window. Confirms the override applies only at migration time and decay resumes thereafter.

Frontend: no unit test additions. Manual smoke checklist below.

### Manual smoke checklist (post-deploy)

- Log a fresh seated leg curl set → hamstrings ELO increases on Profile.
- Log a fresh leg extension set → quads ELO increases.
- Log a fresh cable fly set → chest ELO increases.
- Log a fresh cable crunch set → abs rank appears (was hidden) and updates.
- Log only hanging leg raises → abs rank populates from rep fallback.
- Body map shows separate biceps and triceps regions tinted by their respective tiers.
- Settings → Manual 1RM exposes biceps_curl, tricep_dip, cable_crunch fields and saves them.
- Existing user with only barbell logs sees roughly the same chest/quads/hamstrings rank as before (anchor weight is 0.80–0.85, so the displayed tier should not move significantly absent isolation logs).

## Aggregate ELO impact

`aggregate_elo` already uses `len(values)` for the theoretical max, so growing from 6 to 8 groups widens the dashboard's "total ELO" max from 18,600 to 24,800 automatically. Existing widgets that show "X / max" stay correct. The "dominant tier" calculation (median tier across groups) gains two more inputs, smoothing it slightly.

## Risk register

- **Existing back/biceps deflation.** Tightening pullup ceiling will drop some users half a tier. Documented in CLAUDE.md's "Muscle rank engine" section as part of the change. No user data is destroyed; only the displayed tier changes, and the underlying lift history stays intact.
- **Catalog audit miscalibration.** Author estimates for unfamiliar exercises (e.g., HELMS DB ROW spec value) may not match real-world transferability. Mitigated by routing all spec values through `CATALOG_AUDIT` so future tuning is a single-file edit.
- **Migration races.** The `split_arms_2026_05` migration block runs in lifespan startup before any request lands. The `migration_log` row guard makes it idempotent across restarts. Concurrent multi-instance deploy is not a concern (Fly.io single-instance app).
- **Cardio interaction.** Cardio logs are tracked separately; no cardio exercise feeds any muscle rank. No interaction.

## Out of scope (followups)

- Calves rank — could be added later using a calf-raise pathway. Not pulled in to keep this focused.
- Forearms / glutes ranks — same.
- BW pullup "register bw" loop bug (Logger refuses to save bodyweight pullup despite saved BW) — investigated as a separate task once this spec lands. Memory note saved.
