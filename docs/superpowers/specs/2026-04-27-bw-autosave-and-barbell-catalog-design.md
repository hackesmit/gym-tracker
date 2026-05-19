# BW Autosave + Barbell Catalog Backfill

**Date:** 2026-04-27
**Status:** Draft — pending user review

## Problem

Two reported bugs (one frontend, one backend) that share no root cause but are both small, surgical fixes.

### Bug 1: "Set your bodyweight" toast despite typing BW

**User report:** "When logging pullups I add my bodyweight on the marked section, select save. But when I go to finish workout It says I need to log a BW, which I did."

**Root cause:** `frontend/src/components/SetBwPrompt.jsx` is a self-contained mini-form embedded in every bodyweight-class set row. It owns its own `value` state and the *only* path that POSTs to `/api/body-metrics` is the tiny floppy-disk Save icon next to the input. When the user clicks the bottom-of-page **Finish session** button, `Logger.jsx` checks `user.bodyweight_kg` from auth state — which is still `null` because the inline value was never persisted (`Logger.jsx:213-222`).

Even if we add `onBlur` autosave, a fast user who types BW and immediately taps Finish session hits a race: blur fires the BW POST, but Logger's `handleSave` runs concurrently and sees the still-null `user.bodyweight_kg`, firing the toast. They'd have to tap Finish session twice. To fully eliminate that, Logger needs to *await* the inline BW save before evaluating.

### Bug 2: Barbell squats (and friends) missing from exercise picker

**User report:** "Need to add barbell squats, I couldn't find them on the exercise list."

**Root cause:** `backend/app/seed_catalog.py` only seeds Hack/Machine/Smith/Goblet squat variants. The rank engine (`muscle_rank_config.py:168-172`) and strength standards engine (`analytics/strength.py:65-69`) reference the foundational barbell lifts but **none of them are seeded into the catalog table**, so they don't appear in the swap modal or custom program builder. The same gap exists for bench, deadlift, OHP, and row — squats are just the first one the user noticed.

## Approach

### Fix 1: BW autosave + main-save flush (frontend)

Three layered changes in `frontend/src`:

1. **`components/SetBwPrompt.jsx`** — make typing self-saving:
   - Add `onKeyDown` on the input: Enter → `handleSave()` (with `e.preventDefault()`)
   - Add `onBlur` on the input: `handleSave()`
   - Add `if (saving) return` guard at the top of `handleSave` to make it idempotent (Enter + Blur or Click + Blur could otherwise double-fire)
   - Add new optional prop `onValueChange?: (str) => void` that fires whenever `value` changes locally; this lets the parent observe the unsaved draft without taking ownership of state

2. **`pages/Logger.jsx`** — race-proof the main session save:
   - Add `const [inlineBwDraft, setInlineBwDraft] = useState('')` (display-units string)
   - Pass `onBwValueChange={setInlineBwDraft}` down through `SetRow` → `BwChip` → `SetBwPrompt`
   - In `handleSave`, before evaluating `needsBwButMissing`:
     ```jsx
     let effectiveBwKg = userBodyweightKg;
     if (!effectiveBwKg && inlineBwDraft) {
       const num = parseFloat(inlineBwDraft);
       if (num > 0) {
         await handleSetBw(num);  // POSTs + refreshUser
         effectiveBwKg = displayToKg(num, units);
         setInlineBwDraft('');
       }
     }
     ```
   - Use `effectiveBwKg` (not `userBodyweightKg`) in both the `needsBwButMissing` check AND in the payload-build branches that read `userBodyweightKg ?? 0`. (Avoids a stale-closure read since `refreshUser` updates context state asynchronously after `handleSave` has already captured `userBodyweightKg`.)

3. **`components/SetRow.jsx`** — prop drill the new callback through `PureBwLayout`, `WeightedCapableLayout`, and `BwChip` so `SetBwPrompt` receives `onValueChange`.

**Tests:**
- Extend `components/__tests__/SetBwPrompt.test.jsx`:
  - Enter triggers `onSubmit`
  - Blur triggers `onSubmit` when value > 0
  - Enter / Blur do not fire `onSubmit` when value is empty (already covered for click — extend pattern)
  - `onValueChange` fires as the user types
- No new Logger.jsx test required — manually verify the flush-before-save flow in dev.

### Fix 2: Backbill missing barbell entries (backend)

Single-file edit to `backend/app/seed_catalog.py`. The existing `seed_exercise_catalog` is idempotent — it skips canonical names already present, so re-deploys won't duplicate. New rows below land in their respective muscle-group sections following existing structure (canonical_name, muscle_group_primary, muscle_groups_secondary, movement_pattern, equipment, is_compound, is_unilateral, difficulty_level — no `bodyweight_kind`).

**Chest section (insert before existing DB variants):**
- BARBELL BENCH PRESS (chest, [triceps, shoulders], horizontal push, barbell)
- BENCH PRESS (alias of above — same metadata)
- PAUSED BENCH PRESS
- CLOSE-GRIP BENCH PRESS (chest, [triceps], horizontal push, barbell) — note: muscle_rank_config also catalogues this for the arms compound-tricep pathway, so the primary-vs-secondary tagging here matters; keeping primary=chest mirrors INCLINE BARBELL PRESS conventions
- INCLINE BARBELL PRESS (chest, [triceps, shoulders], horizontal push, barbell)
- INCLINE BARBELL BENCH PRESS (alias)

**Back section (insert near existing rows):**
- BARBELL ROW (back, [biceps, shoulders], horizontal pull, barbell)
- BENT-OVER BARBELL ROW (alias)

**Quads section (insert at top, before HACK SQUAT):**
- BARBELL BACK SQUAT (quads, [glutes, hamstrings], squat, barbell)
- BACK SQUAT (alias)
- PAUSED BACK SQUAT
- FRONT SQUAT (quads, [glutes, core], squat, barbell)
- SAFETY BAR SQUAT (quads, [glutes, hamstrings], squat, barbell)

**Hamstrings section (insert before ROMANIAN DEADLIFT):**
- CONVENTIONAL DEADLIFT (hamstrings, [back, glutes], hinge, barbell, is_compound=True)
- DEADLIFT (alias)
- SUMO DEADLIFT (hamstrings, [glutes, quads], hinge, barbell)
- TRAP BAR DEADLIFT (hamstrings, [glutes, quads], hinge, barbell)
- PAUSED DEADLIFT (alias of CONVENTIONAL)

**Shoulders section (insert near existing DB shoulder press):**
- OVERHEAD PRESS (shoulders, [triceps, core], vertical push, barbell)
- STRICT PRESS (alias)
- BARBELL OVERHEAD PRESS (alias)
- STANDING BARBELL OHP (alias)
- SEATED BARBELL OHP (shoulders, [triceps], vertical push, barbell)
- MILITARY PRESS (alias)

**Total:** 24 new canonical rows (chest 6 + back 2 + quads 5 + hamstrings 5 + shoulders 6). All `is_unilateral=False`, mostly `difficulty_level="intermediate"` (matches existing convention for free-barbell compounds).

**Tests:**
- Add to `backend/tests/test_catalog_bodyweight_kind.py` (or create `test_catalog_completeness.py`): assert each of the 24 names is present in `EXERCISE_CATALOG` and that all `EXERCISE_MAP` keys in `muscle_rank_config.py` exist in the catalog (regression guard for future gaps).

## Deployment

- Frontend: auto-deploys on push to master (Vercel).
- Backend: requires manual `flyctl deploy --app gym-tracker-api-bold-violet-7582` from `backend/`. Catalog seeder runs on lifespan startup, idempotent.

## Out of Scope

- No change to the rank-engine `EXERCISE_MAP` specificity values.
- No change to the manual 1RM endpoint or strength medal awarding.
- No banner-style "Set BW first" UX redesign — keeping the existing inline pill, just making it foolproof.
- No catalog cleanup (deduping `LEG PRESS` vs `LEG PRESS (HEAVY)` vs `LEG PRESS(HEAVY)` typo) — out of scope for this fix.

## Risk

- **Race condition is fully closed** by awaiting `handleSetBw` in `Logger.handleSave` before evaluating BW state. Worst case: a second slower save click — but the toast won't fire spuriously.
- **Catalog deduplication risk:** the new aliases (e.g., `BENCH PRESS` vs `BARBELL BENCH PRESS`) are intentional — they match the rank engine's lookup keys, which were chosen because users type both forms. Two catalog rows with the same metadata is fine; the rank engine treats them identically.
- **Existing logged data:** unaffected. `WorkoutLog.exercise_name` is a free string; new catalog rows don't retroactively rewrite anything.
