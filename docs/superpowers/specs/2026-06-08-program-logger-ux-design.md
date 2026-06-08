# Program & Logger UX Improvements — Design

**Date:** 2026-06-08
**Status:** Approved (pending implementation plan)
**Author:** Daniel (hackesmit) + Claude

## Summary

Four independent improvements to the program-management and logging experience:

1. **Program switcher + preset surfacing** — switch the active program among ones you
   already own, with presets surfaced in one place.
2. **"Add exercise" button** — add an exercise to a day's workout, either just for today
   or permanently to the program.
3. **Logger display cleanup** — show the weight unit once at the top instead of on every
   field; drop the "auto" wording on bodyweight rows.
4. **Fix the linked-swap bug** — swapping one of two same-named exercises in a day no
   longer swaps both.

These are independent and can ship in any order. Suggested sequence: #4 (bug) → #3 → #2 → #1.

---

## Background / current state

- `AppContext` loads all `programs` and selects `activeProgram` as the one with
  `status === 'active'` (falls back to the first program). Only one program is active at a
  time; importing a program auto-pauses the prior active one.
- `NippardPresetPicker.jsx` imports the 4 Nippard presets (deep-copy + activate). It is
  shown only on the Dashboard welcome panel and the Program page's no-active branch.
- The Logger (`Logger.jsx`) groups consecutive sets by `program_exercise_id` (the
  `group.pe_id`) since the 2026-05-18 grouping fix, but the **swap** action still keys off
  the exercise **name**.
- `swapExercise(programId, oldName, newName)` (`client.js:145`) → backend
  `PATCH /program/{program_id}/exercise/{old_name}` (`programs.py:439`) updates **every**
  `ProgramExercise` row whose `exercise_name_canonical == old_name`, across all weeks and
  all sibling slots in the same day. This is the root cause of the linked-swap bug.
- `SetRow.jsx` renders the unit on every weight field: `lbs` (external),
  `Added lbs` (weighted-capable), and `BW (auto, lbs)` (bodyweight). Reps/RPE are labeled
  `Reps` / `RPE`.
- `WorkoutLog.program_exercise_id` is **NOT NULL** (`models.py:155`); the bulk-log endpoint
  validates every `program_exercise_id` exists. **Every logged set must attach to a real
  `ProgramExercise` row** — there is no ad-hoc-exercise logging path.

---

## Feature 1 — Program switcher + preset surfacing

### Goal
Switch which owned program is active without re-importing, and browse/add presets from one
place. No new preset programs are added (scope: surface + switcher only).

### Backend
- New endpoint `POST /api/program/{id}/activate`:
  - Verifies the program belongs to `current_user`.
  - Sets the target program `status = "active"`.
  - Sets every other program owned by the user that is currently `active` to `paused`.
  - Idempotent: activating an already-active program is a no-op success.
  - Returns the updated program (or `{status, program_id}`).
- Reuses existing status semantics; does not touch `program_progress` or schedules.

### Frontend
- New **"My Programs"** panel on the Program page (`Program.jsx`):
  - Lists every program from `programs` (AppContext) with: name, `frequency`x/week,
    status badge (reuse `STATUS_STYLES`).
  - The active program shows an **"Active"** chip; all others show an **Activate** button.
  - Clicking **Activate** calls the new endpoint via a new `activateProgram(id)` client
    function, then `refreshPrograms()`.
- Under an **"Add a program"** heading in the same area, render the existing
  `NippardPresetPicker` so browsing presets and switching owned programs live together.
- The panel is visible regardless of whether a program is currently active (so it also
  serves the no-active branch).

### Client
- `api/client.js`: add `activateProgram = (id) => request('/program/' + id + '/activate', { method: 'POST' })`.

### Out of scope
- Adding new built-in preset programs beyond the 4 Nippard variants.
- Reordering / deleting programs (not requested).

---

## Feature 2 — "Add exercise" button (ask each time)

### Goal
Add an exercise to a day's workout from the Logger, choosing whether it's a one-off for
today or a permanent program change.

### Behavior
- An **"+ Add exercise"** button at the bottom of the day's exercise list in `Logger.jsx`
  (below the last exercise Card, above/near the sticky Save button).
- Tapping opens an exercise picker that **reuses the swap modal's catalog list** (search +
  muscle-group filter). On selection, a prompt asks:
  **"Add for today only, or permanently to the program?"**
  - **Today only** → create a `ProgramExercise` for the current week + current session only.
  - **Permanently** → create a `ProgramExercise` in every week's instance of that session.
- After creation, the Logger refetches the schedule and re-flattens the current week so the
  new exercise appears with empty set rows ready to log. Because the new set rows carry a
  real `program_exercise_id`, the existing bulk-log path works unchanged.

### Backend
- New endpoint `POST /api/program/{id}/exercise` with body:
  ```json
  { "week": 3, "session_name": "Upper A", "exercise_name": "CABLE FLY", "scope": "week" }
  ```
  - `scope: "week"` → insert one `ProgramExercise` for `(program, week, session_name)`.
  - `scope: "all_weeks"` → insert one `ProgramExercise` for each distinct week that already
    contains `session_name` in this program.
  - `exercise_order` = current max order for that `(week, session_name)` + 1 (respects the
    `UniqueConstraint(program_id, week, session_name, exercise_order)`).
  - Sets a sane default `sets` count (e.g. 3) and leaves rep/rest fields empty/default;
    `exercise_name_canonical` and `exercise_name_raw` both set to the chosen name.
  - Verifies program ownership; returns the created row(s).
- Client: `addProgramExercise(id, { week, session_name, exercise_name, scope })`.

### Notes
- "Today only" intentionally persists as a `ProgramExercise` for the current week (required
  by the NOT-NULL FK). It does not appear in other weeks, matching user intent.
- No schema change to `WorkoutLog` is needed.

---

## Feature 3 — Logger display cleanup

### Goal
Show the weight unit once instead of on every field; remove the "auto" wording.

### Changes (presentation only, no behavior change)
- Add a single unit banner at the **top of the session** in `Logger.jsx`, e.g.
  *"Weights in {unitLabel}"* (reads `unitLabel` from `useApp()`).
- In `SetRow.jsx`, change field labels:
  - External weight: `{unitLabel}{weightHint}` → `Weight{weightHint ? ' ' + weightHint : ''}`
    (drops the unit; keeps any plate/weight hint).
  - Weighted-capable: `Added {unitLabel}` → `Added`.
  - Bodyweight chip: `BW (auto, {unitLabel})` → `BW`.
  - `Reps` / `RPE` labels unchanged.
  - The "Total: … {unitLabel}" helper line and drop-set `Drop {unitLabel}` label may keep
    their unit (they are summary/secondary), or drop it for consistency — implementer's
    call; default: keep `Total` unit, drop the `Drop` field unit to match.
- i18n: add a string key for the banner (`logger.weightsInUnit`) in `en` + `es`.

---

## Feature 4 — Fix the linked-swap bug

### Goal
Swapping one of two same-named exercise slots in a day changes only that slot, for the
current week only.

### Backend
- New endpoint `PATCH /api/program/{program_id}/exercise/{pe_id}/swap` with body
  `{ new_exercise_name }`:
  - Verifies the `ProgramExercise` belongs to a program owned by `current_user`.
  - Updates **only that one row**'s `exercise_name_canonical` and `exercise_name_raw`.
  - Returns `{ status: "swapped", pe_id, new_name }`.
- The old name-based endpoint (`PATCH /program/{id}/exercise/{old_name}`) may be left in
  place (unused) or removed; default: remove it since `useExerciseSwap` is its only caller.

### Frontend
- `Logger.jsx`: the swap button passes `group.pe_id` (already available) to
  `openSwapModal`, alongside the display name.
- `useExerciseSwap.js`: track the target `pe_id`; `handleSwapSelect` calls the new
  id-based client function. The post-swap schedule refetch + re-flatten + sets filter logic
  is otherwise unchanged.
- `api/client.js`: `swapExercise` changes signature to
  `swapExercise(programId, peId, newName)` hitting the new id-based route.

### Effect
- Sibling slots have distinct `pe_id` → no longer linked.
- Only the current week's row changes → "this week only" swap scope.
- Existing `WorkoutLog` rows keep their `program_exercise_id` → history preserved (the
  swapped row is renamed in place, matching prior behavior at the single-row level).

---

## Testing

### Backend (pytest, in-mem SQLite per `conftest.py`)
- `activate`: activating program B pauses program A; activating an already-active program is
  a no-op; activating another user's program 404s.
- `add exercise`: `scope=week` inserts exactly one row at next `exercise_order`;
  `scope=all_weeks` inserts one row per week containing the session; ownership enforced.
- `swap by id`: swapping one of two same-named rows updates exactly that row and leaves the
  sibling unchanged; ownership enforced; bad `pe_id` 404s.

### Frontend (vitest)
- Swap: two same-named slots in one day swap independently (no mirroring) — asserts the
  swap call carries the correct `pe_id`.
- Display: `SetRow` renders no per-field unit label after cleanup (smoke assertion).

---

## Risks / watch-outs

- **Swap scope change.** Swapping now affects only the current week, a change from the old
  all-weeks behavior. This is the explicitly chosen behavior. Document it in CLAUDE.md.
- **"Today only" leaves a residual ProgramExercise** for the current week (unavoidable given
  the NOT-NULL FK). Acceptable; it simply won't recur in later weeks.
- **One-active invariant.** The `activate` endpoint must pause all other active programs in
  the same transaction to avoid two active programs.
- Keep all new Spanish-equivalent i18n strings in sync (`i18n.js` en + es).
