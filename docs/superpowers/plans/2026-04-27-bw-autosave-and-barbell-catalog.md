# BW Autosave + Barbell Catalog Backfill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two reported bugs — (1) the inline "Set BW" pill on bodyweight-class set rows now autosaves on Enter and on blur and is awaited by the main session-save handler, (2) the foundational barbell lifts (back squat, bench press, deadlift, OHP, barbell row) appear in the exercise catalog so they show up in the swap modal and custom program builder.

**Architecture:** Frontend: lift the inline BW draft up to `Logger.jsx` and flush it before evaluating `needsBwButMissing`; add Enter/Blur handlers to `SetBwPrompt.jsx`. Backend: append 24 new canonical rows to the idempotent `EXERCISE_CATALOG` seed list — they land on next backend startup with no migration needed.

**Tech Stack:** React 18 + Vite + Vitest (frontend), FastAPI + SQLAlchemy + pytest (backend). Per `CLAUDE.md`, backend deploys are manual via `flyctl deploy --app gym-tracker-api-bold-violet-7582`; frontend auto-deploys on push to master.

**Note on commits:** This project's `CLAUDE.md` specifies "only commit when explicitly asked". The commit steps below are part of the standard plan template; the executor should batch the changes and ask the user before running any `git commit`.

---

## File Map

| File | Change | Why |
|---|---|---|
| `frontend/src/components/SetBwPrompt.jsx` | Modify | Add Enter + Blur autosave, re-entry guard, `onValueChange` callback |
| `frontend/src/components/__tests__/SetBwPrompt.test.jsx` | Modify | Cover new behaviors |
| `frontend/src/components/SetRow.jsx` | Modify | Prop-drill `onBwValueChange` through `PureBwLayout` / `WeightedCapableLayout` / `BwChip` |
| `frontend/src/pages/Logger.jsx` | Modify | Add `inlineBwDraft` state, flush before `needsBwButMissing`, use `effectiveBwKg` in payload build |
| `backend/app/seed_catalog.py` | Modify | Append 24 missing barbell canonical rows |
| `backend/tests/test_catalog_completeness.py` | Create | Regression test asserting all `EXERCISE_MAP` keys exist in catalog |

---

## Task 1: Add Enter + Blur autosave to SetBwPrompt

**Files:**
- Modify: `frontend/src/components/SetBwPrompt.jsx`
- Test: `frontend/src/components/__tests__/SetBwPrompt.test.jsx`

- [ ] **Step 1: Write the failing tests**

Append these test cases to `frontend/src/components/__tests__/SetBwPrompt.test.jsx` (inside the existing `describe` block, after the existing tests):

```jsx
  it('saves on Enter key', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '82.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(82.5);
    });
  });

  it('saves on blur when value > 0', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '78' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(78);
    });
  });

  it('does not call onSubmit on blur when value is empty', () => {
    const onSubmit = vi.fn();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.blur(input);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not double-submit when Enter and click happen close together', async () => {
    let resolve;
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r; }));
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolve();
  });

  it('fires onValueChange as the user types', () => {
    const onValueChange = vi.fn();
    render(<SetBwPrompt unitLabel="kg" onSubmit={() => {}} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.change(input, { target: { value: '75' } });
    expect(onValueChange).toHaveBeenLastCalledWith('75');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend
npx vitest run src/components/__tests__/SetBwPrompt.test.jsx
```

Expected: the 5 new tests fail (Enter/blur don't trigger; double-submit fires twice; `onValueChange` is undefined).

- [ ] **Step 3: Update `SetBwPrompt.jsx`**

Replace the entire contents of `frontend/src/components/SetBwPrompt.jsx` with:

```jsx
import { useState } from 'react';
import { Save } from 'lucide-react';

/**
 * Inline "Set BW" affordance shown in SetRow when the user has no recorded
 * bodyweight. Tapping reveals a numeric input. Submission calls the parent's
 * onSubmit (which POSTs /api/body-metrics and refreshes user state).
 *
 * Auto-saves on Enter and on blur so users don't have to find the dedicated
 * save icon. Optional `onValueChange` lets a parent observe the unsaved draft
 * (used by Logger to flush a pending value before the main session save).
 */
export default function SetBwPrompt({ unitLabel, onSubmit, onValueChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (next) => {
    setValue(next);
    if (onValueChange) onValueChange(next);
  };

  const handleSave = async () => {
    if (saving) return;
    const num = parseFloat(value);
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      await onSubmit(num);
      setEditing(false);
      setValue('');
      if (onValueChange) onValueChange('');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="px-2 py-1.5 text-[10px] uppercase tracking-wider rounded-lg border border-dashed border-accent/60 text-accent-light hover:bg-accent/10 touch-manipulation"
      >
        Set BW
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        autoFocus
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        placeholder={`BW (${unitLabel})`}
        className="bg-surface-light border border-accent rounded-lg px-2 py-1.5 text-xs text-text w-20 focus:ring-1 focus:ring-accent outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        aria-label="Save"
        className="p-1.5 rounded-lg bg-accent text-accent-ink touch-manipulation disabled:opacity-50"
      >
        <Save size={12} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend
npx vitest run src/components/__tests__/SetBwPrompt.test.jsx
```

Expected: all 9 tests pass (4 existing + 5 new).

- [ ] **Step 5: Commit (ask user first)**

```bash
git add frontend/src/components/SetBwPrompt.jsx frontend/src/components/__tests__/SetBwPrompt.test.jsx
git commit -m "fix(logger): autosave inline BW on Enter and blur"
```

---

## Task 2: Prop-drill `onBwValueChange` through SetRow

**Files:**
- Modify: `frontend/src/components/SetRow.jsx`

This task adds a passthrough prop. No behavioral change, no new tests needed beyond what already covers `SetRow`.

- [ ] **Step 1: Update `BwChip` to accept and forward `onValueChange`**

In `frontend/src/components/SetRow.jsx`, replace the `BwChip` function (currently at lines 27–38) with:

```jsx
function BwChip({ userBodyweightKg, unitLabel, units, onSetBw, onBwValueChange }) {
  const bwDisplay = userBodyweightKg ? kgToDisplay(userBodyweightKg, units) : null;
  return (
    <div className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text-muted min-h-[42px] flex items-center">
      {bwDisplay !== null ? (
        <span>{bwDisplay}</span>
      ) : (
        <SetBwPrompt unitLabel={unitLabel} onSubmit={onSetBw} onValueChange={onBwValueChange} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `PureBwLayout` to accept and forward `onBwValueChange`**

Replace the `PureBwLayout` function (currently at lines 40–54) with:

```jsx
function PureBwLayout({ set, userBodyweightKg, unitLabel, units, onUpdate, onTriggerTimer, onSetBw, onBwValueChange }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem] sm:grid-cols-[2rem_1fr_1fr_5rem] gap-1.5 sm:gap-2 items-end">
      <span className="text-xs text-text-muted text-center pb-2">{set.set_number}</span>
      <div className="relative">
        <span className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          BW (auto, {unitLabel})
        </span>
        <BwChip userBodyweightKg={userBodyweightKg} unitLabel={unitLabel} units={units} onSetBw={onSetBw} onBwValueChange={onBwValueChange} />
      </div>
      <RepsInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
      <RpeInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
    </div>
  );
}
```

- [ ] **Step 3: Update `WeightedCapableLayout` to accept and forward `onBwValueChange`**

Replace the `WeightedCapableLayout` function header and the `<BwChip>` usage. Specifically, change the function signature (line 56) to:

```jsx
function WeightedCapableLayout({
  set, userBodyweightKg, unitLabel, units, onUpdate, onTriggerTimer, onSetBw, onBwValueChange,
}) {
```

And change the `<BwChip>` invocation inside (currently around line 73) to:

```jsx
          <BwChip userBodyweightKg={userBodyweightKg} unitLabel={unitLabel} units={units} onSetBw={onSetBw} onBwValueChange={onBwValueChange} />
```

- [ ] **Step 4: Update the default `SetRow` export to forward `onBwValueChange`**

Replace the default `SetRow` function (currently at lines 148–170) with:

```jsx
export default function SetRow({
  set, bodyweightKind, userBodyweightKg, unitLabel, units,
  weightHint, onUpdate, onTriggerTimer, onSetBw, onBwValueChange,
}) {
  if (bodyweightKind === 'pure') {
    return <PureBwLayout
      set={set} userBodyweightKg={userBodyweightKg}
      unitLabel={unitLabel} units={units}
      onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} onSetBw={onSetBw}
      onBwValueChange={onBwValueChange}
    />;
  }
  if (bodyweightKind === 'weighted_capable') {
    return <WeightedCapableLayout
      set={set} userBodyweightKg={userBodyweightKg}
      unitLabel={unitLabel} units={units}
      onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} onSetBw={onSetBw}
      onBwValueChange={onBwValueChange}
    />;
  }
  return <ExternalLayout
    set={set} unitLabel={unitLabel} weightHint={weightHint}
    onUpdate={onUpdate} onTriggerTimer={onTriggerTimer}
  />;
}
```

- [ ] **Step 5: Run the existing SetRow tests to make sure nothing broke**

```bash
cd frontend
npx vitest run src/components/__tests__/SetRow.test.jsx
```

Expected: all existing tests still pass. The new prop is optional — pre-existing call sites that don't pass it continue to work because `onBwValueChange` is simply `undefined`, which `SetBwPrompt` already null-checks.

- [ ] **Step 6: Commit (ask user first)**

```bash
git add frontend/src/components/SetRow.jsx
git commit -m "fix(logger): forward onBwValueChange through SetRow"
```

---

## Task 3: Lift inline BW draft to Logger and flush before main save

**Files:**
- Modify: `frontend/src/pages/Logger.jsx`

- [ ] **Step 1: Add `inlineBwDraft` state**

In `frontend/src/pages/Logger.jsx`, add the following state declaration immediately after the existing `metricsSaved` state (around line 108):

```jsx
  const [inlineBwDraft, setInlineBwDraft] = useState('');
```

- [ ] **Step 2: Wire the draft callback through SetRow**

Find the `<SetRow>` invocation (around line 595) and add `onBwValueChange={setInlineBwDraft}`:

```jsx
                              <SetRow
                                set={s}
                                bodyweightKind={getBodyweightKind(s.exercise_name, catalogData)}
                                userBodyweightKg={userBodyweightKg}
                                unitLabel={unitLabel}
                                units={units}
                                weightHint={getWeightHint(s.exercise_name, catalogData)}
                                onUpdate={(field, value) => updateSet(s.idx, field, value)}
                                onTriggerTimer={triggerTimer}
                                onSetBw={handleSetBw}
                                onBwValueChange={setInlineBwDraft}
                              />
```

- [ ] **Step 3: Flush the pending draft inside `handleSave`**

Replace the existing `handleSave` function (currently at lines 210–296) with the following. The differences are:
- A pre-flight `effectiveBwKg` computation that awaits a flush of the inline draft when needed.
- All later reads of `userBodyweightKg` inside this function are replaced with `effectiveBwKg`.

```jsx
  const handleSave = async () => {
    if (!activeProgram || !selectedSession || !sets.length) return;

    // Flush any in-progress inline BW draft before evaluating BW state.
    // SetBwPrompt's blur handler already kicks off a save, but we must
    // await the result here so the toast doesn't fire spuriously and the
    // first set's payload uses the right BW.
    let effectiveBwKg = userBodyweightKg;
    if (!effectiveBwKg && inlineBwDraft) {
      const num = parseFloat(inlineBwDraft);
      if (num > 0) {
        await handleSetBw(num);
        effectiveBwKg = displayToKg(num, units);
        setInlineBwDraft('');
      }
    }

    const needsBwButMissing = sets.some((s) => {
      const kind = getBodyweightKind(s.exercise_name, catalogData);
      return (kind === 'pure' || kind === 'weighted_capable')
             && +s.reps_completed > 0
             && !effectiveBwKg;
    });
    if (needsBwButMissing) {
      addToast('Set your bodyweight to log bodyweight exercises.', 'error');
      return;
    }

    const oversizedAdded = sets.some((s) => {
      const kind = getBodyweightKind(s.exercise_name, catalogData);
      if (kind !== 'weighted_capable') return false;
      return parseFloat(s.added_load_kg) > 100;
    });
    if (oversizedAdded) {
      addToast('Added weight > 100 kg. Double-check before lifting!', 'info');
    }

    setSaving(true);
    try {
      const payload = {
        program_id: activeProgram.id,
        week: currentWeek,
        session_name: selectedSession.session_name,
        date: new Date().toISOString().split('T')[0],
        sets: sets
          .filter((s) => {
            const kind = getBodyweightKind(s.exercise_name, catalogData);
            if (kind === 'pure' || kind === 'weighted_capable') {
              return +s.reps_completed > 0;
            }
            return +s.load_kg > 0;
          })
          .map((s) => {
            const kind = getBodyweightKind(s.exercise_name, catalogData);
            let load_kg, added_load_kg;
            if (kind === 'pure') {
              load_kg = effectiveBwKg ?? 0;
              added_load_kg = 0;
            } else if (kind === 'weighted_capable') {
              const added = displayToKg(parseFloat(s.added_load_kg) || 0, units);
              load_kg = (effectiveBwKg ?? 0) + added;
              added_load_kg = added;
            } else {
              load_kg = displayToKg(s.load_kg, units);
              added_load_kg = null;
            }
            return {
              program_exercise_id: s.program_exercise_id,
              set_number: s.set_number,
              load_kg,
              reps_completed: +s.reps_completed,
              rpe_actual: s.rpe_actual ? +s.rpe_actual : null,
              added_load_kg,
              is_dropset: s.is_dropset,
              dropset_load_kg: s.is_dropset && s.dropset_load_kg
                ? displayToKg(s.dropset_load_kg, units)
                : null,
            };
          }),
      };
      const result = await logBulkSession(payload);
      setSaved(true);
      acceptRestore();
      if (result.prs && result.prs.length > 0) {
        setPrList(result.prs);
      }
      if (result.session_log_id) {
        clearTimeout(undoTimerRef.current);
        const savedCopy = [...sets];
        setUndoInfo({ sessionLogId: result.session_log_id, savedSets: savedCopy });
        undoTimerRef.current = setTimeout(() => setUndoInfo(null), 10000);
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 4: Manual smoke test**

This change is hard to unit-test (involves Logger + auth context + catalog + set rows). Run the dev server and verify the flow:

```bash
cd frontend && npm run dev
# in another terminal
cd backend && python -m uvicorn app.main:app --reload --port 8000
```

Then in the browser:
1. Log in as a user with no `bodyweight_kg` set (or wipe yours via Settings → admin reset for testing).
2. Open Logger on a session that includes a bodyweight-class exercise (e.g., a pullup row).
3. Tap "Set BW" on the pullup row, type a value (e.g., `175` in lbs), and *without clicking the green save icon*, click the bottom "Finish session" button.
4. Expected: the workout saves successfully on the first click. The toast about "Set your bodyweight" does NOT appear. Refresh the page and confirm `bodyweight_kg` is now persisted (visible in Body Metrics tab).

- [ ] **Step 5: Commit (ask user first)**

```bash
git add frontend/src/pages/Logger.jsx
git commit -m "fix(logger): flush inline BW draft before main session save"
```

---

## Task 4: Add 24 missing barbell catalog rows

**Files:**
- Modify: `backend/app/seed_catalog.py`

The `seed_exercise_catalog` function is idempotent: it queries for existing `canonical_name` values and only inserts new ones. Adding entries here = those entries land in any DB on next backend startup.

- [ ] **Step 1: Add chest barbell entries**

Open `backend/app/seed_catalog.py`. Insert these 6 entries at the very top of `EXERCISE_CATALOG`, immediately after the `# ── CHEST ──...` comment (line 18) and before the existing `FLAT DB PRESS (HEAVY)` entry:

```python
    {
        "canonical_name": "BARBELL BENCH PRESS",
        "muscle_group_primary": "chest",
        "muscle_groups_secondary": ["triceps", "shoulders"],
        "movement_pattern": "horizontal push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "BENCH PRESS",
        "muscle_group_primary": "chest",
        "muscle_groups_secondary": ["triceps", "shoulders"],
        "movement_pattern": "horizontal push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "PAUSED BENCH PRESS",
        "muscle_group_primary": "chest",
        "muscle_groups_secondary": ["triceps", "shoulders"],
        "movement_pattern": "horizontal push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "CLOSE-GRIP BENCH PRESS",
        "muscle_group_primary": "chest",
        "muscle_groups_secondary": ["triceps"],
        "movement_pattern": "horizontal push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "INCLINE BARBELL PRESS",
        "muscle_group_primary": "chest",
        "muscle_groups_secondary": ["triceps", "shoulders"],
        "movement_pattern": "horizontal push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "INCLINE BARBELL BENCH PRESS",
        "muscle_group_primary": "chest",
        "muscle_groups_secondary": ["triceps", "shoulders"],
        "movement_pattern": "horizontal push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
```

- [ ] **Step 2: Add back barbell row entries**

In `backend/app/seed_catalog.py`, find the back section (search for `"canonical_name": "T-BAR ROW"`) and insert these 2 entries directly before it:

```python
    {
        "canonical_name": "BARBELL ROW",
        "muscle_group_primary": "back",
        "muscle_groups_secondary": ["biceps", "shoulders"],
        "movement_pattern": "horizontal pull",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "BENT-OVER BARBELL ROW",
        "muscle_group_primary": "back",
        "muscle_groups_secondary": ["biceps", "shoulders"],
        "movement_pattern": "horizontal pull",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
```

(If `T-BAR ROW` is in a different location than expected, anchor instead on the `# ── BACK ── ` comment block and insert at the top of that section.)

- [ ] **Step 3: Add quads barbell squat entries**

Find the quads section (search for `# ── QUADS ──`) and insert these 5 entries directly before the existing `HACK SQUAT (HEAVY)` entry:

```python
    {
        "canonical_name": "BARBELL BACK SQUAT",
        "muscle_group_primary": "quads",
        "muscle_groups_secondary": ["glutes", "hamstrings"],
        "movement_pattern": "squat",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "BACK SQUAT",
        "muscle_group_primary": "quads",
        "muscle_groups_secondary": ["glutes", "hamstrings"],
        "movement_pattern": "squat",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "PAUSED BACK SQUAT",
        "muscle_group_primary": "quads",
        "muscle_groups_secondary": ["glutes", "hamstrings"],
        "movement_pattern": "squat",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "FRONT SQUAT",
        "muscle_group_primary": "quads",
        "muscle_groups_secondary": ["glutes", "core"],
        "movement_pattern": "squat",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "SAFETY BAR SQUAT",
        "muscle_group_primary": "quads",
        "muscle_groups_secondary": ["glutes", "hamstrings"],
        "movement_pattern": "squat",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
```

- [ ] **Step 4: Add hamstrings deadlift entries**

Find the hamstrings section (search for `"canonical_name": "ROMANIAN DEADLIFT"`) and insert these 5 entries directly before it:

```python
    {
        "canonical_name": "CONVENTIONAL DEADLIFT",
        "muscle_group_primary": "hamstrings",
        "muscle_groups_secondary": ["back", "glutes"],
        "movement_pattern": "hinge",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "DEADLIFT",
        "muscle_group_primary": "hamstrings",
        "muscle_groups_secondary": ["back", "glutes"],
        "movement_pattern": "hinge",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "SUMO DEADLIFT",
        "muscle_group_primary": "hamstrings",
        "muscle_groups_secondary": ["glutes", "quads"],
        "movement_pattern": "hinge",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "TRAP BAR DEADLIFT",
        "muscle_group_primary": "hamstrings",
        "muscle_groups_secondary": ["glutes", "quads"],
        "movement_pattern": "hinge",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "PAUSED DEADLIFT",
        "muscle_group_primary": "hamstrings",
        "muscle_groups_secondary": ["back", "glutes"],
        "movement_pattern": "hinge",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
```

- [ ] **Step 5: Add shoulders OHP entries**

Find the shoulders section (search for `"canonical_name": "SEATED DB SHOULDER PRESS"`) and insert these 6 entries directly before it:

```python
    {
        "canonical_name": "OVERHEAD PRESS",
        "muscle_group_primary": "shoulders",
        "muscle_groups_secondary": ["triceps", "core"],
        "movement_pattern": "vertical push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "STRICT PRESS",
        "muscle_group_primary": "shoulders",
        "muscle_groups_secondary": ["triceps", "core"],
        "movement_pattern": "vertical push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "BARBELL OVERHEAD PRESS",
        "muscle_group_primary": "shoulders",
        "muscle_groups_secondary": ["triceps", "core"],
        "movement_pattern": "vertical push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "STANDING BARBELL OHP",
        "muscle_group_primary": "shoulders",
        "muscle_groups_secondary": ["triceps", "core"],
        "movement_pattern": "vertical push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "SEATED BARBELL OHP",
        "muscle_group_primary": "shoulders",
        "muscle_groups_secondary": ["triceps"],
        "movement_pattern": "vertical push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
    {
        "canonical_name": "MILITARY PRESS",
        "muscle_group_primary": "shoulders",
        "muscle_groups_secondary": ["triceps", "core"],
        "movement_pattern": "vertical push",
        "equipment": "barbell",
        "is_compound": True,
        "is_unilateral": False,
        "difficulty_level": "intermediate",
    },
```

- [ ] **Step 6: Run existing catalog tests to confirm no regression**

```bash
cd backend
pytest -q tests/test_catalog_bodyweight_kind.py
```

Expected: all 4 existing tests pass. The new entries don't have `bodyweight_kind`, so the "external load null kind" assertion still holds (and will now actually find `BARBELL BENCH PRESS` and `BACK SQUAT` instead of skipping them).

- [ ] **Step 7: Commit (ask user first)**

```bash
git add backend/app/seed_catalog.py
git commit -m "feat(catalog): add foundational barbell lifts (squat/bench/dead/ohp/row)"
```

---

## Task 5: Add catalog completeness regression test

**Files:**
- Create: `backend/tests/test_catalog_completeness.py`

This test guards against future gaps where the rank engine references an exercise name that isn't seeded. It would have caught the squat/bench/dead/OHP/row gap on day one.

- [ ] **Step 1: Write the failing test (would fail without Task 4 done)**

Create `backend/tests/test_catalog_completeness.py` with:

```python
"""Regression test: every exercise name referenced by the muscle rank engine
must exist as a canonical row in the EXERCISE_CATALOG seed list. Otherwise
users can't pick the exercise from the swap modal / custom program builder
even though the rank engine is ready to score it.
"""

from app.muscle_rank_config import (
    EXERCISE_MAP,
    BACK_WEIGHTED_PULLUPS,
    BACK_BODYWEIGHT_PULLUPS,
    ARMS_WEIGHTED_DIPS,
    ARMS_BODYWEIGHT_DIPS,
    ARMS_CLOSE_GRIP_BENCH,
    BACK_ROWS_PULLDOWNS,
)
from app.seed_catalog import EXERCISE_CATALOG


CATALOG_NAMES = {entry["canonical_name"] for entry in EXERCISE_CATALOG}

# Names referenced by the rank engine that we *intentionally* don't catalog
# (e.g. third-party alias forms users may type in but don't pick from a list).
# Add to this set with a comment explaining why before exempting anything.
EXPECTED_MISSING: set[str] = {
    # Pull-up alias variants — the canonical form is "PULLUP" / "WEIGHTED PULLUP".
    "PULL-UP", "PULL UP", "PULLUPS",
    "WEIGHTED PULL-UP", "WEIGHTED PULL UP", "WEIGHTED PULLUPS",
    "WEIGHTED CHIN-UP", "WEIGHTED CHINUP", "WEIGHTED CHIN UP",
    "CHIN-UP", "CHIN UP", "CHINUP",
    "NEUTRAL-GRIP PULLUP", "NEUTRAL GRIP PULLUP",
    # Dip alias variants — canonical is "DIP" / "DIPS" / "WEIGHTED DIP".
    "BODYWEIGHT DIPS", "PARALLEL BAR DIP",
    "WEIGHTED DIPS",
    # Row alias variants
    "DB ROW",
    # Close-grip bench aliases
    "CLOSE GRIP BENCH PRESS", "CLOSEGRIP BENCH PRESS",
    # Lat pulldown aliases (catalog has only LAT PULLDOWN, not the variants)
    "NEUTRAL GRIP LAT PULLDOWN", "2-GRIP LAT PULLDOWN",
    "MACHINE PULLDOWN", "1-ARM HALF KNEELING LAT PULLDOWN",
    # Shoulder press aliases (catalog has SEATED DB SHOULDER PRESS variants)
    "DB SHOULDER PRESS", "MACHINE SHOULDER PRESS",
    # Squat / OHP aliases that are real but already exist as DB equivalents
    # (no exemption — see EXERCISE_MAP keys listed in catalog above)
}


def _all_referenced_names() -> set[str]:
    names: set[str] = set()
    for group, exercises in EXERCISE_MAP.items():
        names.update(exercises.keys())
    names.update(BACK_WEIGHTED_PULLUPS)
    names.update(BACK_BODYWEIGHT_PULLUPS)
    names.update(ARMS_WEIGHTED_DIPS)
    names.update(ARMS_BODYWEIGHT_DIPS)
    names.update(ARMS_CLOSE_GRIP_BENCH)
    names.update(BACK_ROWS_PULLDOWNS.keys())
    return names


def test_every_rank_engine_exercise_is_in_catalog():
    """If the rank engine knows how to score an exercise, the user must be
    able to pick it from the catalog (otherwise the score is unreachable)."""
    referenced = _all_referenced_names()
    missing = referenced - CATALOG_NAMES - EXPECTED_MISSING
    assert not missing, (
        f"Rank engine references exercises that aren't in EXERCISE_CATALOG: "
        f"{sorted(missing)}. Either add them to seed_catalog.py or, if they're "
        f"intentional alias-only lookups, add to EXPECTED_MISSING with a comment."
    )


def test_foundational_barbell_lifts_present():
    """Explicit guard for the foundational barbell lifts — these are what users
    expect to find in the picker."""
    required = [
        "BARBELL BACK SQUAT", "BACK SQUAT", "FRONT SQUAT",
        "BARBELL BENCH PRESS", "BENCH PRESS",
        "CONVENTIONAL DEADLIFT", "DEADLIFT", "SUMO DEADLIFT", "TRAP BAR DEADLIFT",
        "OVERHEAD PRESS", "STRICT PRESS",
        "BARBELL ROW", "BENT-OVER BARBELL ROW",
    ]
    missing = [n for n in required if n not in CATALOG_NAMES]
    assert not missing, f"Foundational barbell lifts missing from catalog: {missing}"
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
cd backend
pytest -q tests/test_catalog_completeness.py
```

Expected: both tests pass (assuming Task 4 is complete; if Task 4 isn't done, this will fail with a clear list of missing names — that's the point).

- [ ] **Step 3: Commit (ask user first)**

```bash
git add backend/tests/test_catalog_completeness.py
git commit -m "test(catalog): regression guard for rank-engine ↔ catalog name parity"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full backend test suite**

```bash
cd backend
pytest -q
```

Expected: per `CLAUDE.md`'s known state — 152 pass, 1 pre-existing unrelated failure (`test_log_bulk_relog_replaces`). The new test_catalog_completeness.py tests should be among the passing ones, total now ~154.

- [ ] **Step 2: Run the full frontend test suite**

```bash
cd frontend
npm test -- --run
```

Expected: all tests pass. The 5 new SetBwPrompt cases plus the 4 pre-existing.

- [ ] **Step 3: Manual frontend smoke (already done in Task 3 step 4)**

If skipped earlier, re-run: log in fresh user, log a pullup row, type BW only, click main Save → expect single-click success.

- [ ] **Step 4: Backend deploy reminder**

Print to the user:

> The catalog change requires a manual Fly.io deploy:
> ```powershell
> cd backend
> flyctl deploy --app gym-tracker-api-bold-violet-7582
> ```
> The seeder will idempotently insert the 24 new canonical rows on lifespan startup.

The frontend change auto-deploys on push to master via Vercel.

---

## Self-review checklist

- [x] Spec coverage: every spec section maps to a task above (Bug 1 → Tasks 1–3; Bug 2 → Task 4; regression test → Task 5; verification → Task 6).
- [x] No placeholders: all code shown verbatim, no "TBD"/"adapt as needed".
- [x] Type/name consistency: `onBwValueChange` is the single name across `SetBwPrompt`, `BwChip`, `PureBwLayout`, `WeightedCapableLayout`, `SetRow`, and `Logger`. `inlineBwDraft` / `setInlineBwDraft` consistent in `Logger.jsx`. `effectiveBwKg` consistent inside the new `handleSave`.
- [x] All 24 catalog entries listed explicitly (chest 6 + back 2 + quads 5 + hamstrings 5 + shoulders 6 = 24).
