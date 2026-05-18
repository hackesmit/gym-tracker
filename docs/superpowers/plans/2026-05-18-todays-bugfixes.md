# Today's Bugfixes + Dead-Code Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land four user-reported bugfixes (exercise-swap weight, BW catalog retag, pullup merged-group state leak, dead-code sweep), on top of cleanly committing the in-flight working-tree changes from the 2026-04-26 plate-only + 2026-04-26 medal-derivative + 2026-04-27 BW-autosave threads.

**Architecture:** Three preparatory commits split the existing working tree along domain lines. Then four focused fix commits land each bug behind a test. Then a phased dead-code sweep — Phase 1 deletes pre-vetted dead code, Phase 2 dispatches parallel Explore agents to enumerate further candidates per module and feeds them through human review before any deletion.

**Tech Stack:** FastAPI + SQLAlchemy + pytest (backend), React 18 + Vite + Vitest (frontend). Backend deploys are manual via `flyctl deploy --app gym-tracker-api-bold-violet-7582`; frontend auto-deploys on push to master.

**Note on commits:** Per CLAUDE.md, do NOT push to remote. Commits land on `master` locally; the user runs the push and the Fly deploy themselves.

**Spec:** `docs/superpowers/specs/2026-05-18-todays-bugfixes-design.md` (commit `6b6cc9c`).

---

## File Map

| File | Change | Why |
|---|---|---|
| `backend/app/analytics/progress.py` | Modify (commit Phase 0a) | Strip BW component from `_fetch_exercise_history` |
| `backend/app/analytics/volume.py` | Modify (Phase 0a) | Plate-only weekly tonnage |
| `backend/app/medal_engine.py` | Modify (Phase 0a) | Plate-only volume in consistency/performance medals |
| `backend/app/routers/dashboard.py` | Modify (Phase 0a) | Plate-only week_volume |
| `backend/app/routers/friends.py` | Modify (Phase 0a) | Plate-only volume_30d aggregate |
| `backend/app/routers/tracker.py` | Modify (Phase 0a) | Expose `added_load_kg` on week-detail set rows |
| `backend/app/routers/analytics.py` | Modify (Phase 0a) | Expose `bodyweight_kind` on exercise-catalog endpoint |
| `frontend/src/pages/History.jsx` | Modify (Phase 0a) | Preserve plate semantics when editing a BW-class set |
| `backend/app/routers/logging.py` | Modify (Phase 0b) | Plate-only PR detection + recompute hooks (edit/undo/manual-1RM) + body-metric→user.bodyweight_kg sync + `SetUpdateRequest.added_load_kg` |
| `backend/tests/test_logging_api.py` | Modify (Phase 0b) | Body-metric → user.bodyweight_kg sync tests |
| `backend/tests/test_manual_1rm.py` | Modify (Phase 0b) | Manual 1RM fires derivative medals |
| `backend/app/captcha.py` | Modify (Phase 0c) | Domain-separated HMAC key + `sub` binding |
| `backend/app/routers/auth.py` | Modify (Phase 0c) | `_normalize_username` + PATCH /me `extra="forbid"` + absorb FK fix |
| `backend/tests/test_username_captcha.py` | Modify (Phase 0c) | Tests for cross-user replay refusal, zero-width-space defense, PATCH /me 422 |
| `frontend/src/hooks/useExerciseSwap.js` | Modify (Task A) | Remove skipSetsInit/swapInProgress shortcut so sets re-init for swapped PE |
| `frontend/src/hooks/useLoggerSession.js` | Modify (Task A) | Drop the now-unused skipSetsInit/swapInProgress refs |
| `frontend/src/pages/Logger.jsx` | Modify (Tasks A + C + D-1) | Remove skipSetsInit guard; group by program_exercise_id; drop is_bodyweight scaffolding |
| `frontend/src/hooks/__tests__/useExerciseSwap.test.js` | Create (Task A) | Asserts swap loads new exercise's overload data |
| `backend/app/seed_catalog.py` | Modify (Task B) | Untag PLATE-WEIGHTED CRUNCH, WALKING LUNGES, LEG RAISES |
| `backend/app/main.py` | Modify (Task B + D-1) | `_untag_bw_data_fix_once` lifespan migration; drop is_bodyweight ensure_column |
| `backend/app/models.py` | Modify (Task B + D-1) | `UntagBwAudit` model; drop `WorkoutLog.is_bodyweight` column |
| `backend/tests/test_catalog_bodyweight_kind.py` | Modify (Task B) | Locked classification + untagged-not-BW tests |
| `backend/tests/test_untag_bw_migration.py` | Create (Task B) | Migration round-trip test |
| `frontend/src/pages/__tests__/Logger.test.jsx` | Create (Task C) | Group-by-pe_id state isolation + render test |
| `frontend/src/components/SessionSummary.jsx` | Modify (Task D-1) | Replace `s.is_bodyweight` filter with `s.added_load_kg != null` |
| `frontend/src/components/PlateCalculator.jsx` | Delete (Task D-1) | Unused after `cb7f056` |
| `backend/Procfile` | Delete (Task D-1) | Render-era artifact |
| `CLAUDE.md` | Modify (Tasks B, C, D-1) | Document `untag_bw_2026_05`, pe_id grouping, is_bodyweight removal |
| `docs/superpowers/plans/2026-05-18-dead-code-audit-followup.md` | Possibly create (Task D-2) | Only if the Phase-2 audit list is too large to safely apply this session |

---

## Phase 0 — Commit the in-flight working tree

The working tree currently contains three logical bodies of work documented in `CLAUDE.md` but never committed. We split them into three reviewable commits before touching anything new.

### Phase 0a: Plate-only display semantics + History edit preservation

**Files:**
- Modify: `backend/app/analytics/progress.py`
- Modify: `backend/app/analytics/volume.py`
- Modify: `backend/app/medal_engine.py`
- Modify: `backend/app/routers/analytics.py`
- Modify: `backend/app/routers/dashboard.py`
- Modify: `backend/app/routers/friends.py`
- Modify: `backend/app/routers/tracker.py`
- Modify: `frontend/src/pages/History.jsx`

These diffs are already applied in the working tree (verified via `git diff` during planning). We just need to stage and commit them as one cohesive change.

- [ ] **Step 1: Confirm the eight files are still dirty**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git status -s backend/app/analytics/progress.py backend/app/analytics/volume.py backend/app/medal_engine.py backend/app/routers/analytics.py backend/app/routers/dashboard.py backend/app/routers/friends.py backend/app/routers/tracker.py frontend/src/pages/History.jsx
```

Expected: each line begins with `M ` (modified).

- [ ] **Step 2: Re-read the eight diffs and sanity-check they line up with CLAUDE.md's "Plate-only display semantics (2026-04-26)" section**

```bash
git diff backend/app/analytics/progress.py backend/app/analytics/volume.py backend/app/medal_engine.py backend/app/routers/analytics.py backend/app/routers/dashboard.py backend/app/routers/friends.py backend/app/routers/tracker.py frontend/src/pages/History.jsx | head -300
```

Expected: every `+` line either uses `coalesce(added_load_kg, load_kg)` (SQL queries), reads `added_load_kg if … is not None else load_kg` (Python), exposes `added_load_kg`/`bodyweight_kind` on a payload, or (in History.jsx) preserves `added_load_kg` when editing. If a line surprises you, stop and flag.

- [ ] **Step 3: Run pytest on the analytics/medal modules to confirm nothing is broken before the commit**

```bash
cd backend
pytest -q tests/test_analytics.py tests/test_medals.py tests/test_medal_leaderboard.py
```

Expected: all pass.

- [ ] **Step 4: Stage and commit**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git add backend/app/analytics/progress.py backend/app/analytics/volume.py backend/app/medal_engine.py backend/app/routers/analytics.py backend/app/routers/dashboard.py backend/app/routers/friends.py backend/app/routers/tracker.py frontend/src/pages/History.jsx
git commit -m "$(cat <<'EOF'
backend: plate-only volume/tonnage/e1RM across analytics + medals + dashboard

Strips the bodyweight component from every volume / tonnage / e1RM query
by collapsing on coalesce(added_load_kg, load_kg) for bodyweight-class
lifts. Without this, after the BW-input migration any weighted-pullup
set contributed bw*reps extra tonnage and inflated e1RM as the user's
bodyweight drifted.

Also exposes added_load_kg on the tracker week-detail payload and
bodyweight_kind on the exercise-catalog endpoint so the frontend can
render the right Logger layout per row. History.jsx preserves
added_load_kg when editing a BW-class set so plate semantics don't
strand on edit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Run git status to confirm**

```bash
git status --short
```

Expected: the eight files no longer appear. The remaining `M` entries are captcha.py, auth.py, logging.py, and the three test files (those are Phases 0b and 0c).

---

### Phase 0b: Logging.py — plate-only PR + recompute hooks + body-metric sync + tests

**Files:**
- Modify: `backend/app/routers/logging.py`
- Modify: `backend/tests/test_manual_1rm.py`
- Modify: `backend/tests/test_logging_api.py`

The logging.py diff bundles four conceptually distinct changes (plate-only PR detection, recompute_for_user on set edit + session undo, body-metric→user.bodyweight_kg sync, manual-1RM derivative medals + rank recompute, and the new `added_load_kg` field on `SetUpdateRequest`). All are documented in CLAUDE.md as "added 2026-04-26", and they're already implemented in the working tree. We keep them as one commit because splitting one file across four `git add -p` hunks isn't worth the worker effort.

- [ ] **Step 1: Confirm the three files are dirty**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git status -s backend/app/routers/logging.py backend/tests/test_logging_api.py backend/tests/test_manual_1rm.py
```

Expected: three `M ` lines.

- [ ] **Step 2: Re-read the diffs**

```bash
git diff backend/app/routers/logging.py backend/tests/test_logging_api.py backend/tests/test_manual_1rm.py | head -300
```

Verify presence of these five new behaviors (already noted in CLAUDE.md):
- `_effective(load_kg, added_load_kg)` helper used in PR detection.
- `recompute_for_user` called inside `update_set` and `undo_session`.
- `SetUpdateRequest.added_load_kg` field present.
- `_recompute_strength_derivatives` called inside `update_manual_1rm`.
- `create_body_metric` flushes, queries latest BodyMetric, and writes `user.bodyweight_kg`.

- [ ] **Step 3: Run the relevant tests**

```bash
cd backend
pytest -q tests/test_logging_api.py tests/test_manual_1rm.py tests/test_ranks.py
```

Expected: all pass. If `test_manual_1rm.py::test_patch_fires_derivative_medals` fails because the medal isn't seeded, fix `seed_medal_catalog(db)` call inside the test (this is one of the assertions — it should already pass since the diff added it).

- [ ] **Step 4: Stage and commit**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git add backend/app/routers/logging.py backend/tests/test_logging_api.py backend/tests/test_manual_1rm.py
git commit -m "$(cat <<'EOF'
backend: plate-only PR detection + recompute hooks + body-metric BW sync

- log_bulk_session: PR/e1RM uses coalesce(added_load_kg, load_kg) so
  weighted-pullup PRs compare like-with-like across sessions, and
  bodyweight-only sets aren't disqualified by load_kg=0.
- SetUpdateRequest now accepts added_load_kg so History.jsx can keep
  plate semantics when editing a BW-class set.
- update_set / undo_session call recompute_for_user so editing or
  deleting a fake-1RM set drops the user out of an inflated tier
  immediately (instead of waiting for the next workout log).
- update_manual_1rm calls _recompute_strength_derivatives AND
  recompute_for_user so a manual 1RM save fires the Powerlifting
  Total / Best Relative Strength chain and refreshes muscle ranks
  without needing a new logged session.
- create_body_metric flushes the new row, then writes the most-recent
  BodyMetric's bodyweight to User.bodyweight_kg so the Logger's inline
  Set BW chip stops looping forever after the first save.

Tests cover the body-metric sync, the date-ordering safeguard
(older dates don't pull the live BW backwards), and the derivative
medal firing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify clean**

```bash
git status --short
```

Expected: only `captcha.py`, `auth.py`, `test_username_captcha.py` remain.

---

### Phase 0c: Username CAPTCHA hardening + absorb FK fix

**Files:**
- Modify: `backend/app/captcha.py`
- Modify: `backend/app/routers/auth.py`
- Modify: `backend/tests/test_username_captcha.py`

CLAUDE.md "Username change + CAPTCHA (2026-04-21, hardened 2026-04-26)" describes this exactly: domain-separated key, `sub` binding, `_normalize_username`, PATCH /me `extra="forbid"`, plus the `absorb` endpoint adding `Achievement` and `ChatMessage` to the FK-cascade list.

- [ ] **Step 1: Confirm dirty**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git status -s backend/app/captcha.py backend/app/routers/auth.py backend/tests/test_username_captcha.py
```

Expected: three `M ` lines.

- [ ] **Step 2: Re-read diffs**

```bash
git diff backend/app/captcha.py backend/app/routers/auth.py backend/tests/test_username_captcha.py | head -250
```

Verify:
- `captcha.py` derives `_CAPTCHA_KEY = hmac(JWT_SECRET, b"username_captcha/v1")`.
- `generate_challenge(user_id)` adds `sub: str(int(user_id))` to the payload, signs with `_CAPTCHA_KEY`.
- `verify_challenge(token, answer_str, user_id)` rejects when `sub` mismatch.
- `auth.py` defines `_normalize_username` (NFKC + reject category C chars).
- `register` and `change_username` both call `_normalize_username` and enforce 2–40 char length.
- `UpdateMePayload.model_config = {"extra": "forbid"}` and `update_me` no longer touches `username`.
- `absorb` includes `(Achievement, "achievements")` and `(ChatMessage, "chat_messages")` in the migration list.

- [ ] **Step 3: Run the tests**

```bash
cd backend
pytest -q tests/test_username_captcha.py tests/test_auth.py tests/test_absorb.py
```

Expected: all pass. If `test_absorb.py` references models that need importing, that's part of the existing diff already.

- [ ] **Step 4: Stage and commit**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git add backend/app/captcha.py backend/app/routers/auth.py backend/tests/test_username_captcha.py
git commit -m "$(cat <<'EOF'
backend: harden username CAPTCHA + close PATCH /me bypass + absorb FK fix

- captcha: derive a domain-separated HMAC key from JWT_SECRET so no
  code path that signs access tokens can mint a CAPTCHA. Bind the
  challenge to a user_id via the JWT 'sub' claim; verify_challenge
  refuses cross-user replay.
- auth: _normalize_username NFKC-normalizes + strips whitespace +
  rejects any Unicode category C character. Closes the zero-width
  space squat where 'hackesmit​' rendered identical to the real
  username but registered as a distinct row.
- auth: UpdateMePayload uses extra="forbid"; update_me no longer
  touches the username field. Any client smuggling 'username'
  through PATCH /api/auth/me now fails with 422, restoring the
  CAPTCHA-gated /change-username route as the only rename path.
- auth: absorb now includes Achievement + ChatMessage in the
  per-user delete loop. Without this the absorb transaction rolled
  back for any user with a PR or chat message because the FK on
  achievements/chat_messages has no ON DELETE CASCADE.

Tests cover cross-user replay refusal, zero-width-space rejection
at both register and change-username, and PATCH /me 422.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify clean working tree (modulo untracked files)**

```bash
git status --short
```

Expected: no remaining `M ` entries on the tracked files we've been editing. The `??` entries (specs/plans, scratch files, image redesigns) stay; we're not touching them.

- [ ] **Step 6: Run the full test suite to set a baseline before Task A**

```bash
cd backend && pytest -q
cd ../frontend && npm test -- --run
```

Expected per CLAUDE.md: ~194 backend pass + ~47 frontend pass, 1 pre-existing unrelated failure (`test_log_bulk_relog_replaces`). Note the exact pass count so we can compare after each task.

---

## Task A: Exercise-swap loads the new exercise's last weight

**Files:**
- Modify: `frontend/src/hooks/useExerciseSwap.js`
- Modify: `frontend/src/hooks/useLoggerSession.js`
- Modify: `frontend/src/pages/Logger.jsx`
- Create: `frontend/src/hooks/__tests__/useExerciseSwap.test.js`

### Root cause recap

`useExerciseSwap.handleSwapSelect` keeps the swapped exercise's existing sets in place and writes `skipSetsInit.current = true` so the Logger's sets-init effect bails when the schedule refresh triggers a re-render. As a result the new exercise inherits the old exercise's load_kg/reps. Fix: drop the short-circuit and let sets-init re-run; for unchanged PEs it produces the same output, and for the swapped PE it pulls fresh overload data.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useExerciseSwap.test.js`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../api/client', () => ({
  swapExercise: vi.fn().mockResolvedValue({}),
  getSchedule: vi.fn(),
  getExerciseCatalog: vi.fn().mockResolvedValue([
    { name: 'BARBELL ROW', muscle_group: 'back' },
    { name: 'BENT-OVER BARBELL ROW', muscle_group: 'back' },
  ]),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import useExerciseSwap from '../useExerciseSwap';
import { swapExercise, getSchedule } from '../../api/client';

describe('useExerciseSwap', () => {
  let setSets, setSessions, setScheduleData, setSelectedSession, setCatalogData;
  let skipSetsInit, swapInProgress;

  beforeEach(() => {
    setSets = vi.fn();
    setSessions = vi.fn();
    setScheduleData = vi.fn();
    setSelectedSession = vi.fn();
    setCatalogData = vi.fn();
    skipSetsInit = { current: false };
    swapInProgress = { current: false };
    vi.clearAllMocks();
  });

  it('does NOT set skipSetsInit after swap (so sets re-init from new overload)', async () => {
    getSchedule.mockResolvedValue({
      schedule: { 1: { 'Pull A': [{ id: 99, exercise_name: 'BENT-OVER BARBELL ROW', working_sets: 3 }] } },
    });

    const { result } = renderHook(() =>
      useExerciseSwap(
        { id: 7 },
        swapInProgress,
        {
          currentWeek: 1,
          selectedSession: { session_name: 'Pull A', exercises: [] },
          setSelectedSession,
          setSessions,
          setScheduleData,
          setSets,
          setCatalogData,
          catalogData: [
            { name: 'BARBELL ROW', muscle_group: 'back' },
            { name: 'BENT-OVER BARBELL ROW', muscle_group: 'back' },
          ],
          skipSetsInit,
        }
      )
    );

    await act(async () => {
      await result.current.openSwapModal('BARBELL ROW');
    });

    await act(async () => {
      await result.current.handleSwapSelect('BENT-OVER BARBELL ROW');
    });

    expect(swapExercise).toHaveBeenCalledWith(7, 'BARBELL ROW', 'BENT-OVER BARBELL ROW');
    expect(skipSetsInit.current).toBe(false);   // CRITICAL — must not skip
    expect(swapInProgress.current).toBe(false); // CRITICAL — no leftover flag
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend
npx vitest run src/hooks/__tests__/useExerciseSwap.test.js
```

Expected: `expect(skipSetsInit.current).toBe(false)` fails because the current implementation sets it to `true`.

- [ ] **Step 3: Update `useExerciseSwap.js`**

Replace `frontend/src/hooks/useExerciseSwap.js` with:

```jsx
import { useState } from 'react';
import { swapExercise, getSchedule, getExerciseCatalog } from '../api/client';
import { flattenScheduleForWeek } from './useLoggerSession';
import { useToast } from '../context/ToastContext';

/**
 * Manages the exercise-swap modal state. After a successful swap, the schedule
 * is re-fetched and the parent's selectedSession is re-bound by name; the
 * Logger's sets-init effect then runs naturally and pulls the new exercise's
 * last-session per-set data via the overload endpoint.
 */
export default function useExerciseSwap(activeProgram, _swapInProgress, {
  currentWeek, selectedSession, setSelectedSession,
  setSessions, setScheduleData, setSets, setCatalogData, catalogData,
  skipSetsInit: _skipSetsInit,
}) {
  const { addToast } = useToast();
  const [swapTarget, setSwapTarget] = useState(null);
  const [swapSearch, setSwapSearch] = useState('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapMuscleGroup, setSwapMuscleGroup] = useState(null);
  const [showAllMuscleGroups, setShowAllMuscleGroups] = useState(false);

  const openSwapModal = async (exerciseName) => {
    setSwapTarget(exerciseName);
    setSwapSearch('');
    setShowAllMuscleGroups(false);

    let catalog = catalogData;
    if (catalog.length === 0) {
      setSwapLoading(true);
      try {
        const res = await getExerciseCatalog();
        catalog = Array.isArray(res) ? res : res.exercises || [];
        setCatalogData(catalog);
      } catch {
        setCatalogData([]);
        catalog = [];
      } finally {
        setSwapLoading(false);
      }
    }

    const match = catalog.find((ex) => {
      const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
      return name === exerciseName;
    });
    setSwapMuscleGroup(match?.muscle_group || null);
  };

  const handleSwapSelect = async (newName) => {
    if (!activeProgram || !swapTarget || newName === swapTarget) return;
    try {
      await swapExercise(activeProgram.id, swapTarget, newName);
      const scheduleRes = await getSchedule(activeProgram.id);
      setScheduleData(scheduleRes);
      const flatSessions = flattenScheduleForWeek(scheduleRes, currentWeek);
      setSessions(flatSessions);

      // Drop the swapped-out PE's rows from sets so React doesn't briefly
      // render stale rows while the schedule refresh propagates. The
      // sets-init effect will repopulate from the new schedule + overload.
      setSets((prev) => prev.filter((s) => s.exercise_name !== swapTarget));

      const match = flatSessions.find((s) => s.session_name === selectedSession?.session_name);
      if (match) setSelectedSession(match);
      else if (flatSessions.length) setSelectedSession(flatSessions[0]);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSwapTarget(null);
      setSwapSearch('');
    }
  };

  const closeSwapModal = () => {
    setSwapTarget(null);
    setSwapSearch('');
  };

  const filteredCatalog = catalogData.filter((ex) => {
    const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
    if (name === swapTarget) return false;
    if (!name.toLowerCase().includes(swapSearch.toLowerCase())) return false;
    if (!showAllMuscleGroups && swapMuscleGroup) {
      const mg = typeof ex === 'string' ? '' : ex.muscle_group || '';
      if (mg !== swapMuscleGroup) return false;
    }
    return true;
  });

  return {
    swapTarget,
    swapSearch,
    setSwapSearch,
    swapLoading,
    swapMuscleGroup,
    showAllMuscleGroups,
    setShowAllMuscleGroups,
    filteredCatalog,
    openSwapModal,
    handleSwapSelect,
    closeSwapModal,
  };
}
```

Note: the function signature still accepts `_swapInProgress` and `_skipSetsInit` (underscore-prefixed to mark unused) so the call site in `Logger.jsx` keeps working without an upstream change. We remove the call-site refs in Step 5.

- [ ] **Step 4: Run the new test to verify it passes**

```bash
cd frontend
npx vitest run src/hooks/__tests__/useExerciseSwap.test.js
```

Expected: pass.

- [ ] **Step 5: Strip the now-unused refs from `useLoggerSession.js`**

In `frontend/src/hooks/useLoggerSession.js`:

1. Delete the two ref declarations (lines 31-33):

```jsx
  // Refs to skip sets re-init after exercise swap (preserves user-entered data)
  const skipSetsInit = useRef(false);
  const swapInProgress = useRef(false);
```

2. Inside the post-overload `useEffect` (lines 81-97), remove the `isSwap` short-circuit. The block:

```jsx
  useEffect(() => {
    if (!activeProgram || !selectedSession) return;
    const isSwap = swapInProgress.current;
    getOverloadPlan(activeProgram.id, currentWeek, selectedSession.session_name)
      .then((data) => {
        setOverload(data);
        if (isSwap) {
          // Overload updated after a swap — skip the sets-init effect it triggers
          skipSetsInit.current = true;
          swapInProgress.current = false;
        }
      })
      .catch(() => {
        setOverload(null);
        swapInProgress.current = false;
      });
  }, [activeProgram, selectedSession, currentWeek]);
```

Becomes:

```jsx
  useEffect(() => {
    if (!activeProgram || !selectedSession) return;
    getOverloadPlan(activeProgram.id, currentWeek, selectedSession.session_name)
      .then((data) => setOverload(data))
      .catch(() => setOverload(null));
  }, [activeProgram, selectedSession, currentWeek]);
```

3. Remove `skipSetsInit` and `swapInProgress` from the returned object (the last `return {...}`). Drop both entries; the hook no longer returns them.

4. Remove the now-stale comment about "after exercise swap" if present.

- [ ] **Step 6: Strip the skipSetsInit guard + destructure from `Logger.jsx`**

In `frontend/src/pages/Logger.jsx`:

1. Remove `skipSetsInit` and `swapInProgress` from the `useLoggerSession(...)` destructure (around line 85). The new destructure looks like:

```jsx
  const {
    sessions, setSessions,
    currentWeek, setCurrentWeek,
    selectedSession, setSelectedSession,
    overload, setOverload,
    scheduleData, setScheduleData,
    loading, catalogData, setCatalogData,
    changeWeek,
  } = useLoggerSession(activeProgram, units);
```

(If the original destructure includes other fields like `loading` already, keep them in place; just remove the two refs.)

2. Update the `useExerciseSwap(...)` call (around line 122) to stop passing `swapInProgress` and `skipSetsInit`. The new call:

```jsx
  const {
    swapTarget,
    swapSearch,
    setSwapSearch,
    swapLoading,
    swapMuscleGroup,
    showAllMuscleGroups,
    setShowAllMuscleGroups,
    filteredCatalog,
    openSwapModal,
    handleSwapSelect,
    closeSwapModal,
  } = useExerciseSwap(activeProgram, null, {
    currentWeek, selectedSession, setSelectedSession,
    setSessions, setScheduleData, setSets, setCatalogData, catalogData,
    skipSetsInit: null,
  });
```

The `null` and `skipSetsInit: null` keep the hook signature stable. They're noise but preserve back-compat with any consumer we missed; a later cleanup task removes the params entirely.

3. Find the sets-init `useEffect` (around line 140) and delete the first 3 lines of its body:

```jsx
    if (skipSetsInit.current) {
      skipSetsInit.current = false;
      return;
    }
```

The effect body now starts with `if (!selectedSession) return;`.

- [ ] **Step 7: Run the affected tests**

```bash
cd frontend
npx vitest run src/hooks/__tests__/useExerciseSwap.test.js src/hooks/__tests__/useWorkoutDraft.test.js
```

Expected: pass.

- [ ] **Step 8: Manual smoke test**

```bash
cd backend && python -m uvicorn app.main:app --reload --port 8000   # in one terminal
cd frontend && npm run dev                                          # in another
```

In the browser:
1. Log in as `hackesmit` / `password`.
2. Open `/log`. Pick a session that includes an exercise you've logged before (e.g., `BARBELL ROW`).
3. Note the pre-filled load on the first set.
4. Click the swap icon. Pick a different exercise you've ALSO logged before with a noticeably different weight (e.g., `BENT-OVER BARBELL ROW`).
5. Expected: after the swap completes, set 1 shows the new exercise's last logged weight, not the original.
6. If you also have a never-logged exercise to test, repeat: set 1 should show the prescribed reps / 0 load.

- [ ] **Step 9: Commit**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git add frontend/src/hooks/useExerciseSwap.js frontend/src/hooks/useLoggerSession.js frontend/src/pages/Logger.jsx frontend/src/hooks/__tests__/useExerciseSwap.test.js
git commit -m "$(cat <<'EOF'
fix(logger): exercise swap loads new exercise's last logged weight

handleSwapSelect previously did an in-place rename of sets and set
skipSetsInit=true so the Logger's sets-init effect skipped. Net: the
new exercise inherited the old exercise's load/reps.

Now the swap path drops the swapped-out PE's rows from sets, refreshes
the schedule, re-binds the selected session, and lets sets-init run
naturally. The overload re-fetch supplies the new PE's per-set data,
so set 1 displays the new exercise's last logged weight (or the
prescribed default if never logged).

Drops the now-unused skipSetsInit/swapInProgress refs from
useLoggerSession and stops Logger.jsx from passing them. Hook params
are left as null placeholders for one cleanup cycle.

Test: useExerciseSwap.test.js asserts skipSetsInit and swapInProgress
are never flipped, so a future regression is caught immediately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B: BW catalog retag (PLATE-WEIGHTED CRUNCH, WALKING LUNGES, LEG RAISES)

**Files:**
- Modify: `backend/app/seed_catalog.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_catalog_bodyweight_kind.py`
- Create: `backend/tests/test_untag_bw_migration.py`
- Modify: `CLAUDE.md`

### Step 1 — untag the three rows

- [ ] **Step 1: Edit `backend/app/seed_catalog.py`**

Remove the `"bodyweight_kind": "weighted_capable",` line from the `PLATE-WEIGHTED CRUNCH` entry (line ~1329):

```python
    {
        "canonical_name": "PLATE-WEIGHTED CRUNCH",
        "muscle_group_primary": "abs",
        "muscle_groups_secondary": [],
        "movement_pattern": "core",
        "equipment": "bodyweight",  # <- consider changing to "weighted" but leave for now to avoid scope creep
        "is_compound": False,
        "is_unilateral": False,
        "difficulty_level": "beginner",
    },
```

Remove `"bodyweight_kind": "pure",` from `WALKING LUNGES` entry (line ~849):

```python
    {
        "canonical_name": "WALKING LUNGES",
        "muscle_group_primary": "quads",
        "muscle_groups_secondary": ["glutes"],
        "movement_pattern": "lunge",
        "equipment": "bodyweight",
        "is_compound": True,
        "is_unilateral": True,
        "difficulty_level": "beginner",
    },
```

Remove `"bodyweight_kind": "pure",` from `LEG RAISES` entry (line ~1307):

```python
    {
        "canonical_name": "LEG RAISES",
        "muscle_group_primary": "abs",
        "muscle_groups_secondary": [],
        "movement_pattern": "core",
        "equipment": "bodyweight",
        "is_compound": False,
        "is_unilateral": False,
        "difficulty_level": "beginner",
    },
```

Leave `BW WALKING LUNGES` and `HANGING LEG RAISE` exactly as they are (still `pure`).

### Step 2 — locked classification regression test

- [ ] **Step 2: Append to `backend/tests/test_catalog_bodyweight_kind.py`**

Open the file and add at the bottom (preserve existing tests):

```python
# 2026-05-18: explicit lockdown of every catalog row's bodyweight_kind so a
# future seed-list edit can't silently flip a classification.
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

UNTAGGED_AMBIGUOUS = ["PLATE-WEIGHTED CRUNCH", "WALKING LUNGES", "LEG RAISES"]


def test_bw_classification_locked():
    """Every BW-tagged canonical row must match its expected kind. If you're
    adding a new BW row, add it to EXPECTED_BODYWEIGHT_KIND above."""
    from app.seed_catalog import EXERCISE_CATALOG
    by_name = {e["canonical_name"]: e for e in EXERCISE_CATALOG}
    for name, kind in EXPECTED_BODYWEIGHT_KIND.items():
        got = by_name[name].get("bodyweight_kind")
        assert got == kind, (
            f"{name} expected bodyweight_kind={kind!r}, got {got!r}"
        )


def test_untagged_ambiguous_lifts_are_not_bw():
    """User-flagged as ambiguous defaults. Must stay untagged so the Logger
    renders them with the normal weighted layout, not the BW chip."""
    from app.seed_catalog import EXERCISE_CATALOG
    by_name = {e["canonical_name"]: e for e in EXERCISE_CATALOG}
    for name in UNTAGGED_AMBIGUOUS:
        got = by_name[name].get("bodyweight_kind")
        assert got is None, (
            f"{name} must NOT be tagged as BW (untagged 2026-05-18); got {got!r}"
        )
```

- [ ] **Step 3: Run the test**

```bash
cd backend
pytest -q tests/test_catalog_bodyweight_kind.py
```

Expected: pass. If the lock fails because some new BW row isn't in the dict, decide: add to the dict OR untag the row. Don't blindly add.

### Step 4 — UntagBwAudit model

- [ ] **Step 4: Add `UntagBwAudit` model to `backend/app/models.py`**

Find the `BWMigrationAudit` class (search for `__tablename__ = "bw_migration_audit"`). Directly below it, add a sister model:

```python
class UntagBwAudit(Base):
    """Audit log for the 2026-05-18 untag-BW data fix.

    Mirrors BWMigrationAudit's shape: rows recording every WorkoutLog whose
    plate-only semantics were collapsed back to external-load semantics
    when its exercise was un-tagged as BW-class.
    """

    __tablename__ = "untag_bw_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    log_id: Mapped[int] = mapped_column(Integer, ForeignKey("workout_logs.id"))
    exercise_name: Mapped[str] = mapped_column(String, nullable=False)
    before_load_kg: Mapped[float] = mapped_column(Float, nullable=False)
    before_added_load_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    after_load_kg: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

If the existing `BWMigrationAudit` doesn't already import `ForeignKey`, `Optional`, etc., copy whatever pattern it uses verbatim.

### Step 5 — lifespan migration

- [ ] **Step 5: Add `_untag_bw_data_fix_once` to `backend/app/main.py`**

Find `_backfill_user_bodyweight_once` (around line 340). Directly after that function (before `_backfill_default_user`), add:

```python
def _untag_bw_data_fix_once(db):
    """One-shot: collapse plate-only semantics on WorkoutLog rows whose
    exercise was untagged as BW-class on 2026-05-18 (PLATE-WEIGHTED CRUNCH,
    WALKING LUNGES, LEG RAISES).

    For each WorkoutLog whose program_exercise.exercise_name_canonical is in
    the untagged set AND added_load_kg IS NOT NULL:
      - added_load_kg > 0 (weighted_capable era):
          load_kg <- added_load_kg, added_load_kg <- NULL
      - added_load_kg = 0 (pure era):
          load_kg <- 0, added_load_kg <- NULL

    Audits every change into untag_bw_audit. Gated by migration_log row
    'untag_bw_2026_05'.
    """
    from .models import MigrationLog, ProgramExercise, UntagBwAudit, WorkoutLog

    name = "untag_bw_2026_05"
    if db.query(MigrationLog).filter_by(name=name).first() is not None:
        return

    UNTAGGED = ("PLATE-WEIGHTED CRUNCH", "WALKING LUNGES", "LEG RAISES")
    rows = (
        db.query(WorkoutLog, ProgramExercise.exercise_name_canonical)
        .join(ProgramExercise, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            ProgramExercise.exercise_name_canonical.in_(UNTAGGED),
            WorkoutLog.added_load_kg.isnot(None),
        )
        .all()
    )

    touched = 0
    for wl, canon in rows:
        before_load = wl.load_kg
        before_added = wl.added_load_kg
        if (wl.added_load_kg or 0.0) > 0:
            wl.load_kg = float(wl.added_load_kg)
            reason = "weighted_capable_collapsed"
        else:
            wl.load_kg = 0.0
            reason = "pure_collapsed"
        wl.added_load_kg = None
        db.add(UntagBwAudit(
            log_id=wl.id,
            exercise_name=canon,
            before_load_kg=float(before_load or 0.0),
            before_added_load_kg=float(before_added) if before_added is not None else None,
            after_load_kg=float(wl.load_kg),
            reason=reason,
        ))
        touched += 1

    db.add(MigrationLog(name=name))
    db.commit()
    if touched:
        print(f"Untag-BW migration: touched {touched} workout logs.", flush=True)
```

Wire it into `lifespan` (search for `_backfill_user_bodyweight_once(db)` in the lifespan body and add a line after it):

```python
        _backfill_user_bodyweight_once(db)   # 2026-05-03 BW sync fix
        _untag_bw_data_fix_once(db)          # 2026-05-18 retag PLATE-WEIGHTED CRUNCH / WALKING LUNGES / LEG RAISES
```

### Step 6 — test for the migration

- [ ] **Step 6: Create `backend/tests/test_untag_bw_migration.py`**

```python
"""Round-trip test for the 2026-05-18 untag-BW data fix migration.

Verifies that WorkoutLog rows belonging to the three untagged canonical
exercises have their plate-only semantics collapsed back to external-load
semantics, and that the migration is idempotent.
"""

import pytest

from app.main import _untag_bw_data_fix_once
from app.models import (
    MigrationLog, Program, ProgramExercise, UntagBwAudit, User, WorkoutLog,
)


@pytest.fixture
def program_with_untagged_logs(db):
    user = db.query(User).first()
    prog = Program(user_id=user.id, name="Test", weeks=1, frequency_per_week=1)
    db.add(prog)
    db.commit()
    db.refresh(prog)

    pe_crunch = ProgramExercise(
        program_id=prog.id,
        week=1,
        session_name="A",
        exercise_order=1,
        exercise_name="Plate Weighted Crunch",
        exercise_name_canonical="PLATE-WEIGHTED CRUNCH",
        working_sets=3,
        prescribed_reps="10",
    )
    pe_lunge = ProgramExercise(
        program_id=prog.id,
        week=1,
        session_name="A",
        exercise_order=2,
        exercise_name="Walking Lunges",
        exercise_name_canonical="WALKING LUNGES",
        working_sets=2,
        prescribed_reps="20",
    )
    pe_raise = ProgramExercise(
        program_id=prog.id,
        week=1,
        session_name="A",
        exercise_order=3,
        exercise_name="Leg Raises",
        exercise_name_canonical="LEG RAISES",
        working_sets=2,
        prescribed_reps="15",
    )
    db.add_all([pe_crunch, pe_lunge, pe_raise])
    db.commit()
    db.refresh(pe_crunch); db.refresh(pe_lunge); db.refresh(pe_raise)

    # PLATE-WEIGHTED CRUNCH — weighted_capable era: load=BW+plate, added=plate
    wl1 = WorkoutLog(
        user_id=user.id, program_exercise_id=pe_crunch.id, set_number=1,
        load_kg=85.0, added_load_kg=10.0, reps_completed=10,
        date="2026-05-01",
    )
    # WALKING LUNGES — pure era: load=BW, added=0
    wl2 = WorkoutLog(
        user_id=user.id, program_exercise_id=pe_lunge.id, set_number=1,
        load_kg=75.0, added_load_kg=0.0, reps_completed=20,
        date="2026-05-02",
    )
    # LEG RAISES — pure era: load=BW, added=0
    wl3 = WorkoutLog(
        user_id=user.id, program_exercise_id=pe_raise.id, set_number=1,
        load_kg=75.0, added_load_kg=0.0, reps_completed=15,
        date="2026-05-03",
    )
    db.add_all([wl1, wl2, wl3])
    db.commit()
    return wl1.id, wl2.id, wl3.id


def test_migration_collapses_weighted_capable(db, program_with_untagged_logs):
    crunch_id, _, _ = program_with_untagged_logs
    _untag_bw_data_fix_once(db)
    wl = db.query(WorkoutLog).filter_by(id=crunch_id).first()
    assert wl.load_kg == 10.0     # was 85 (BW+plate); collapses to plate only
    assert wl.added_load_kg is None


def test_migration_collapses_pure_to_zero_load(db, program_with_untagged_logs):
    _, lunge_id, raise_id = program_with_untagged_logs
    _untag_bw_data_fix_once(db)
    for wid in (lunge_id, raise_id):
        wl = db.query(WorkoutLog).filter_by(id=wid).first()
        assert wl.load_kg == 0.0
        assert wl.added_load_kg is None


def test_migration_writes_audit_rows(db, program_with_untagged_logs):
    crunch_id, lunge_id, raise_id = program_with_untagged_logs
    _untag_bw_data_fix_once(db)
    audits = db.query(UntagBwAudit).order_by(UntagBwAudit.id).all()
    assert len(audits) == 3
    crunch_audit = next(a for a in audits if a.log_id == crunch_id)
    assert crunch_audit.before_load_kg == 85.0
    assert crunch_audit.before_added_load_kg == 10.0
    assert crunch_audit.after_load_kg == 10.0
    assert crunch_audit.reason == "weighted_capable_collapsed"


def test_migration_is_idempotent(db, program_with_untagged_logs):
    _untag_bw_data_fix_once(db)
    first_count = db.query(UntagBwAudit).count()
    _untag_bw_data_fix_once(db)
    second_count = db.query(UntagBwAudit).count()
    assert first_count == second_count == 3
    assert db.query(MigrationLog).filter_by(name="untag_bw_2026_05").count() == 1


def test_migration_ignores_external_lifts(db):
    """A WorkoutLog on a non-untagged exercise must be untouched."""
    user = db.query(User).first()
    prog = Program(user_id=user.id, name="X", weeks=1, frequency_per_week=1)
    db.add(prog); db.commit(); db.refresh(prog)
    pe = ProgramExercise(
        program_id=prog.id, week=1, session_name="A", exercise_order=1,
        exercise_name="Bench Press", exercise_name_canonical="BENCH PRESS",
        working_sets=3, prescribed_reps="5",
    )
    db.add(pe); db.commit(); db.refresh(pe)
    wl = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, set_number=1,
        load_kg=100.0, added_load_kg=None, reps_completed=5,
        date="2026-05-04",
    )
    db.add(wl); db.commit()

    _untag_bw_data_fix_once(db)

    wl = db.query(WorkoutLog).filter_by(id=wl.id).first()
    assert wl.load_kg == 100.0
    assert wl.added_load_kg is None
    assert db.query(UntagBwAudit).filter_by(log_id=wl.id).first() is None
```

- [ ] **Step 7: Run the migration tests**

```bash
cd backend
pytest -q tests/test_untag_bw_migration.py tests/test_catalog_bodyweight_kind.py
```

Expected: all pass. If `ProgramExercise` requires fields not shown (e.g., `is_superset` is non-null without default), patch the fixture to satisfy them. Don't lower assertions to make tests pass.

- [ ] **Step 8: Update CLAUDE.md**

Find the "BW input migration (2026-04-25)" section in `CLAUDE.md`. After its last paragraph (the one ending `…Per-user re-run at …`), add a new section:

```markdown
## Untag-BW data fix (2026-05-18)

PLATE-WEIGHTED CRUNCH, WALKING LUNGES, and LEG RAISES were retagged from
BW-class to normal weighted on 2026-05-18 (user flagged them as
ambiguous). A one-shot lifespan migration `_untag_bw_data_fix_once`
(in `backend/app/main.py`, gated by `migration_log` row
`untag_bw_2026_05`) collapses plate-only semantics on existing WorkoutLog
rows for these three exercises:

- If `added_load_kg > 0` (weighted_capable era): `load_kg <- added_load_kg`,
  `added_load_kg <- NULL`.
- If `added_load_kg = 0` (pure era): `load_kg <- 0`, `added_load_kg <- NULL`.

Every change is audited into the new `untag_bw_audit` table
(model: `UntagBwAudit`). The locked-classification test
`test_bw_classification_locked` in
`backend/tests/test_catalog_bodyweight_kind.py` prevents future seed-list
edits from silently flipping a row back. Round-trip test:
`backend/tests/test_untag_bw_migration.py`.
```

- [ ] **Step 9: Run the full backend suite**

```bash
cd backend
pytest -q
```

Expected: 5 new passing tests on top of the baseline.

- [ ] **Step 10: Commit**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git add backend/app/seed_catalog.py backend/app/models.py backend/app/main.py backend/tests/test_catalog_bodyweight_kind.py backend/tests/test_untag_bw_migration.py CLAUDE.md
git commit -m "$(cat <<'EOF'
fix(catalog): untag PLATE-WEIGHTED CRUNCH, WALKING LUNGES, LEG RAISES

User flagged these three rows as ambiguous BW classifications. They now
default to the normal weighted layout in the Logger (plate counts, BW
does not). One-shot migration untag_bw_2026_05 collapses plate-only
semantics on existing WorkoutLog rows so historical data matches the
new classification:

  weighted_capable era (added > 0)  → load = added, added = NULL
  pure era             (added = 0)  → load = 0,     added = NULL

Every change is audited into the new untag_bw_audit table. A new
locked-classification test prevents future seed edits from silently
flipping a BW row, and a round-trip test covers the migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task C: Group exercises by program_exercise_id (pullup state leak)

**Files:**
- Modify: `frontend/src/pages/Logger.jsx`
- Create: `frontend/src/pages/__tests__/Logger.test.jsx`
- Modify: `CLAUDE.md`

### Root cause recap

After the HEAVY/BACK-OFF collapse (commit `cb7f056`), two ProgramExercise rows can share `exercise_name_canonical`. The Logger groups consecutive sets by `s.exercise_name`, so those PEs merge into one rendered Card. The Card carries `key={group.name}` (same canonical string for both PEs), which lets React reconciliation reuse subtrees and blurs state ownership between the merged sets. Symptom: typing into set 1 mirrors into set 2 in real time.

Fix: group by `program_exercise_id` instead.

### Step 1 — write the failing test

- [ ] **Step 1: Create `frontend/src/pages/__tests__/Logger.test.jsx`**

```jsx
import { describe, it, expect } from 'vitest';

/**
 * Pure-function test of the Logger's exercise-grouping pass. Two PEs with
 * matching canonical exercise_name (post-2026-05-13 HEAVY/BACK-OFF collapse)
 * must render as two distinct groups, not one merged group.
 *
 * We extract the grouping into a helper for testability; the Logger imports
 * it from the same module.
 */
import { groupSetsByProgramExercise } from '../Logger';

describe('groupSetsByProgramExercise', () => {
  it('keeps two PEs with the same exercise_name in separate groups', () => {
    const sets = [
      { program_exercise_id: 10, exercise_name: 'PULLUP', exercise_name_raw: 'PULLUP (HEAVY)',   set_number: 1, reps_completed: 5 },
      { program_exercise_id: 10, exercise_name: 'PULLUP', exercise_name_raw: 'PULLUP (HEAVY)',   set_number: 2, reps_completed: 4 },
      { program_exercise_id: 11, exercise_name: 'PULLUP', exercise_name_raw: 'PULLUP (BACK OFF)', set_number: 1, reps_completed: 8 },
    ];
    const groups = groupSetsByProgramExercise(sets);
    expect(groups).toHaveLength(2);
    expect(groups[0].pe_id).toBe(10);
    expect(groups[0].sets).toHaveLength(2);
    expect(groups[1].pe_id).toBe(11);
    expect(groups[1].sets).toHaveLength(1);
  });

  it('still merges consecutive sets that share a program_exercise_id', () => {
    const sets = [
      { program_exercise_id: 7, exercise_name: 'BENCH PRESS', set_number: 1 },
      { program_exercise_id: 7, exercise_name: 'BENCH PRESS', set_number: 2 },
      { program_exercise_id: 7, exercise_name: 'BENCH PRESS', set_number: 3 },
    ];
    const groups = groupSetsByProgramExercise(sets);
    expect(groups).toHaveLength(1);
    expect(groups[0].sets).toHaveLength(3);
  });

  it('attaches a unique idx to each set within the group', () => {
    const sets = [
      { program_exercise_id: 10, exercise_name: 'PULLUP', set_number: 1 },
      { program_exercise_id: 10, exercise_name: 'PULLUP', set_number: 2 },
      { program_exercise_id: 11, exercise_name: 'PULLUP', set_number: 1 },
    ];
    const groups = groupSetsByProgramExercise(sets);
    const allIdx = groups.flatMap((g) => g.sets.map((s) => s.idx));
    expect(allIdx).toEqual([0, 1, 2]);
  });

  it('falls back to exercise_name when program_exercise_id is missing', () => {
    // Defensive: legacy code paths that build sets without pe_id keep working.
    const sets = [
      { exercise_name: 'BENCH PRESS', set_number: 1 },
      { exercise_name: 'BENCH PRESS', set_number: 2 },
      { exercise_name: 'OHP', set_number: 1 },
    ];
    const groups = groupSetsByProgramExercise(sets);
    expect(groups).toHaveLength(2);
    expect(groups[0].sets).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend
npx vitest run src/pages/__tests__/Logger.test.jsx
```

Expected: fails because `groupSetsByProgramExercise` doesn't exist yet.

### Step 3 — extract grouping helper and wire it in

- [ ] **Step 3: Add the helper to `frontend/src/pages/Logger.jsx`**

Find the grouping block in `Logger.jsx` (around line 377-393, starts with `// Group sets by exercise, respecting superset grouping`). Above the default `export default function Logger()` line at the top of the file, add the exported helper:

```jsx
/**
 * Group consecutive sets by program_exercise_id (or exercise_name as a
 * fallback for legacy callers without a pe_id). Each group gets a unique
 * `pe_id`, the canonical and raw exercise names, and the superset / rest /
 * warm-up metadata pulled from the first set. Every set is tagged with its
 * global idx so updateSet() can keep using array-index identity.
 *
 * Exported because grouping is the load-bearing logic for state isolation
 * between merged-canonical PEs (post-HEAVY/BACK-OFF-collapse fix, 2026-05-18).
 */
export function groupSetsByProgramExercise(sets) {
  const groups = [];
  let currentKey = null;
  sets.forEach((s, idx) => {
    const key = s.program_exercise_id != null ? s.program_exercise_id : s.exercise_name;
    if (key !== currentKey) {
      groups.push({
        pe_id: s.program_exercise_id ?? null,
        name: s.exercise_name,
        raw_name: s.exercise_name_raw || s.exercise_name,
        sets: [],
        is_superset: s.is_superset,
        superset_group: s.superset_group,
        rest_period: s.rest_period,
        warm_up_sets: s.warm_up_sets,
      });
      currentKey = key;
    }
    groups[groups.length - 1].sets.push({ ...s, idx });
  });
  return groups;
}
```

Then inside the component body, replace the inline grouping (the `const exerciseGroups = [];` block, lines 377-393) with:

```jsx
  const exerciseGroups = groupSetsByProgramExercise(sets);
```

### Step 4 — update Card `key`, `addSet`, and call site

- [ ] **Step 4: Update Card key and addSet signature**

In `Logger.jsx`:

1. Find `<Card key={group.name}` (around line 588) and change to `<Card key={group.pe_id ?? group.name}`.

2. Update `addSet` (around line 204) to key off `pe_id`:

```jsx
  const addSet = (peId) => {
    setSets((prev) => {
      let lastIdx = -1;
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].program_exercise_id === peId) lastIdx = i;
      }
      if (lastIdx === -1) return prev;
      const lastSet = prev[lastIdx];
      const newSet = {
        ...lastSet,
        set_number: lastSet.set_number + 1,
        is_dropset: false,
        dropset_load_kg: '',
        dropset_reps: '',
      };
      const next = [...prev];
      next.splice(lastIdx + 1, 0, newSet);
      return next;
    });
    setSaved(false);
  };
```

3. Find the `addSet` call site (around line 694, `onClick={() => addSet(group.name)}`) and change to:

```jsx
                            onClick={() => addSet(group.pe_id)}
```

4. (Sanity) `openSwapModal(group.name)` stays — swap is by canonical name. Confirm no other references to `group.name` rely on it being unique per Card.

### Step 5 — run the test to verify it passes

- [ ] **Step 5: Run the test**

```bash
cd frontend
npx vitest run src/pages/__tests__/Logger.test.jsx
```

Expected: all four tests pass.

### Step 6 — manual smoke test

- [ ] **Step 6: Reproduce the original bug and confirm the fix**

1. With backend + frontend dev servers running, log in.
2. Pick a session that has an exercise with both HEAVY and BACK-OFF variants in your program (typically pullups in the Nippard preset).
3. Verify the Logger now shows **two separate Cards** for the two pullup variants, each with its own intensity marker badge.
4. Type a number into set 1 of the first Card. Confirm set 1 of the second Card is NOT updated.
5. (Bonus) Click "+ set" on the first Card. Confirm only that Card gains a row.

### Step 7 — update CLAUDE.md

- [ ] **Step 7: Document the grouping change**

Find the "## Editorial Theme System" section header or a stable nearby marker, and add this paragraph near the bottom of the "Pages / Routes" section, or at the end of the "Plate-only display semantics (2026-04-26)" section:

```markdown
## Logger exercise grouping (2026-05-18)

The Logger groups consecutive sets by `program_exercise_id`, not by
canonical `exercise_name`. Post-HEAVY/BACK-OFF-collapse (2026-05-13)
two ProgramExercise rows can share an `exercise_name_canonical` (e.g.
both pullup variants resolve to "PULLUP"). Grouping by canonical name
merged them into one rendered Card, which let React reconciliation
swap state across sibling SetRows (typing in set 1 mirrored into
set 2 in real time). Grouping by `program_exercise_id` gives each PE
its own Card with stable `key`, isolating state. Pure helper:
`groupSetsByProgramExercise` in `frontend/src/pages/Logger.jsx`,
covered by `frontend/src/pages/__tests__/Logger.test.jsx`.
```

### Step 8 — commit

- [ ] **Step 8: Commit**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git add frontend/src/pages/Logger.jsx frontend/src/pages/__tests__/Logger.test.jsx CLAUDE.md
git commit -m "$(cat <<'EOF'
fix(logger): group sets by program_exercise_id to isolate PE state

After the 2026-05-13 HEAVY/BACK-OFF collapse two ProgramExercise rows
can share exercise_name_canonical (e.g. PULLUP HEAVY + PULLUP BACK OFF
both map to 'PULLUP'). The Logger grouped consecutive sets by canonical
name and used the canonical name as the Card's React key, which let
reconciliation swap state across sibling SetRows: typing in set 1
mirrored into set 2 in real time.

Grouping now keys on program_exercise_id (with a defensive fallback to
exercise_name when missing). Each PE renders its own Card with a stable
unique key, isolating state. addSet() takes a peId and only appends to
the matching PE. The intensity-marker badge and swap-by-canonical-name
flows are unaffected.

The grouping is exported as groupSetsByProgramExercise() and covered by
four Vitest cases: two-PE separation, single-PE merge, idx uniqueness,
and the legacy name-fallback path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task D-1: Targeted dead-code strikes

**Files:**
- Modify: `backend/app/models.py` (drop `WorkoutLog.is_bodyweight`)
- Modify: `backend/app/main.py` (drop ensure_column + add `_drop_is_bodyweight_column_once`)
- Modify: `backend/app/routers/logging.py` (drop is_bodyweight from payloads)
- Modify: `frontend/src/components/SessionSummary.jsx` (switch is_bodyweight → added_load_kg test)
- Modify: `frontend/src/pages/Logger.jsx` (drop `is_bodyweight: false` scaffolding)
- Delete: `backend/Procfile`
- Delete: `frontend/src/components/PlateCalculator.jsx`
- Modify: `CLAUDE.md` (note removals)

### Step 1 — verify PlateCalculator and Procfile are unreferenced

- [ ] **Step 1: Grep for any importer**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
grep -rn "PlateCalculator\|PlateCalcButton\|from.*PlateCalculator" frontend/src/ 2>/dev/null | grep -v PlateCalculator.jsx
grep -rn "Procfile" backend/ 2>/dev/null
```

Expected: first command returns no output (no importer outside the file itself). Second command returns at most `backend/Procfile:1:` (the file itself). If either returns something else, **stop and re-evaluate before deleting**.

### Step 2 — delete PlateCalculator and Procfile

- [ ] **Step 2: Delete the files**

```bash
rm frontend/src/components/PlateCalculator.jsx
rm backend/Procfile
```

### Step 3 — drop `is_bodyweight` from frontend

- [ ] **Step 3: Update `frontend/src/components/SessionSummary.jsx`**

Find line 13:

```jsx
  const countedSets = sets.filter(s => s.load_kg > 0 || s.is_bodyweight);
```

Replace with:

```jsx
  const countedSets = sets.filter(s => s.load_kg > 0 || s.added_load_kg != null);
```

(`added_load_kg != null` is the post-BW-migration definition of a BW-class set — matches CLAUDE.md "Plate-only display semantics" guidance.)

- [ ] **Step 4: Update `frontend/src/pages/Logger.jsx`**

Find the sets-init effect's set-object construction (around line 177-194). Remove the `is_bodyweight: false,` line:

```jsx
        newSets.push({
          program_exercise_id: ex.id,
          exercise_name: exName,
          exercise_name_raw: ex.exercise_name_raw || exName,
          set_number: s,
          load_kg: setLoad,
          reps_completed: setReps,
          rpe_actual: setRpe,
          rest_period: ex.rest_period || '',
          warm_up_sets: ex.warm_up_sets || '',
          added_load_kg: '',
          is_dropset: false,
          dropset_load_kg: '',
          dropset_reps: '',
          is_superset: ex.is_superset || false,
          superset_group: ex.superset_group || null,
        });
```

### Step 5 — drop `is_bodyweight` from backend (model + ORM + payloads + migration)

- [ ] **Step 5: Remove `is_bodyweight` field from `backend/app/models.py`**

Find line 150:

```python
    is_bodyweight: Mapped[bool] = mapped_column(Boolean, default=False)
```

Delete the line entirely. If the surrounding columns import `Boolean` only for this field, leave the import — it may be used elsewhere; verify with grep but err on keeping imports.

- [ ] **Step 6: Remove the ensure_column call from `backend/app/main.py`**

Find line 64 (or wherever it lives — search for `_ensure_column("workout_logs", "is_bodyweight"`):

```python
    _ensure_column("workout_logs", "is_bodyweight", "BOOLEAN", default="false")
```

Delete the line.

- [ ] **Step 7: Add `_drop_is_bodyweight_column_once` migration to `backend/app/main.py`**

Below `_untag_bw_data_fix_once`, add:

```python
def _drop_is_bodyweight_column_once(db):
    """One-shot: drop the deprecated workout_logs.is_bodyweight column.

    The authoritative test for a bodyweight-class set is added_load_kg IS NOT
    NULL (CLAUDE.md, 'Plate-only display semantics'). is_bodyweight is no
    longer read by any code path after the 2026-05-18 cleanup. Drop it from
    Postgres to keep the schema honest. SQLite local dev never executed the
    ensure_column for it after this cleanup, so the column is absent there.

    Gated by migration_log row 'drop_is_bodyweight_2026_05'.
    """
    from sqlalchemy import inspect, text
    from .models import MigrationLog

    name = "drop_is_bodyweight_2026_05"
    if db.query(MigrationLog).filter_by(name=name).first() is not None:
        return

    inspector = inspect(db.bind)
    cols = {c["name"] for c in inspector.get_columns("workout_logs")}
    if "is_bodyweight" in cols:
        # Postgres supports DROP COLUMN; SQLite would need a table rebuild but
        # this column is added only when ensure_column was called (Postgres
        # path), so SQLite tests never reach this branch.
        try:
            db.execute(text("ALTER TABLE workout_logs DROP COLUMN is_bodyweight"))
        except Exception as e:
            print(f"drop_is_bodyweight: DROP COLUMN skipped: {e}", flush=True)
            return

    db.add(MigrationLog(name=name))
    db.commit()
    print("drop_is_bodyweight: column removed.", flush=True)
```

Wire into `lifespan` (after `_untag_bw_data_fix_once(db)`):

```python
        _untag_bw_data_fix_once(db)
        _drop_is_bodyweight_column_once(db)   # 2026-05-18 dead column removal
```

- [ ] **Step 8: Remove `is_bodyweight` from `backend/app/routers/logging.py`**

Search for `is_bodyweight` in the file:

```bash
grep -n "is_bodyweight" backend/app/routers/logging.py
```

Expected matches (line numbers approximate, taken from the spec):
- 42 — `is_bodyweight: bool = False` (in `SetIn`?)
- 58 — `is_bodyweight: bool` (in `WorkoutLogResponse` or similar)
- 72 — `is_bodyweight: bool = False`
- 122 — `is_bodyweight: bool`
- 193 — `is_bodyweight=payload.is_bodyweight,`
- 291 — `is_bodyweight=s.is_bodyweight,`

For each: delete the entire line. After all six deletions, re-grep to confirm zero remaining matches. Re-read the affected Pydantic models (`SetIn`, `BulkSetIn`, response models) to make sure none of them have a default-value-only line that no longer makes sense after the field is gone (Pydantic doesn't care about field order, so just confirm syntactic validity).

- [ ] **Step 9: Run pytest to surface any test that referenced the field**

```bash
cd backend
pytest -q tests/test_logging_api.py tests/test_workout_log_schema.py
```

If something references `is_bodyweight` in a test fixture, update the test to drop the field. If the field is asserted in a test, that test was testing dead behavior — delete the assertion or the whole test as appropriate (use judgment; when in doubt, mark with `# 2026-05-18: was asserting removed field`).

### Step 10 — full suite + commit Phase 1

- [ ] **Step 10: Run the full test suite**

```bash
cd backend && pytest -q
cd ../frontend && npm test -- --run
```

Expected: pass counts roughly match the Phase 0 baseline. If a test fails because it asserted on `is_bodyweight`, fix that test (delete the assertion). If a test fails for any other reason, **stop**.

- [ ] **Step 11: Update CLAUDE.md**

In the "Database Schema (18 tables)" section, find the line about `WorkoutLog supports is_dropset, dropset_load_kg, is_bodyweight, …`. Drop `is_bodyweight,` from the list.

Add a short note at the end of the relevant migration cluster:

```markdown
## is_bodyweight column removal (2026-05-18)

The deprecated `workout_logs.is_bodyweight` column is dropped via the
`_drop_is_bodyweight_column_once` lifespan migration (gated by
`migration_log` row `drop_is_bodyweight_2026_05`). The authoritative
test for a bodyweight-class set has been `added_load_kg IS NOT NULL`
since 2026-04-25 (see "Plate-only display semantics"). The frontend
SessionSummary set-counter now reads `added_load_kg != null` instead.
```

Also note Procfile + PlateCalculator deletions in the relevant Project Structure / Live URLs sections if they're called out there. For Procfile: in the line that mentions `Procfile  # Legacy Render start command (unused)`, delete the entire line. For PlateCalculator: under `components/`, find the `PlateCalculator.jsx` line and delete it.

- [ ] **Step 12: Commit Phase 1**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git add -A
git commit -m "$(cat <<'EOF'
chore: targeted dead-code sweep — is_bodyweight, Procfile, PlateCalculator

- workout_logs.is_bodyweight column dropped via one-shot lifespan
  migration drop_is_bodyweight_2026_05. The field has been deprecated
  since 2026-04-25 ('Plate-only display semantics': the authoritative
  test for a BW-class set is added_load_kg IS NOT NULL).
- SetIn / BulkSetIn / WorkoutLogResponse no longer accept or return
  is_bodyweight. The Logger no longer scaffolds it onto new sets.
  SessionSummary's countedSets filter now uses added_load_kg != null.
- backend/Procfile deleted — it was the Render-era start command and
  CLAUDE.md already noted it as unused.
- frontend/src/components/PlateCalculator.jsx deleted — the Logger
  removed all importers in commit cb7f056, no other page used it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task D-2: Phase 2 — parallel dead-code audit via Explore agents

This task dispatches read-only Explore agents in parallel across the codebase. Each agent reports unreferenced exports per its assigned domain. The agents do NOT delete anything; the human worker reviews the consolidated list and produces the delete commit.

If the consolidated list is small (≲ 20 candidates), apply directly. If larger or any candidate is non-obvious, write a follow-up plan at `docs/superpowers/plans/2026-05-18-dead-code-audit-followup.md` and stop.

- [ ] **Step 1: Dispatch six Explore agents in parallel**

Each agent uses the same prompt template, varying the domain. Send them all in one message with six Agent tool calls. The exact agent prompt is the following block — copy verbatim, replacing `<DOMAIN_PATH>` and `<DOMAIN_DESCRIPTION>`:

```
You are doing a READ-ONLY dead-code audit on <DOMAIN_PATH> of a
React 18 + FastAPI gym-tracker codebase. Project root:
/mnt/c/Users/danie/downloads/gym tracker.

For every file in <DOMAIN_PATH>:
1. List the symbols that file exports (functions, classes, components,
   constants, the default export).
2. For each exported symbol, grep the ENTIRE project for references —
   imports, JSX usage, route registrations, dynamic string references
   (e.g. medal_engine.METRIC_DISPATCH dispatch tables).
3. Mark each symbol as either "REFERENCED" or "NO REFERENCES FOUND".

ALSO scan for:
- Functions/classes within files (not just exports) that have no
  internal callers either. Flag with file:line.
- Pydantic models or dataclasses that aren't used in any route signature
  or response_model.
- React components imported by an index.js or barrel file but rendered
  nowhere.
- i18n keys in frontend/src/i18n.js that have no `t('key')` reference
  anywhere in src/. (Only check this if the assigned domain includes
  i18n; otherwise skip.)

DO NOT DELETE OR MODIFY ANY FILES. You are a reporter only.

Output format (markdown table, one row per candidate):

| File | Symbol | Why I think it's dead | Confidence |
|---|---|---|---|
| backend/app/foo.py | _bar_internal | only caller was removed in commit X | high |

Confidence levels:
- high: zero references, no plausible runtime dispatch
- medium: zero static references but symbol name is generic / could be referenced by string lookup
- low: probably still used; flagging for human review

End with a "Notes" section explaining anything weird (e.g., "the X
module is imported by name in models.py but appears unused — that
import may be load-bearing for SQLAlchemy table registration").

Be specific and complete. The reviewer is making a delete decision
based on your output. Word limit: 600 words.
```

The six agent calls, one per domain:

1. `<DOMAIN_PATH> = backend/app/routers/`, `<DOMAIN_DESCRIPTION> = FastAPI routers`
2. `<DOMAIN_PATH> = backend/app/analytics/`, `<DOMAIN_DESCRIPTION> = analytics modules`
3. `<DOMAIN_PATH> = backend/app/*.py` (top-level — auth.py, captcha.py, models.py, medal_engine.py, rank_engine.py, seed_catalog.py, seed_presets.py, parser.py, bw_migration.py, etc.), `<DOMAIN_DESCRIPTION> = backend app modules`
4. `<DOMAIN_PATH> = frontend/src/pages/`, `<DOMAIN_DESCRIPTION> = React pages`
5. `<DOMAIN_PATH> = frontend/src/components/`, `<DOMAIN_DESCRIPTION> = React components`
6. `<DOMAIN_PATH> = frontend/src/hooks/, frontend/src/utils/, frontend/src/api/, frontend/src/i18n.js`, `<DOMAIN_DESCRIPTION> = hooks, utils, API client, i18n keys`

Use `subagent_type: Explore` for each.

- [ ] **Step 2: Consolidate the six reports**

Once all six agents complete, combine their tables into a single consolidated list. Group by Confidence (high → medium → low). Print the consolidated table for the user.

- [ ] **Step 3: Triage**

For each high-confidence row, eyeball with `grep -rn '<symbol>' /mnt/c/Users/danie/downloads/gym\ tracker/` and confirm zero callers. If confirmed, mark for deletion. For medium-confidence rows, do the same grep but also check for string-based references (`grep -rn '"<symbol>"\|'\\''<symbol>'\\''' .`). If still clean, mark for deletion.

For low-confidence rows: skip. They go in the follow-up plan if it materializes.

- [ ] **Step 4: Decide whether to apply now or defer**

If the marked-for-deletion list has ≤ 20 items AND every item passes the eyeball check, proceed to Step 5 (delete and commit). Otherwise, write `docs/superpowers/plans/2026-05-18-dead-code-audit-followup.md` containing the full consolidated table plus the triage notes; commit only the spec/plan and stop the dead-code work there. The user can then schedule the follow-up.

- [ ] **Step 5: Apply deletions in batches**

If applying now: group by file. For each affected file, make the precise deletions. Re-run tests after each file batch:

```bash
cd backend && pytest -q
cd ../frontend && npm test -- --run
```

If a test fails, revert the last batch and move that candidate to the follow-up plan.

- [ ] **Step 6: Commit (one commit per batch is fine if there are many)**

```bash
git add -A
git commit -m "chore: dead-code sweep Phase 2 — remove unreferenced exports"
```

Or, if writing a follow-up plan instead:

```bash
git add docs/superpowers/plans/2026-05-18-dead-code-audit-followup.md
git commit -m "$(cat <<'EOF'
docs: follow-up plan for Phase-2 dead-code audit

Phase 1 deletions landed in the prior commit. Phase 2's consolidated
audit list across all six domains is large enough that applying it in
one session risks breakage. The follow-up plan captures every
candidate, confidence, and triage note for a future session.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task Final: Verification

- [ ] **Step 1: Run the full test suite**

```bash
cd backend && pytest -q
cd ../frontend && npm test -- --run
```

Expected per CLAUDE.md baseline: ~194 + 5 (untag-BW) + 5 (untag-BW migration round-trip) + a couple from Task A swap test = ~204 backend pass. Frontend: ~47 + 4 (Logger grouping) + 1 (swap) = ~52 pass. Pre-existing `test_log_bulk_relog_replaces` failure may still be there — note it.

- [ ] **Step 2: Manual end-to-end smoke**

With both dev servers running:

1. Log in as a real user.
2. Open `/log`, swap an exercise, confirm new exercise's last load loads. (Task A)
3. Open a session with PLATE-WEIGHTED CRUNCH (if present). Confirm it renders as a normal weight+reps row (no BW chip). (Task B)
4. Open a session with a HEAVY+BACK-OFF pair (e.g., pullups in Nippard preset). Confirm two distinct Cards, typing in one set doesn't mirror to the other. (Task C)
5. Save the session. Confirm it persists.

- [ ] **Step 3: Print deploy reminder**

Print to the user:

> Today's commits need a manual Fly.io deploy because of the catalog retag + drop-column migration:
>
> ```powershell
> cd backend
> flyctl deploy --app gym-tracker-api-bold-violet-7582
> ```
>
> The frontend auto-deploys on push. After Fly comes up, hit
> `https://gym-tracker-api-bold-violet-7582.fly.dev/api/auth/me` to
> warm the lifespan migrations (`untag_bw_2026_05` +
> `drop_is_bodyweight_2026_05`).

- [ ] **Step 4: Final git status check**

```bash
cd /mnt/c/Users/danie/downloads/gym\ tracker
git status --short
git log --oneline -20
```

Expected: working tree clean (modulo the pre-existing untracked artifacts like LOTR Badges/, scratch images, etc.). Recent history shows the Phase 0 commits + Task A/B/C/D-1/D-2 commits.

---

## Self-review checklist

- **Spec coverage:**
  - Issue A → Task A. ✓
  - Issue B → Task B (untag + locked test + migration). ✓
  - Issue C → Task C (pe_id grouping). ✓
  - Issue D Phase 1 → Task D-1. ✓
  - Issue D Phase 2 → Task D-2 (parallel agents → triage → either apply or follow-up plan). ✓
  - Sequencing prerequisite (commit in-flight work first) → Phase 0a/0b/0c. ✓
- **Placeholders:** zero — every step has exact files, exact commands, exact code blocks. The agent prompt template is the only template-style block and the variable substitutions are listed explicitly.
- **Type consistency:**
  - `groupSetsByProgramExercise` named identically in helper + test + Logger consumption.
  - `pe_id` is the property name everywhere (Card key, addSet param, group construction).
  - `_untag_bw_data_fix_once`, `untag_bw_2026_05`, `UntagBwAudit`, `untag_bw_audit` are the four canonical names for the migration / row / model / table — all consistent.
  - `_drop_is_bodyweight_column_once` / `drop_is_bodyweight_2026_05` consistent.
  - `_effective` helper in logging.py keeps the name it already has in the in-flight diff (no new name introduced).
- **Per-task tests are real:** every new behavior has a test step that runs before the implementation step (TDD discipline), with the expected failure mode named.
- **Migration safety:** every migration is idempotent (gated by `MigrationLog` row), audits its changes, and has a round-trip pytest case.
- **No skipped hooks / force-push / amend:** all commit steps use HEREDOC commit messages and standard `git add` / `git commit`. No `--no-verify`, no `git push`, no `git push --force`, no `git commit --amend`.
