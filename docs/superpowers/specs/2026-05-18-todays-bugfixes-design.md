# Today's Bugfixes + Dead-Code Sweep — design spec

**Date:** 2026-05-18
**Status:** Approved (user pre-approved during brainstorming)

## Goal

Ship four user-reported fixes today, on top of cleanly landing the already-in-flight `2026-04-27-bw-autosave-and-barbell-catalog` work. Then run a wide dead-code audit across every module and remove what we can prove is unused.

## Issues in scope

| # | Issue | Root cause (hypothesized) | Fix |
|---|---|---|---|
| A | Exercise swap doesn't load the new exercise's last weight | `useExerciseSwap.handleSwapSelect` does an in-place rename of sets and sets `skipSetsInit=true` — it never fetches history for the new exercise | After swap, re-init the swapped exercise's rows from the refreshed overload payload (don't skip sets-init for that exercise) |
| B | PLATE-WEIGHTED CRUNCH renders both as BW and normal; broader BW catalog audit needed | Catalog tags this row as `weighted_capable` (and a couple of other rows are ambiguous defaults) | Untag PLATE-WEIGHTED CRUNCH, WALKING LUNGES, LEG RAISES so they default to normal weighted. Add a regression test that locks each remaining BW row to its expected `bodyweight_kind` |
| C | Pullups always render as 2 sets; typing in set 1 mirrors into set 2 in real time | The 2026-05-13 HEAVY/BACK-OFF collapse made two program_exercises share the same canonical `exercise_name`. The Logger groups sets by `exercise_name`, so two PEs merge into one rendered group — collapsing what should be independent state spaces | Group exercises by `program_exercise_id` (unique per PE) instead of canonical `exercise_name`. Each PE renders its own Card with its own sets array. Side-effect-free for non-collapsed exercises |
| D | Dead-code sweep across every module | Code accreted from earlier phases (`is_bodyweight`, the Render-era Procfile, removed-but-still-imported helpers, unused i18n keys, etc.) | Phased: (1) targeted strikes I can complete this session, (2) parallel Explore agents producing a "delete this" list for every module which I review and apply. Honest about scope: Phase 2 may produce a follow-up plan rather than fully landing today |

## Sequencing

Before any of the above lands, the working tree's uncommitted edits from the `2026-04-27-bw-autosave-and-barbell-catalog` plan must be committed:

1. Inspect `git diff` for each modified file.
2. Group into logical commits matching the plan's task boundaries (BW-autosave frontend / catalog backend / supporting tests).
3. Run `pytest -q` and `npm test -- --run`. The plan claims 152 + frontend pass after its changes; verify.
4. Only then start Issue A.

The four fix commits land in the order A → B → C → D so dead-code removal sees the cleanest baseline.

---

## Issue A — swap loads stale weight

### Current behaviour

`useExerciseSwap.handleSwapSelect` (`frontend/src/hooks/useExerciseSwap.js:50-89`):
1. Calls `swapExercise(programId, oldName, newName)` (backend renames the ProgramExercise row).
2. Re-fetches the schedule.
3. **Maps the sets array in place** — renames the swapped exercise's set entries but keeps their `load_kg`, `reps_completed`, `rpe_actual`.
4. Sets `skipSetsInit.current = true` and `swapInProgress.current = true`.
5. Re-selects the same session, which triggers an overload re-fetch.
6. The post-overload `useEffect` in `useLoggerSession.js:81` sees `swapInProgress=true`, sets `skipSetsInit=true` *again*, and clears `swapInProgress`.
7. Logger's sets-init effect (`Logger.jsx:140`) sees `skipSetsInit=true` and bails — leaving the in-place-renamed sets visible.

Net: the user sees the new exercise's *name* but the old exercise's *load*.

### Fix

Don't skip sets-init wholesale; let it run and only re-init the **swapped** exercise's rows. The simplest way:

1. In `handleSwapSelect`, after the swap completes, drop the `skipSetsInit` and `swapInProgress` short-circuit.
2. Let the schedule + overload refresh complete naturally. Sets-init re-runs, and for the swapped PE it pulls `overload.exercises[newName].per_set_data` for autofill, just like a fresh session.

Trade-off: any unsaved user input on **other** exercises in the same session would be lost if sets-init runs. Mitigation: sets-init iterates the session's exercise list — only the swapped PE has a new `id`/`exercise_name`. For unchanged PEs, sets-init produces identical output to what's already there, so re-running is idempotent for them. We can also confirm this with a targeted test.

### Files

- `frontend/src/hooks/useExerciseSwap.js` — remove the `skipSetsInit.current = true` + `swapInProgress.current = true` writes, and the in-place sets rename block (lines ~60-77). Keep the `setSets(prev => prev.filter(...))` only if needed to drop the swapped-out PE's rows quickly so React doesn't briefly render a stale row.
- `frontend/src/hooks/useLoggerSession.js` — remove the now-unused `swapInProgress` and `skipSetsInit` refs and the post-overload short-circuit (lines 81-97 still need the overload fetch — only the conditional skipSetsInit-write goes).
- `frontend/src/pages/Logger.jsx` — remove the `if (skipSetsInit.current) { ... return; }` guard at the top of the sets-init effect (line 141-144). Remove `skipSetsInit` / `swapInProgress` from the hook return destructure.
- Test: `frontend/src/hooks/__tests__/useExerciseSwap.test.js` (or extend existing) — assert that after `handleSwapSelect`, the new PE's overload-derived `load_kg` ends up in the sets array, not the old exercise's load.

---

## Issue B — BW catalog retag + regression test

### Changes to `backend/app/seed_catalog.py`

Untag the following rows (remove the `"bodyweight_kind": ...` line; they fall back to the normal weighted layout in the Logger):

- `PLATE-WEIGHTED CRUNCH` (line 1321)
- `WALKING LUNGES` (line 841) — `BW WALKING LUNGES` stays `pure`
- `LEG RAISES` (line 1299) — `HANGING LEG RAISE` stays `pure`

`backfill_catalog_bodyweight_kind` already runs on startup and rewrites `ExerciseCatalog.bodyweight_kind` to match the seed value (line 1377). So untagging in-seed propagates to the live DB on next backend boot — no migration needed.

### One-shot data fix

Existing `WorkoutLog` rows for these three exercises may have `added_load_kg` set under the old `weighted_capable` semantics (PLATE-WEIGHTED CRUNCH only — the other two were `pure` so had `added_load_kg=0`). After untagging, plate-only `added_load_kg` no longer makes sense; the row should be a normal external lift with `load_kg = plate` and `added_load_kg = NULL`.

Add a one-shot migration in `backend/app/main.py` lifespan, keyed in `migration_log` as `untag_bw_2026_05` (idempotent, same pattern as `bw_input_2026_04`):

For workout logs whose `program_exercise.exercise_name_canonical` is in {`PLATE-WEIGHTED CRUNCH`, `WALKING LUNGES`, `LEG RAISES`} **and** `added_load_kg IS NOT NULL`:
- If `added_load_kg > 0`: set `load_kg = added_load_kg`, `added_load_kg = NULL`.
- If `added_load_kg = 0` (pure attempts under old semantics): set `load_kg = 0`, `added_load_kg = NULL`.

Audit row inserted into a new `untag_bw_audit` table (mirror the `bw_migration_audit` shape: log_id, before_load_kg, before_added_load_kg, after_load_kg, reason).

### Regression test

`backend/tests/test_catalog_bodyweight_kind.py` already exists. Add a test that locks every currently-tagged row to its expected value:

```python
EXPECTED_BODYWEIGHT_KIND = {
    "WEIGHTED DIP": "weighted_capable",
    "DIP": "pure",
    "DIPS": "pure",
    "BODYWEIGHT DIP": "pure",
    "PULLUP": "pure",
    "WEIGHTED PULLUP": "weighted_capable",
    "2-GRIP PULLUP": "pure",
    "BW WALKING LUNGES": "pure",
    "HANGING LEG RAISE": "pure",
    "ROMAN CHAIR CRUNCH": "pure",
    "TWO-ARMS TWO-LEGS DEAD BUG": "pure",
}

def test_bw_classification_locked():
    from app.seed_catalog import EXERCISE_CATALOG
    by_name = {e["canonical_name"]: e for e in EXERCISE_CATALOG}
    for name, kind in EXPECTED_BODYWEIGHT_KIND.items():
        assert by_name[name].get("bodyweight_kind") == kind, (
            f"{name} expected bodyweight_kind={kind!r}, "
            f"got {by_name[name].get('bodyweight_kind')!r}"
        )

def test_untagged_lifts_are_not_bw():
    from app.seed_catalog import EXERCISE_CATALOG
    by_name = {e["canonical_name"]: e for e in EXERCISE_CATALOG}
    for name in ["PLATE-WEIGHTED CRUNCH", "WALKING LUNGES", "LEG RAISES"]:
        assert by_name[name].get("bodyweight_kind") is None, (
            f"{name} must NOT be tagged as BW (user-flagged as ambiguous)"
        )
```

### CLAUDE.md update

The "BW input migration" and "Plate-only display semantics" sections describe the existing migration. Add a paragraph documenting the `untag_bw_2026_05` migration and the new locked-classification test.

---

## Issue C — pullup merged-group state leak

### Root cause (hypothesized; verify during fix)

After the 2026-05-13 HEAVY/BACK-OFF collapse (commit `cb7f056`), two `ProgramExercise` rows that used to have distinct canonical names (e.g. `PULLUP (HEAVY)` + `PULLUP (BACK OFF)`) now both carry `exercise_name_canonical = "PULLUP"`. The Logger's grouping pass groups consecutive sets by `s.exercise_name` (`Logger.jsx:379-393`), so both PEs collapse into one rendered group. The user sees "PULLUP with 2 sets" instead of two distinct cards.

The "real-time mirror" symptom is real and needs reproduction during the fix. Code-walk doesn't pin the mechanism precisely (each set still has a unique global `idx` and `updateSet` only writes one entry — and `PureBwLayout`, used by pullups, has no explicit input id so the duplicate-DOM-id theory does *not* apply to the reps input). Most plausible contributors once two PEs share a group:
- React reconciliation reuses sibling input nodes across renders because the outer Card has the same `key={group.name}` (same canonical name) every render — the Card's identity blurs and React may swap children between PE-A's set and PE-B's set during a re-render triggered by typing.
- The shared per-set autofill (both PEs hit the same `overload.exercises[exName]`) means both rows start with identical state, masking the leak; the mirror only becomes visible after one diverges, which is exactly what the user reports.

### Fix

Group by `program_exercise_id`, not `exercise_name`. Each PE renders its own Card; canonical name shown as title, raw name still parsed for the HEAVY/BACK OFF marker (the existing intensity-marker code keeps working unchanged).

Specifically in `Logger.jsx:379-393`:

```jsx
// Was:
sets.forEach((s, idx) => {
  if (s.exercise_name !== currentEx) {
    exerciseGroups.push({ name: s.exercise_name, raw_name: ..., sets: [], ... });
    currentEx = s.exercise_name;
  }
  exerciseGroups[exerciseGroups.length - 1].sets.push({ ...s, idx });
});

// Becomes:
let currentPeId = null;
sets.forEach((s, idx) => {
  if (s.program_exercise_id !== currentPeId) {
    exerciseGroups.push({
      pe_id: s.program_exercise_id,   // NEW — used as React key
      name: s.exercise_name,
      raw_name: s.exercise_name_raw || s.exercise_name,
      sets: [],
      is_superset: s.is_superset,
      superset_group: s.superset_group,
      rest_period: s.rest_period,
      warm_up_sets: s.warm_up_sets,
    });
    currentPeId = s.program_exercise_id;
  }
  exerciseGroups[exerciseGroups.length - 1].sets.push({ ...s, idx });
});
```

Then in the render, change `<Card key={group.name} ...>` to `<Card key={group.pe_id} ...>` so the two PEs are distinct React subtrees.

`addSet` already keys off `exerciseName` (canonical). After the fix it should key off `pe_id` instead — pass the group's `pe_id` to the click handler. Update `addSet(exerciseName)` → `addSet(peId)`; the loop becomes `if (prev[i].program_exercise_id === peId)`.

`openSwapModal(group.name)` stays — swap operates on canonical name.

### Files

- `frontend/src/pages/Logger.jsx` — grouping loop, `addSet` signature, Card `key`, `addSet` call site.

### Test

Add a Vitest case in `frontend/src/pages/__tests__/Logger.test.jsx` (create if needed; otherwise extend an existing hook test) that builds a sets array with two PEs sharing `exercise_name="PULLUP"` and asserts that `updateSet` on idx 0 leaves idx 1 unchanged, and that the rendered output contains two distinct Cards.

---

## Issue D — dead-code sweep

### Honest scoping

The user asked for "every module today". A literal full audit means scanning ~30 backend modules and ~50 frontend files. Realistically, I expect to land Phase 1 confidently and Phase 2 to surface a follow-up list rather than fully apply.

### Phase 1 — targeted strikes (this session)

Items I have already confirmed are dead or near-dead:

1. **`is_bodyweight` everywhere.** CLAUDE.md explicitly marks it deprecated and says the authoritative test is `added_load_kg IS NOT NULL`. References to delete:
   - `backend/app/models.py:150` — drop the column from `WorkoutLog`.
   - `backend/app/main.py:64` — drop the `_ensure_column("workout_logs", "is_bodyweight", ...)` line.
   - `backend/app/routers/logging.py:42, 58, 72, 122, 193, 291` — drop the field from `SetIn`, `SetOut`, payload builders.
   - `frontend/src/components/SessionSummary.jsx:13` — `countedSets` filter uses `s.is_bodyweight`; switch to `s.added_load_kg != null`.
   - `frontend/src/pages/Logger.jsx:187` — drop `is_bodyweight: false` from set scaffolding.
   - Adds a SQLAlchemy `DROP COLUMN` migration step (Postgres only; SQLite local dev silently no-ops since `_ensure_column` is the only place it's added). Gate on `migration_log` row `drop_is_bodyweight_2026_05`.

2. **Procfile** (`backend/Procfile`). CLAUDE.md: "Legacy Render start command (unused)". Delete the file.

3. **Render legacy URL doc reference** in CLAUDE.md is already noted as dead; leave the doc note as historical record (don't delete it, but verify no code references the URL).

4. **PlateCalculator** — already removed from Logger (`cb7f056`). Verify no other page imports it. If unreferenced, delete `frontend/src/components/PlateCalculator.jsx`.

5. **Old i18n keys.** If `logger.plateCalc*` keys exist in `i18n.js` and are no longer referenced, remove them.

### Phase 2 — wide audit via parallel agents

Dispatch one Explore agent per domain in parallel:

- Backend routers (`backend/app/routers/`)
- Backend analytics (`backend/app/analytics/`)
- Backend top-level (`backend/app/*.py`)
- Frontend pages (`frontend/src/pages/`)
- Frontend components (`frontend/src/components/`)
- Frontend hooks + utils (`frontend/src/hooks/`, `frontend/src/utils/`)
- Frontend API client (`frontend/src/api/client.js`)

Each agent's job: enumerate exported symbols, find call sites, list candidates with "no detected call site" and the file:line where they're defined. **No deletions by agents — they just report.**

I review the consolidated list, eyeball each candidate (some "unused" exports may be plugin-registered or referenced by string), and produce a delete commit. If the list is too large to confidently apply in one session, the spec for Phase 2 becomes a follow-up plan referenced from this one.

---

## Sequencing within the session

1. Commit the in-flight working-tree changes (logical split, tests green).
2. Issue A — swap weight fix + test.
3. Issue B — catalog retag + migration + locked-classification test + CLAUDE.md update.
4. Issue C — group-by-pe_id refactor + test.
5. Issue D Phase 1 — targeted dead-code strikes.
6. Issue D Phase 2 — parallel Explore agents → consolidated list → review → either apply (small) or write follow-up spec (large).
7. Final verification: `pytest -q` + `npm test -- --run` + manual Logger smoke (swap an exercise, log pullups, save).
8. Backend deploy reminder for the catalog + migration changes (`flyctl deploy --app gym-tracker-api-bold-violet-7582`).

## Out of scope

- The user-renamed Logger swap modal UX overhaul (only fixing the weight-load behaviour).
- Custom-program-builder changes.
- The wider Phase 2 dead-code list, if it turns out to need its own design+plan cycle.

## Self-review (post-write)

- **Placeholders**: none — every file/line referenced is concrete.
- **Internal consistency**: Issue C's fix (group by `pe_id`) consistent with addSet, Card key, and openSwapModal call sites. Issue B's untagged set is consistent with the regression test's `EXPECTED_BODYWEIGHT_KIND`.
- **Scope check**: Five distinct work items in one session is at the upper bound. Phase 2 dead-code may slip to a follow-up plan — called out explicitly above.
- **Ambiguity check**:
  - Issue A — clear about which refs to remove and what test asserts.
  - Issue C — explicit hypothesis about the real-time mirror; reproduction during fix is called out as required so we don't ship a theoretical fix.
  - Issue D Phase 2 — explicit about "agents report, I delete" so we don't mass-delete blindly.
