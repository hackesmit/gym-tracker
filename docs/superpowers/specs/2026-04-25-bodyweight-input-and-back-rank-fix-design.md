# Bodyweight input contract + back-rank correction + restore-draft fix

**Date:** 2026-04-25
**Status:** Design (awaiting user review)
**Scope:** One spec covering three closely-coupled problems; one follow-up spec deferred.

## Problem statement

Three bugs/feature gaps in the Logger and rank engine share a common root: the app has no clear input contract for bodyweight-class lifts.

1. **No way to log bodyweight cleanly.** Pushup, ab work, plank, and bodyweight pullup all share an ambiguous "weight" field. Users either leave it blank (and lose tonnage/PR signal) or guess.
2. **Aragorn-class rank corruption.** User Aragorn entered `155 lb` into a `WEIGHTED PULLUP` set assuming the field meant his bodyweight. The rank engine treated it as +155 lb of added load and awarded him Champion back rank. User hackesmit also has anomalous Champion back rank — same root cause suspected.
3. **Restore-unsaved-workout flow is unreliable.** Sometimes prompts to restore stale data, sometimes loses in-progress data, sometimes bleeds data across sessions.

These are bundled because fixes (1) and (2) share the same UI/data-model redesign. (3) is folded in because it lives in the same `Logger.jsx` flow and the Section 1 BW UI would actively make bug (3) worse if shipped alone (BW reps-only sets currently never reach localStorage).

A fourth ask — equipment selector for variable-gear exercises like walking lunges — is **deferred to a follow-up spec**. It's UX/data work that doesn't touch ranks and can be designed independently.

A fifth concern — rank fairness across bodyweights using DOTS — is **captured in the Future Work appendix as Phase 2**. The current spec ships a small interim correction (size-bonus multiplier) so heavier lifters aren't actively underranked while Phase 2 is designed.

## Approach summary

- Logger UI redesigned around three input layouts driven by a new catalog flag `bodyweight_kind`: external-load (today's behavior), pure-BW (`BW [auto] + Reps`), and weighted-capable (`BW [auto] + Added + Reps`).
- WorkoutLog gains an `added_load_kg` column. `load_kg` semantics shift to mean "effective load" (BW + plate for bodyweight-class lifts). All downstream readers (rank engine, PR detector, analytics) keep reading `load_kg` and inherit correct numbers automatically.
- One-shot data migration audits and corrects historical bogus weighted-pullup logs (the Aragorn bug), backfills pure-BW pushup tonnage, and recomputes all ranks. Every change is recorded in a `bw_migration_audit` table with a one-click rollback endpoint.
- Rank engine gains a small size-bonus multiplier on back/arms only (interim fairness correction; Phase 2 will replace with DOTS).
- The restore-unsaved-workout flow is extracted to a new `useWorkoutDraft` hook with TTL, session-change handling, and orphaned-key cleanup.

## Section 1 — Data model + catalog metadata

### `WorkoutLog`

Add one column:

- `added_load_kg: float | None`
  - `NULL` for non-bodyweight-class lifts (barbell, DB, machine).
  - `0.0` for pure-BW sets (pushup, plank, ab work, BW pullup).
  - `> 0` for weighted-capable sets (the kg/lb on the belt for a weighted pullup or dip).

`load_kg` semantics shift to **effective load**:

| Exercise type | `load_kg` value | `added_load_kg` value |
|---|---|---|
| Barbell bench press, +100 kg | 100 | NULL |
| Pushup, BW = 80 kg | 80 | 0 |
| Weighted pullup, BW 80 + 25 plate | 105 | 25 |

`is_bodyweight` becomes redundant. The new authoritative test is `added_load_kg IS NOT NULL`. The column is kept for back-compat reads but no longer written by new logs (the bulk-log endpoint stops setting it; the `WorkoutLog` constructor in `routers/logging.py` no longer takes the value from the payload). Not dropped — one less migration risk. The migration leaves existing `is_bodyweight` values untouched on historical rows.

### `ExerciseCatalog`

Add one column:

- `bodyweight_kind: str | None`
  - `"pure"` — bodyweight only, no plate possible (PUSHUP, PLANK, ab work, BW PULLUP, BW WALKING LUNGES).
  - `"weighted_capable"` — bodyweight plus optional added load (WEIGHTED PULLUP, WEIGHTED DIP, WEIGHTED CHIN-UP).
  - `NULL` — external load only (everything else, including barbell, DB, machine, smith).

The existing `equipment` field is left alone. Other UI code (weight hints, swap modal) still reads it. The Logger reads `bodyweight_kind` to decide which input layout to render.

### Catalog cleanup

One-shot in `seed_catalog.py` + a startup migration to backfill rows already inserted:

| Canonical name | New `bodyweight_kind` | Notes |
|---|---|---|
| `WEIGHTED PULLUP`, `WEIGHTED PULL-UP`, `WEIGHTED CHIN-UP`, `WEIGHTED CHINUP` | `weighted_capable` | also set `equipment = "barbell"` (a plate is involved) |
| `WEIGHTED DIP`, `WEIGHTED DIPS`, `WEIGHTED DIP (HEAVY/BACK OFF)` | `weighted_capable` | same |
| `PULLUP`, `2-GRIP PULLUP`, `CHIN-UP`, `CHINUP`, `NEUTRAL-GRIP PULLUP` | `pure` | `equipment` stays `bodyweight` |
| `BODYWEIGHT DIP`, `DIP`, `DIPS`, `PARALLEL BAR DIP` | `pure` | same |
| All ab/core canonicals (sit-ups, hanging knee raises, planks, leg raises) | `pure` | `MACHINE CRUNCH` excluded |
| `WALKING LUNGES`, `BW WALKING LUNGES` | `pure` | `DB WALKING LUNGE` etc. stay external (handled by follow-up spec) |
| `2-GRIP PULLUP (ASSISTED)` | `NULL` (unchanged) | machine-loaded; out of scope for this spec |

Migration runs on lifespan startup via the existing `_run_migrations()` pattern. Idempotent — safe to redeploy.

## Section 2 — Logger UI redesign

### Component split

Extract the per-set row JSX from `Logger.jsx` into a new `frontend/src/components/SetRow.jsx`. The current inline 90-line block becomes one of three layouts based on the exercise's `bodyweight_kind`.

### Layout 1 — External load (unchanged)

```
[#] [kg] [Reps] [RPE] [DS]
```

For all exercises with `bodyweight_kind = NULL`. No behavior change.

### Layout 2 — Pure BW

```
[#] [BW: 80 (auto)] [Reps] [RPE]
```

- BW field is read-only, muted styling, displays the user's current bodyweight.
- No DS button (drop-set on a pushup is meaningless).
- BW pulled from `useApp().userBodyweightKg` (new context selector, sourced from `User.bodyweight_kg` already in the user object).

### Layout 3 — Weighted-capable

```
[#] [BW: 80 (auto)] [Added kg] [Reps] [RPE] [DS]
                Total: 105 kg              ← inline below, muted
```

- BW read-only, Added editable, Total computed and displayed below the row.
- DS button stays — you can drop a plate from a weighted pullup mid-set.

### "Set BW" inline prompt

When the user has no recorded bodyweight (`User.bodyweight_kg` is null and the latest `BodyMetric.bodyweight_kg` is null):

- In each `<SetRow>` for a `bodyweight_kind != null` exercise, the BW chip slot is replaced by a `[ Set BW ]` button (accent-bordered, dashed, ~80 px wide). Same position as the BW chip would occupy — Layout 2 / Layout 3 grid columns are unchanged.
- Tap reveals an inline numeric input + Save icon (replaces the button in-place; row does not reflow).
- Submit calls `POST /api/body-metrics` with today's date.
- On success, `useApp()` user-state refresh updates the chip to `BW: 80 (auto)`. The first row's submission updates user state; all sibling rows re-render with the BW chip on the next React tick. The user only fills it once per workout.
- No modal, no nav, no blocking screen.

### Catalog flag plumbing

`getExerciseCatalog()` already returns the catalog; just add `bodyweight_kind` to the response shape. Already cached in `useLoggerSession`'s `catalogData` state. New helper:

```javascript
function getBodyweightKind(exerciseName, catalog) { ... }   // mirrors getWeightHint
```

### Save payload changes

`logBulkSession` payload per set, now sends both fields:

| Layout | `load_kg` | `added_load_kg` |
|---|---|---|
| External | entered_kg | null |
| Pure BW | userBodyweightKg | 0 |
| Weighted-capable | userBodyweightKg + entered_added_kg | entered_added_kg |

The frontend snapshots BW into `load_kg` at save time. Subsequent BW changes do not retroactively rewrite historical logs — the BW current at log time is preserved. The DB does not need to look up `User.bodyweight_kg` at rank-compute time for these logs; `load_kg` already includes it.

### Frontend validation guardrails

- Pure-BW set with `reps_completed > 0` but BW chip still shows "Set BW": save button disabled with toast `"Set your bodyweight to log bodyweight exercises."` Tap-target highlights the chip.
- Weighted-capable set: `added_kg ≥ 0` (negative makes no sense in this UI). Sanity warning toast above 100 kg added: `"Are you sure you added X kg?"` — non-blocking, intercepts the next Aragorn-class slip.

## Section 3 — Rank engine + PR detector adjustments

Approach A makes `load_kg` always equal effective load, so most consumers need **no logic changes** — they read `load_kg` and divide by bodyweight as today, automatically getting correct effective ratios. Three targeted edits make the new model coherent.

### Edit 1 — `_best_weighted_calisthenic` reads `added_load_kg` directly

In `rank_engine.py`, the function that bit Aragorn. The query at line 244 needs `WorkoutLog.added_load_kg` added to the select. The weighted branch becomes:

```python
if name in weighted:
    # Read added_load_kg directly. Falls back to (load_kg - bw_at_log) for legacy
    # rows the migration didn't catch, with a 0-floor.
    added_kg = added_load_kg if added_load_kg is not None else max(0.0, load_kg - bw_kg)
    if added_kg <= 0 and reps > 0:
        # Treated as bodyweight pullup — falls into the bodyweight-rep branch instead
        ...
    else:
        e1rm_added = _epley_e1rm(added_kg, reps)
        ratio = (e1rm_added / bw_kg) * size_bonus(bw_kg)   # see Edit 3
```

### Edit 2 — Sanity guard against another Aragorn slip-through

Add to `muscle_rank_config.py`:

```python
MAX_ADDED_RATIO_FOR_BACK_ARMS = 2.0   # added_load / BW > 2.0 is implausible for pullup/dip
```

In `_best_weighted_calisthenic`, drop any candidate with `ratio > MAX_ADDED_RATIO_FOR_BACK_ARMS` (silent — they can re-log if real). The existing `MAX_RATIO_CAP = 5.0` is too generous for added-load lifts.

### Note on the BW denominator

The rank engine continues to use the user's *current* bodyweight (resolved by `_resolve_bodyweight`) as the ratio denominator. The numerator (`load_kg`) is the historical effective load snapshotted at log time. This matches today's behavior for barbell lifts (your bench-1RM ratio shifts as you gain or lose weight) and avoids the complexity of historical-BW lookups in the hot path. Acceptable trade-off; users who change weight materially will see ratios shift in the expected direction.

### Edit 3 — Size-bonus multiplier (interim fairness correction)

Add to `muscle_rank_config.py`:

```python
SIZE_BONUS_REFERENCE_KG = 80.0

def size_bonus(bw_kg: float) -> float:
    """Heavier athletes get partial credit for moving more absolute mass on
    bodyweight-class lifts. Reference weight is 80 kg (multiplier = 1.0). A
    100 kg athlete gets ~12% boost, a 60 kg athlete a ~13% reduction.

    Interim correction. Phase 2 (see Future Work) replaces this with DOTS.
    Applied to back and arms ONLY — chest/quads/hams/shoulders use the
    standard ratio model (calibrated against barbell strength standards).
    """
    return (max(bw_kg, 1.0) / SIZE_BONUS_REFERENCE_KG) ** 0.5
```

Apply in `_best_weighted_calisthenic`:
- Multiply the weighted-ratio by `size_bonus(bw_kg)` (shown in Edit 1).
- Multiply rep count by `size_bonus(bw_kg)` in the bodyweight rep-fallback branch (line ~292): `effective_reps = reps * size_bonus(bw_kg)`, then `rank_from_reps(int(effective_reps), ...)`.
- Also apply to the row/pulldown compound pathway (`compound_map` branch) — those contribute to the back rank too.

**Arms hybrid interaction:** the size bonus is applied at the back-pathway computation only. Because `back_elo` is fed into the arms biceps blend (`HYBRID_WEIGHTS["arms"]["biceps_pull"]`), the bonus naturally propagates into the arms rank — no separate multiplication at the arms level. The direct-tricep pathway (weighted dips, close-grip bench, tricep compound) does receive the multiplier directly inside `_best_weighted_calisthenic` for arms. Curl, tricep-isolation, and lateral-isolation pathways are NOT multiplied — they're discounted-DB / cable / machine work where mass scaling is a weaker signal.

Barbell groups (chest/quads/hams/shoulders-press) untouched.

### PR detector (`routers/logging.py:341-378`) — no change

Today's PR detector computes `e1rm = load_kg * (1 + reps / 30)`. Under the new model, that's effective load — which is exactly what we want for PR display ("New PR: 105 kg pullup"). The previous-best comparison joins across all logs of that canonical name, including pre-migration ones. The migration backfill (Section 4) ensures historical `load_kg` is consistent. A unit test asserts this.

### Medal engine — no change

`check_strength_medals` only fires for `is_true_1rm_attempt=True` lifts in `{bench, squat, deadlift, ohp}` — none bodyweight-class. `check_consistency_medals` doesn't read `load_kg`.

### Analytics — no logic change, mild numeric impact

DOTS, volume, tonnage, e1RM charts all read `load_kg` and get more accurate numbers automatically. Pre-migration pushup logs were `load_kg = 0`; the Section 4 migration backfills these to `bw_at_log_time`. Volume charts will retroactively show more tonnage for users who logged BW work. Worth a release note ("we're now counting your bodyweight pushup tonnage") but not user-blocking.

## Section 4 — Migration / data audit

Runs once on next backend deploy via a new entry in `_run_migrations()` in `main.py`, gated by a feature flag row in a new `migration_log` table so it cannot double-execute.

### Phase 4a — Schema

Idempotent ALTER TABLEs (same pattern as existing migrations):

1. `WorkoutLog.added_load_kg FLOAT NULL`
2. `ExerciseCatalog.bodyweight_kind VARCHAR(32) NULL`
3. New table `bw_migration_audit`:
   ```
   (id, log_id, user_id, exercise_name,
    old_load_kg, new_load_kg, new_added_load_kg,
    reason, created_at)
   ```
   One row per touched WorkoutLog. Lets you eyeball what changed and roll back per-user if anything looks off.
4. New table `migration_log`:
   ```
   (name PRIMARY KEY, ran_at)
   ```

### Phase 4b — Catalog backfill

Section 1 catalog updates — pure SQL UPDATEs by canonical name. Sets `bodyweight_kind` for ~25 canonicals.

### Phase 4c — Per-log backfill

For each `WorkoutLog` whose canonical name has `bodyweight_kind IS NOT NULL`:

```
Resolve user_bw_at_log_date:
  Take latest BodyMetric.bodyweight_kg for this user with date <= log.date.
  If none, fall back to user.bodyweight_kg.
  If still none, mark log with reason = "no_bw_skipped" and DO NOT touch its load_kg.
  These logs will not contribute to ranks until the user backfills bodyweight.

For "pure" exercises (pushup, ab work, BW pullup):
  if old load_kg <= 0:
      set added_load_kg = 0
      set load_kg = user_bw_at_log_date     (was usually 0 before)
      reason = "pure_bw_backfilled"
  else:
      # Pre-existing nonzero load on a "pure" exercise — likely a vested
      # pushup or weighted plank logged into the wrong canonical. Don't
      # silently overwrite. Flag for manual review and leave the row alone.
      reason = "pure_with_nonzero_load_skipped"
      (load_kg / added_load_kg unchanged)

For "weighted_capable" exercises (WEIGHTED PULLUP, WEIGHTED DIP, etc.):
  if old load_kg <= 0:                                    # bodyweight-only attempt
      added_load_kg = 0
      load_kg = user_bw_at_log_date
      reason = "weighted_capable_zero_load"

  elif 0.85 * user_bw <= old load_kg <= 1.15 * user_bw:   # Aragorn's bug: entered own BW
      added_load_kg = 0
      load_kg = user_bw_at_log_date
      reason = "aragorn_correction"

  else:                                                   # genuine added load
      added_load_kg = old load_kg
      load_kg = user_bw_at_log_date + old load_kg
      reason = "weighted_capable_added_promoted"
```

Every change inserts a row into `bw_migration_audit`. Phase 4c is wrapped in a single transaction per user — partial runs cannot leave half-corrected data.

### Phase 4d — Recompute ranks

Call `rank_engine.recompute_all(db)`. Aragorn drops back to his actual back rank (likely Copper or Bronze). hackesmit's back rank is recomputed against clean data. Any other silent victims are corrected.

### Phase 4e — Logging

On startup, after migration completes, emit one log line:

```
BW migration: touched N logs across M users. Audit table: bw_migration_audit.
  Aragorn corrections: X. Pure-BW backfills: Y. No-BW-skipped: Z.
```

Visible in `flyctl logs` after deploy.

### Rollback

A new admin endpoint `POST /api/admin/bw-migration-rollback` reads `bw_migration_audit` and reverts every touched WorkoutLog to its `old_load_kg` (and nulls `added_load_kg`). Safety net for the first 30 days. The audit table can be dropped later.

### Known limitations

- **Late-BW backfill.** A user who has no recorded bodyweight at migration time gets their bodyweight-class logs flagged `no_bw_skipped` — those rows stay `load_kg = 0` and don't contribute to ranks. If the user later sets their bodyweight, the migration does not retroactively re-process. Mitigation: a follow-up admin endpoint `POST /api/admin/bw-migration-rerun-for-user/{user_id}` re-runs Phase 4c for one user (idempotent because the audit table records what's been touched). Spec'd here, implemented as part of this PR.
- **Pre-existing pure-with-load rows are not auto-corrected.** Flagged for human review via `bw_migration_audit.reason = "pure_with_nonzero_load_skipped"`. Expected to be a tiny number of rows; manual fix preferred over a guessing heuristic.

### False-positive risk for the Aragorn rule

A genuine 60 kg lifter doing a 60 kg added pullup (ratio 1.0, Diamond) would be misclassified as bodyweight-only and dropped to Bronze. Mitigation: spot-check after deploy with

```sql
SELECT user_id, exercise_name, old_load_kg, new_load_kg
FROM bw_migration_audit WHERE reason = 'aragorn_correction';
```

Revert any false positives via the rollback endpoint.

## Section 5 — Restore-unsaved-workout fixes

Diagnosed seven bugs in the current `Logger.jsx` + `useLoggerSession.js` localStorage flow. Fix is one cohesive rewrite, not seven scattered patches.

### Bugs found

1. **Bodyweight reps-only sets never persist.** `Logger.jsx:184` checks `s.load_kg && +s.load_kg > 0` only. A pushup workout (load=0, reps=15) never hits localStorage. **This becomes the most common case once the Section 2 BW UI ships**, so fixing it is a hard prerequisite.
2. **`pendingRestore` not cleared on session/week switch.** `setSelectedSession` and `changeWeek` don't reset it. Tap Session A → "Restore?" banner → tap Session B → banner stays → tap Restore → Session A's sets injected into Session B's UI.
3. **No expiration on stored entries.** A half-finished Week 3 Session B from October still prompts in April with stale data. Programs change; the data is usually wrong by then.
4. **Restore button doesn't clear the localStorage key.** Works only because the auto-save effect immediately writes back over it. Accidentally correct rather than designed.
5. **`saved=true` blocks all subsequent localStorage writes.** Edits-after-save are lost on tab close.
6. **Orphaned keys after program delete/re-import.** Program ID changes; old keys persist forever. Disk junk.
7. **`overload` reload re-triggers restore check.** Init effect runs on `[selectedSession, overload]`. After exercise swap, overload reloads, restore check re-runs, may override a user mid-decision.

### The fix

Extract restore into a new hook `frontend/src/hooks/useWorkoutDraft.js`:

```javascript
useWorkoutDraft({ programId, week, sessionName, sets, saved })
  → returns { pendingRestore, acceptRestore, discardRestore }
```

Behaviors:

- **Persistence trigger:** writes when *any* set has `(load_kg > 0) OR (reps_completed > 0)`. Catches BW reps-only.
- **Storage shape:** `{ savedAt: ISO_timestamp, sets: [...] }` — wrapped with metadata.
- **Expiration:** on read, if `savedAt > 14 days ago`, treat as missing and auto-clean the key.
- **Session/week change:** the hook watches `[programId, week, sessionName]` — when they change, it clears `pendingRestore` immediately and re-reads localStorage for the new key.
- **Editing after save:** when `saved=true`, persistence is disabled (correct — server has the data). When the user edits, the existing edit handler resets `saved=false`, hook resumes persisting. Edits-after-save no longer lost.
- **`acceptRestore()` / `discardRestore()`:** both delete the localStorage key explicitly. Restore = "I'm taking this data, key has done its job"; Discard = "delete this data permanently."
- **Orphaned-key sweep:** on hook mount, scan all `gym-pending-*` keys; remove any whose `savedAt > 14 days old` OR whose `programId` doesn't appear in `useApp().programs`. Cheap (localStorage typically has < 50 keys). Runs once per page load.
- **Overload reload doesn't re-trigger restore:** the hook's restore check is keyed on `[programId, week, sessionName]`, not on `overload`. Swap exercises → overload reloads → hook ignores. `pendingRestore` state preserved if the user is mid-decision.

### What stays the same

- The UI banner ("Unsaved workout found. Restore?") keeps the same look and the same two buttons. Just talks to the hook instead of inline state.
- Logger's existing `setSets(pendingRestore.sets)` flow on Restore tap is unchanged.

### Net code change

- **New file:** `frontend/src/hooks/useWorkoutDraft.js` (~100 lines)
- **`Logger.jsx`:** removes ~30 lines of inline localStorage logic, adds ~5 lines wiring the hook
- **`useLoggerSession.js`:** drops `pendingRestore`/`setPendingRestore` from its return (the hook owns them now)
- **Tests:** see Section 6

## Section 6 — Testing strategy

### Backend (pytest)

**`backend/tests/test_bw_migration.py`** (new, ~8 tests):

- Fixture: 4 synthetic users — Aragorn (155 lb in WEIGHTED PULLUP, BW 70 kg), Legolas (legitimate +25 kg weighted pullup, BW 70 kg), Gimli (BW pushup logs with load=0, BW 90 kg), Saruman (no recorded BW).
- End-to-end migration on an in-memory SQLite snapshot.
- Assertions: Aragorn's logs flagged `aragorn_correction`, `load_kg` rewritten to BW, `added_load_kg=0`. Back rank drops out of Champion.
- Legolas: `weighted_capable_added_promoted`, `load_kg=95`, `added_load_kg=25`. Rank unchanged.
- Gimli: pushup logs `pure_bw_backfilled`, `load_kg=90`, `added_load_kg=0`.
- Saruman: `no_bw_skipped`, untouched.
- `bw_migration_audit` has one row per touched log.
- Idempotency: running migration twice doesn't double-mutate.
- Rollback endpoint reverts every touched log to `old_load_kg`.

**`backend/tests/test_ranks.py`** (extend, ~4 new tests):

- `size_bonus(80) == 1.0`, `size_bonus(100) ≈ 1.118`, `size_bonus(60) ≈ 0.866`.
- Heavy lifter (100 kg) and light lifter (60 kg) both doing 30 BW pullups → heavy lands Champion, light lands Diamond.
- `MAX_ADDED_RATIO_FOR_BACK_ARMS = 2.0` guard: log with `added_load_kg = 3 × BW` is dropped silently.
- New `_best_weighted_calisthenic` reads `added_load_kg` directly from the WorkoutLog.

**`backend/tests/test_logging.py`** (extend, ~3 new tests):

- Bulk log endpoint accepts `added_load_kg`; round-trips through DB.
- Pure-BW set: `load_kg=80, added_load_kg=0` stored correctly.
- Backwards-compat: payload with `added_load_kg` omitted is treated as null (external load).

### Frontend (vitest)

**`frontend/src/__tests__/useWorkoutDraft.test.js`** (new, ~10 tests):

- Persists when any set has `reps_completed > 0` (the bug-1 regression case).
- Persists when any set has `load_kg > 0`.
- Does not persist when all sets are empty.
- Returns `pendingRestore` for an existing key, `null` otherwise.
- 14-day expiration: writes a key with `savedAt = 15 days ago`, asserts auto-clean and `pendingRestore = null`.
- Session/week change clears `pendingRestore` and re-reads for the new key.
- `acceptRestore()` and `discardRestore()` both remove the localStorage key.
- Orphaned-key sweep removes a `gym-pending-99-1-A` key whose program isn't in `useApp().programs`.
- `saved=true` disables persistence; `saved=false` re-enables.

**`frontend/src/__tests__/SetRow.test.jsx`** (new, ~6 tests):

- Renders external-load layout when `bodyweight_kind = null`.
- Renders pure-BW layout when `bodyweight_kind === "pure"`: BW field read-only with user's BW; no Added field; no DS button.
- Renders weighted-capable layout when `bodyweight_kind === "weighted_capable"`: BW read-only, Added editable, Total computed.
- "Set BW" inline prompt appears when user has no recorded bodyweight; tapping reveals input; submitting calls `POST /api/body-metrics`.
- Pre-save validation: pushup with reps but no BW → save button disabled with toast.
- Sanity warning toast fires for `added_kg > 100`.

### Manual smoke (after deploy, documented in spec)

- Fresh user, no BW set. Log a pushup → "Set BW" prompt appears → enter 80 → set persists with effective load 80.
- Aragorn after migration → back rank not Champion. Spot-check `bw_migration_audit` for his rows.
- Real weighted pullup (+20 kg added at BW 80) → effective 100 displays as Total, ranks update to expected tier.
- Force-quit browser mid-pushup workout → reopen 10 min later → restore prompt appears with BW reps preserved.
- Switch sessions while a restore prompt is up → prompt disappears and re-evaluates for the new session's key.

### Out of scope

- DOTS scoring (Phase 2 spec).
- Equipment selector for walking lunges (follow-up spec).
- The pre-existing failure `test_log_bulk_relog_replaces` flagged in CLAUDE.md — unrelated, out of scope.

## Future work (Phase 2)

**DOTS-based rank rewrite** — adopt the IPF DOTS formula as the universal scoring function across all muscle groups. Replaces the current ratio-based threshold tables with a single DOTS-score table. Validated against competitive powerlifting data; theoretically fair across body sizes.

Phase 2 simplifying assumptions agreed for this app:
- All users assumed male — use male DOTS coefficients only. No sex-detection prompt needed.
- Phase 2 will recalibrate threshold tables against current user-base distribution before deploy.
- Phase 2 should also revisit the rep-count fallback, the close-grip-bench arms proxy, and the curl/lateral isolation thresholds together — all of which are second-order to the primary scoring function.
- Phase 2 supersedes the size-bonus multiplier from this spec; the multiplier is interim only.

**Equipment selector spec** — separate brainstorm for variable-gear exercises (walking lunge with DB / BB / sandbag / vest). Per-set or per-program-exercise gear choice; historical tracking; how it interacts with the existing `DB WALKING LUNGE` vs `WALKING LUNGES` catalog split.

## Files touched (summary)

### Backend

- `backend/app/models.py` — add `WorkoutLog.added_load_kg`, `ExerciseCatalog.bodyweight_kind`, new tables `bw_migration_audit` and `migration_log`.
- `backend/app/main.py` — add migration entry in `_run_migrations()`.
- `backend/app/seed_catalog.py` — set `bodyweight_kind` on affected canonicals.
- `backend/app/muscle_rank_config.py` — add `MAX_ADDED_RATIO_FOR_BACK_ARMS`, `SIZE_BONUS_REFERENCE_KG`, `size_bonus()`.
- `backend/app/rank_engine.py` — read `added_load_kg`, apply size bonus, apply guard.
- `backend/app/routers/logging.py` — accept `added_load_kg` in bulk log payload.
- `backend/app/routers/auth.py` — add `POST /api/admin/bw-migration-rollback` (admin-gated).
- New: `backend/app/bw_migration.py` — Phase 4c logic, called from `_run_migrations()`.

### Frontend

- New: `frontend/src/components/SetRow.jsx`.
- New: `frontend/src/hooks/useWorkoutDraft.js`.
- New: `frontend/src/components/SetBwPrompt.jsx` (the inline "Set BW" affordance).
- `frontend/src/pages/Logger.jsx` — extract per-set row, wire `useWorkoutDraft`, drop inline localStorage logic.
- `frontend/src/hooks/useLoggerSession.js` — drop `pendingRestore` ownership.
- `frontend/src/api/client.js` — extend `logBulkSession` payload shape; add `setBodyMetric` shorthand if not already exposed.
- `frontend/src/context/AppContext.jsx` — expose `userBodyweightKg` selector + a `refreshUser` callback after BW set.

### Tests

- `backend/tests/test_bw_migration.py` (new)
- `backend/tests/test_ranks.py` (extend)
- `backend/tests/test_logging.py` (extend)
- `frontend/src/__tests__/useWorkoutDraft.test.js` (new)
- `frontend/src/__tests__/SetRow.test.jsx` (new)

### Docs

- `CLAUDE.md` — update WorkoutLog notable-columns entry; add `bodyweight_kind` to catalog notes; document the `load_kg = effective load` semantic shift.
- `docs/known-bugs.md` — close out the seven restore-unsaved-workout entries.
