# Phase 2 — Live Workout Logging UX

## Goal
Faster, phone-friendly logging flow with previous-value context and one-tap actions.

## Status: PARTIAL

## Already existed (pre-expansion)
- Logger.jsx with bulk session logging, set editing, warm-up pyramid, plate calculator, rest timer, dropset support, exercise swap.
- Auto-fill uses the progressive-overload query from previous weeks (commit `1033862`).

## Done this pass
- `WorkoutLog.is_true_1rm_attempt` + `completed_successfully` flags added (needed for official 1RM medal validation).
- All logging endpoints now require JWT (per-user isolation).

## Not done / follow-ups
- **No "save as reusable routine/template"** endpoint or UI yet.
- **No "copy last workout" one-click** flow yet.
- **No one-tap "repeat last set"** button in Logger (user still edits inline).
- **No dedicated phone-first live-workout mode UI** — Logger is responsive but not specifically optimized beyond what already existed.
- Frontend: logger does NOT yet surface an explicit `is_true_1rm_attempt` toggle — add a checkbox for set reps=1 so users can mark true max attempts and earn strength medals.

## Suggested next implementation order
1. Add `is_true_1rm_attempt` checkbox to Logger when reps input is 1.
2. "Copy last workout" button on Logger header.
3. Routines table + endpoints (`/api/routines` CRUD, `/api/routines/{id}/start`).
4. Routine picker modal in Logger.
