# Program & Logger UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a program switcher, an "add exercise" button, a cleaner Logger unit display, and fix the linked-exercise-swap bug.

**Architecture:** Four independent features. Backend adds three new endpoints in `routers/programs.py` (swap-by-id, add-exercise, activate); the swap one replaces the old name-based swap. Frontend wires each through `api/client.js` and touches `Logger.jsx`, `SetRow.jsx`, `useExerciseSwap.js`, `Program.jsx`, and `i18n.js`. No DB schema changes — every logged set still attaches to a real `ProgramExercise` row.

**Tech Stack:** FastAPI + SQLAlchemy (pytest, in-mem SQLite) backend; React 18 + Vite + Tailwind (vitest) frontend.

**Spec:** `docs/superpowers/specs/2026-06-08-program-logger-ux-design.md`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/app/routers/programs.py` | Modify | Replace name-based swap with id-based; add `add-exercise` + `activate` endpoints |
| `backend/tests/test_program_swap_by_id.py` | Create | Swap-by-id isolation tests |
| `backend/tests/test_program_add_exercise.py` | Create | Add-exercise week/all-weeks tests |
| `backend/tests/test_program_activate.py` | Create | Activate one-active-invariant tests |
| `frontend/src/api/client.js` | Modify | `swapExercise` (by id), `addProgramExercise`, `activateProgram` |
| `frontend/src/hooks/useExerciseSwap.js` | Modify | Carry `pe_id`; call id-based swap |
| `frontend/src/pages/Logger.jsx` | Modify | Pass `pe_id` to swap; unit banner; "+ Add exercise" button + scope prompt |
| `frontend/src/components/SetRow.jsx` | Modify | Drop per-field unit labels and "auto" wording |
| `frontend/src/pages/Program.jsx` | Modify | "My Programs" switcher panel + preset surfacing |
| `frontend/src/i18n.js` | Modify | New strings (en + es) |
| `frontend/src/pages/__tests__/Logger.test.jsx` | Modify | Swap-by-id independence test |
| `CLAUDE.md` | Modify | Document the four changes |

---

## FEATURE 4 — Fix the linked-swap bug (ship first)

### Task 1: Backend swap-by-id endpoint

**Files:**
- Modify: `backend/app/routers/programs.py:439-474` (replace `swap_exercise`)
- Test: `backend/tests/test_program_swap_by_id.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_program_swap_by_id.py`:

```python
"""Tests for swap-by-program-exercise-id (de-linked sibling slots)."""

from datetime import date

from app.models import Program, ProgramExercise, User


def _make_program(db, user_id: int) -> Program:
    program = Program(
        user_id=user_id, name="Plan", frequency=3,
        start_date=date.today(), status="active", total_weeks=2,
    )
    db.add(program)
    db.flush()
    # Two weeks. Each "BACK" session has TWO slots with the SAME name.
    for week in (1, 2):
        for e_idx, ex in enumerate(("T BAR ROW", "T BAR ROW"), start=1):
            db.add(ProgramExercise(
                program_id=program.id, week=week, session_name="BACK",
                session_order_in_week=1, exercise_order=e_idx,
                exercise_name_canonical=ex, exercise_name_raw=ex,
                warm_up_sets="0", working_sets=3, prescribed_reps="8-10",
                prescribed_rpe="8", rest_period="2MIN",
            ))
    db.commit()
    db.refresh(program)
    return program


def test_swap_by_id_changes_only_that_row(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    rows = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program.id,
                ProgramExercise.week == 1)
        .order_by(ProgramExercise.exercise_order)
        .all()
    )
    first, second = rows[0], rows[1]

    r = client.patch(
        f"/api/program/{program.id}/exercise/{first.id}/swap",
        json={"new_exercise_name": "SEATED CABLE ROW"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["pe_id"] == first.id

    db.refresh(first)
    db.refresh(second)
    # Only the tapped slot changed; sibling untouched.
    assert first.exercise_name_canonical == "SEATED CABLE ROW"
    assert second.exercise_name_canonical == "T BAR ROW"

    # Week 2 rows are untouched (this-week-only scope).
    wk2 = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program.id,
                ProgramExercise.week == 2)
        .all()
    )
    assert all(x.exercise_name_canonical == "T BAR ROW" for x in wk2)


def test_swap_bad_pe_id_404(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    r = client.patch(
        f"/api/program/{program.id}/exercise/999999/swap",
        json={"new_exercise_name": "X"},
    )
    assert r.status_code == 404


def test_swap_other_users_program_404(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    other = User(name="o", username="other", password_hash="x")
    db.add(other)
    db.flush()
    other_prog = _make_program(db, other.id)
    pe = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == other_prog.id)
        .first()
    )
    # Current user (seeded) tries to swap a row in other's program.
    r = client.patch(
        f"/api/program/{other_prog.id}/exercise/{pe.id}/swap",
        json={"new_exercise_name": "X"},
    )
    assert r.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_program_swap_by_id.py -v`
Expected: FAIL — 404/405 because the `/exercise/{pe_id}/swap` route does not exist yet.

- [ ] **Step 3: Replace the swap endpoint**

In `backend/app/routers/programs.py`, replace the entire `swap_exercise` function (currently at lines 439-474, decorator `@router.patch("/program/{program_id}/exercise/{old_name}")`) with:

```python
@router.patch("/program/{program_id}/exercise/{pe_id}/swap")
def swap_exercise(
    program_id: int,
    pe_id: int,
    body: ExerciseSwap,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Swap a single ProgramExercise slot (this-week-only scope).

    Targets one row by id so two same-named slots in a day are independent.
    """
    program = db.query(Program).filter(
        Program.id == program_id, Program.user_id == current_user.id
    ).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    pe = (
        db.query(ProgramExercise)
        .filter(
            ProgramExercise.id == pe_id,
            ProgramExercise.program_id == program_id,
        )
        .first()
    )
    if not pe:
        raise HTTPException(status_code=404, detail="Exercise slot not found")

    pe.exercise_name_canonical = body.new_exercise_name
    pe.exercise_name_raw = body.new_exercise_name
    db.commit()

    return {
        "status": "swapped",
        "pe_id": pe.id,
        "new_name": body.new_exercise_name,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_program_swap_by_id.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/programs.py backend/tests/test_program_swap_by_id.py
git commit -m "fix(programs): swap exercise by id so same-named slots are independent

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Frontend — wire swap by pe_id

**Files:**
- Modify: `frontend/src/api/client.js:145-149` (`swapExercise`)
- Modify: `frontend/src/hooks/useExerciseSwap.js` (track + send `pe_id`)
- Modify: `frontend/src/pages/Logger.jsx:627-628` (pass `pe_id` to `openSwapModal`)
- Test: `frontend/src/hooks/__tests__/useExerciseSwap.test.js` (update existing — it asserts the OLD signature)

- [ ] **Step 1: Update the client function**

In `frontend/src/api/client.js`, replace the `swapExercise` export (lines 145-149):

```javascript
export const swapExercise = (programId, peId, newName) =>
  request(`/program/${programId}/exercise/${peId}/swap`, {
    method: 'PATCH',
    body: JSON.stringify({ new_exercise_name: newName }),
  });
```

- [ ] **Step 2: Update the swap hook to carry pe_id**

In `frontend/src/hooks/useExerciseSwap.js`:

Replace the `swapTarget` state declaration (line 18) with a two-field target:

```javascript
  const [swapTarget, setSwapTarget] = useState(null); // display name (for modal copy + filter)
  const [swapPeId, setSwapPeId] = useState(null);     // the exact slot to swap
```

Change `openSwapModal` (line 24) signature and first line:

```javascript
  const openSwapModal = async (exerciseName, peId) => {
    setSwapTarget(exerciseName);
    setSwapPeId(peId ?? null);
    setSwapSearch('');
    setShowAllMuscleGroups(false);
```

In `handleSwapSelect` (line 51), replace the guard + swap call:

```javascript
  const handleSwapSelect = async (newName) => {
    if (!activeProgram || swapPeId == null || newName === swapTarget) return;
    try {
      await swapExercise(activeProgram.id, swapPeId, newName);
```

In the `finally` block of `handleSwapSelect` (lines 70-73) and in `closeSwapModal` (lines 76-79), also clear `swapPeId`:

```javascript
    } finally {
      setSwapTarget(null);
      setSwapPeId(null);
      setSwapSearch('');
    }
  };

  const closeSwapModal = () => {
    setSwapTarget(null);
    setSwapPeId(null);
    setSwapSearch('');
  };
```

- [ ] **Step 3: Pass pe_id from the swap button**

In `frontend/src/pages/Logger.jsx`, the swap button (lines 627-628) currently reads:

```javascript
                          <button
                            onClick={() => openSwapModal(group.name)}
```

Change it to:

```javascript
                          <button
                            onClick={() => openSwapModal(group.name, group.pe_id)}
```

- [ ] **Step 4: Update the existing swap hook test**

The existing `frontend/src/hooks/__tests__/useExerciseSwap.test.js` asserts the OLD
name-based signature at line 69:
`expect(swapExercise).toHaveBeenCalledWith(7, 'BARBELL ROW', 'BENT-OVER BARBELL ROW');`.
This will now fail. Update it to thread a `pe_id` and assert the new id-based signature.

Change every `openSwapModal('BARBELL ROW')` call in this file to pass a pe_id —
use the schedule row's id `99` (defined in `setupHook`):

```javascript
    await act(async () => { await hook.result.current.openSwapModal('BARBELL ROW', 99); });
```

(there are three such calls — one per `it` block). Then change the assertion in the
first test (line 69) to:

```javascript
    expect(swapExercise).toHaveBeenCalledWith(7, 99, 'BENT-OVER BARBELL ROW');
```

Add one new test that proves a sibling slot with the same name but a different pe_id is
not the one swapped:

```javascript
  it('swaps by the pe_id passed to openSwapModal, not by exercise name', async () => {
    const { hook } = setupHook();
    // Two same-named slots: tapping the one whose pe_id is 99 must send 99.
    await act(async () => { await hook.result.current.openSwapModal('BARBELL ROW', 99); });
    await act(async () => { await hook.result.current.handleSwapSelect('SEATED CABLE ROW'); });
    expect(swapExercise).toHaveBeenCalledWith(7, 99, 'SEATED CABLE ROW');
    expect(swapExercise).not.toHaveBeenCalledWith(7, expect.anything(), 'BARBELL ROW');
  });
```

The other two existing tests ("drops the swapped-out exercise rows from sets" and
"refreshes the schedule…") keep working unchanged once their `openSwapModal` calls pass
`99` — they assert on `setSets`/`setSessions`, not on the swap signature.

- [ ] **Step 5: Run frontend tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS (including the new test).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.js frontend/src/hooks/useExerciseSwap.js frontend/src/pages/Logger.jsx frontend/src/pages/__tests__/Logger.test.jsx
git commit -m "fix(logger): send program_exercise_id when swapping so siblings de-link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## FEATURE 3 — Logger display cleanup

### Task 3: One unit banner + drop per-field unit labels

**Files:**
- Modify: `frontend/src/components/SetRow.jsx` (labels)
- Modify: `frontend/src/pages/Logger.jsx` (add banner above `displayGroups.map`, ~line 591)
- Modify: `frontend/src/i18n.js` (add `logger.weightsInUnit`, en + es)
- Test: `frontend/src/components/__tests__/SetRow.test.jsx` (MODIFY — it exists and line 30 looks up the weight field by `/kg/i`, which breaks)

- [ ] **Step 1: Add i18n strings**

In `frontend/src/i18n.js`, in the **en** block after `'logger.addSet': 'Add set',` (line 149) add:

```javascript
    'logger.weightsInUnit': 'Weights in {unit}',
    'logger.weightCol': 'Weight',
    'logger.addedCol': 'Added',
    'logger.addExercise': 'Add exercise',
    'logger.addForTodayOnly': 'Today only',
    'logger.addPermanently': 'Add to program',
    'logger.addScopePrompt': 'Add this exercise just for today, or permanently to the program?',
```

In the **es** block, after the Spanish `'logger.dropset'`/`'logger.addDropset'` group (around line 558-560) add:

```javascript
    'logger.weightsInUnit': 'Pesos en {unit}',
    'logger.weightCol': 'Peso',
    'logger.addedCol': 'Añadido',
    'logger.addExercise': 'Añadir ejercicio',
    'logger.addForTodayOnly': 'Solo hoy',
    'logger.addPermanently': 'Añadir al programa',
    'logger.addScopePrompt': '¿Añadir este ejercicio solo por hoy o de forma permanente al programa?',
```

> If `t()` in this codebase does not interpolate `{unit}`, render the banner with a literal template in the JSX (Step 3) instead of relying on interpolation.

- [ ] **Step 2: Strip unit labels in SetRow**

In `frontend/src/components/SetRow.jsx`:

`ExternalLayout` — the weight `<label>` (lines 9-11) currently:

```javascript
        <label htmlFor={`load-${set.set_number}`} className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          {unitLabel}{weightHint ? ` ${weightHint}` : ''}
        </label>
```

Replace the label text with a unit-free `Weight` (keep the hint):

```javascript
        <label htmlFor={`load-${set.set_number}`} className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          Weight{weightHint ? ` ${weightHint}` : ''}
        </label>
```

`PureBwLayout` — the BW span (lines 48-50):

```javascript
        <span className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          BW (auto, {unitLabel})
        </span>
```

Replace with:

```javascript
        <span className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          BW
        </span>
```

`WeightedCapableLayout` — the BW span (lines 74-76) → same `BW` replacement as above. And the "Added" label (lines 80-82):

```javascript
          <label htmlFor={`added-${set.set_number}`} className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
            Added {unitLabel}
          </label>
```

Replace with:

```javascript
          <label htmlFor={`added-${set.set_number}`} className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
            Added
          </label>
```

Leave the `Total: {totalDisplay} {unitLabel}` helper line (lines 98-102) unchanged — it is a summary, not a field label. In the drop-set block in `Logger.jsx` (line 685), change `Drop {unitLabel}` to `Drop` for consistency:

```javascript
                                    <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-warning/70 pointer-events-none">Drop</label>
```

- [ ] **Step 3: Add the unit banner in Logger**

In `frontend/src/pages/Logger.jsx`, immediately before the `{displayGroups.map((dg, dgIdx) => (` line (line 591), inside the `<>` fragment that opens at line 590, insert:

```javascript
              <p className="text-[11px] uppercase tracking-wider text-text-muted mb-2">
                {t('logger.weightsInUnit').replace('{unit}', unitLabel)}
              </p>
```

- [ ] **Step 4: Update the existing SetRow test**

The existing `frontend/src/components/__tests__/SetRow.test.jsx` line 30 reads:

```javascript
    expect(screen.getByLabelText(/kg/i)).toBeInTheDocument();
```

After the cleanup, the external weight field is labeled `Weight` (no unit), so this
breaks. Replace that line with:

```javascript
    expect(screen.getByLabelText(/weight/i)).toBeInTheDocument();
```

Then append two new tests inside the existing `describe('SetRow', ...)` block to lock in
the cleanup:

```javascript
  it('external layout label has no unit text', () => {
    renderRow({ bodyweightKind: null, unitLabel: 'lbs', units: 'lbs' });
    expect(screen.getByLabelText(/^weight$/i)).toBeInTheDocument();
    expect(screen.queryByText(/lbs/i)).not.toBeInTheDocument();
  });

  it('pure-BW chip shows "BW" with no "auto" wording', () => {
    renderRow({ bodyweightKind: 'pure', userBodyweightKg: 80, unitLabel: 'lbs', units: 'lbs' });
    expect(screen.getByText(/^BW$/)).toBeInTheDocument();
    expect(screen.queryByText(/auto/i)).not.toBeInTheDocument();
  });
```

> Note: the weighted-capable layout test at line 41-51 checks `getByText(/total/i)` and the
> `Added` field by `getByLabelText(/added/i)` — both still pass since the `Added` label and
> the `Total:` helper line are unchanged.

- [ ] **Step 5: Run frontend tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SetRow.jsx frontend/src/pages/Logger.jsx frontend/src/i18n.js frontend/src/components/__tests__/SetRow.test.jsx
git commit -m "feat(logger): show weight unit once at top; drop per-field unit + 'auto' labels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## FEATURE 2 — Add-exercise button

### Task 4: Backend add-exercise endpoint

**Files:**
- Modify: `backend/app/routers/programs.py` (new model + endpoint near the other program routes)
- Test: `backend/tests/test_program_add_exercise.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_program_add_exercise.py`:

```python
"""Tests for adding an exercise to a session (week-only vs all-weeks)."""

from datetime import date

from app.models import Program, ProgramExercise, User


def _make_program(db, user_id: int) -> Program:
    program = Program(
        user_id=user_id, name="Plan", frequency=3,
        start_date=date.today(), status="active", total_weeks=3,
    )
    db.add(program)
    db.flush()
    for week in (1, 2, 3):
        for e_idx, ex in enumerate(("BENCH PRESS", "INCLINE DB PRESS"), start=1):
            db.add(ProgramExercise(
                program_id=program.id, week=week, session_name="PUSH",
                session_order_in_week=1, exercise_order=e_idx,
                exercise_name_canonical=ex, exercise_name_raw=ex,
                warm_up_sets="0", working_sets=3, prescribed_reps="8-10",
                prescribed_rpe="8", rest_period="2MIN",
            ))
    db.commit()
    db.refresh(program)
    return program


def test_add_exercise_week_scope_inserts_one_row(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    r = client.post(
        f"/api/program/{program.id}/exercise",
        json={"week": 2, "session_name": "PUSH",
              "exercise_name": "CABLE FLY", "scope": "week"},
    )
    assert r.status_code == 201, r.text
    rows = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program.id,
                ProgramExercise.exercise_name_canonical == "CABLE FLY")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].week == 2
    assert rows[0].session_name == "PUSH"
    # appended after the two existing slots
    assert rows[0].exercise_order == 3
    assert rows[0].session_order_in_week == 1


def test_add_exercise_all_weeks_inserts_per_week(client, db):
    user = db.query(User).first()
    program = _make_program(db, user.id)
    r = client.post(
        f"/api/program/{program.id}/exercise",
        json={"week": 2, "session_name": "PUSH",
              "exercise_name": "CABLE FLY", "scope": "all_weeks"},
    )
    assert r.status_code == 201, r.text
    rows = (
        db.query(ProgramExercise)
        .filter(ProgramExercise.program_id == program.id,
                ProgramExercise.exercise_name_canonical == "CABLE FLY")
        .all()
    )
    assert {x.week for x in rows} == {1, 2, 3}
    assert all(x.exercise_order == 3 for x in rows)


def test_add_exercise_other_users_program_404(client, db):
    user = db.query(User).first()
    other = User(name="o", username="other2", password_hash="x")
    db.add(other)
    db.flush()
    program = _make_program(db, other.id)
    r = client.post(
        f"/api/program/{program.id}/exercise",
        json={"week": 1, "session_name": "PUSH",
              "exercise_name": "CABLE FLY", "scope": "week"},
    )
    assert r.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_program_add_exercise.py -v`
Expected: FAIL — route `POST /program/{id}/exercise` does not exist (404/405).

- [ ] **Step 3: Add the payload model**

In `backend/app/routers/programs.py`, after the `ExerciseSwap` class (line 30-32), add:

```python
class AddExercisePayload(BaseModel):
    week: int
    session_name: str
    exercise_name: str
    scope: str = "week"  # "week" or "all_weeks"
```

- [ ] **Step 4: Add the endpoint**

In `backend/app/routers/programs.py`, add this function right after the `swap_exercise` function:

```python
@router.post("/program/{program_id}/exercise", status_code=201)
def add_exercise(
    program_id: int,
    body: AddExercisePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Append an exercise to a session, for the current week or all weeks.

    Both scopes create real ProgramExercise rows because WorkoutLog requires a
    non-null program_exercise_id. "week" adds the exercise to one week only;
    "all_weeks" adds it to every week that already contains the session.
    """
    program = db.query(Program).filter(
        Program.id == program_id, Program.user_id == current_user.id
    ).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    if body.scope == "all_weeks":
        target_weeks = [
            w for (w,) in db.query(ProgramExercise.week)
            .filter(ProgramExercise.program_id == program_id,
                    ProgramExercise.session_name == body.session_name)
            .distinct()
            .all()
        ]
    else:
        target_weeks = [body.week]

    if not target_weeks:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{body.session_name}' not found in program",
        )

    created = []
    for week in target_weeks:
        existing = (
            db.query(ProgramExercise)
            .filter(ProgramExercise.program_id == program_id,
                    ProgramExercise.week == week,
                    ProgramExercise.session_name == body.session_name)
            .all()
        )
        if not existing:
            continue
        next_order = max(e.exercise_order for e in existing) + 1
        session_order = existing[0].session_order_in_week
        pe = ProgramExercise(
            program_id=program_id,
            week=week,
            session_name=body.session_name,
            session_order_in_week=session_order,
            exercise_order=next_order,
            exercise_name_canonical=body.exercise_name,
            exercise_name_raw=body.exercise_name,
            warm_up_sets="0",
            working_sets=3,
            prescribed_reps="8-12",
            prescribed_rpe=None,
            rest_period=None,
        )
        db.add(pe)
        created.append(pe)
    db.commit()
    for pe in created:
        db.refresh(pe)

    return {
        "status": "added",
        "scope": body.scope,
        "created_ids": [pe.id for pe in created],
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_program_add_exercise.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/programs.py backend/tests/test_program_add_exercise.py
git commit -m "feat(programs): add-exercise endpoint with week vs all-weeks scope

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Frontend add-exercise UI

**Files:**
- Modify: `frontend/src/api/client.js` (add `addProgramExercise`)
- Modify: `frontend/src/pages/Logger.jsx` (button + scope prompt + catalog picker reuse)

- [ ] **Step 1: Add the client function**

In `frontend/src/api/client.js`, near `swapExercise`, add:

```javascript
export const addProgramExercise = (programId, { week, session_name, exercise_name, scope }) =>
  request(`/program/${programId}/exercise`, {
    method: 'POST',
    body: JSON.stringify({ week, session_name, exercise_name, scope }),
  });
```

- [ ] **Step 2: Import and add a small add-exercise hook state in Logger**

In `frontend/src/pages/Logger.jsx`:

Add `addProgramExercise` to the existing import from `../api/client`.

Add state near the other `useState` declarations (top of the `Logger` component body):

```javascript
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [addExerciseSearch, setAddExerciseSearch] = useState('');
  const [pendingAddName, setPendingAddName] = useState(null); // name chosen, awaiting scope choice
```

- [ ] **Step 3: Add the handler**

In `frontend/src/pages/Logger.jsx`, add a handler in the component body (near `handleSetBw`/other handlers). It reuses `catalogData` (already loaded for swaps) and the schedule refetch pattern from `useExerciseSwap`:

```javascript
  const confirmAddExercise = async (scope) => {
    if (!activeProgram || !selectedSession || !pendingAddName) return;
    try {
      await addProgramExercise(activeProgram.id, {
        week: currentWeek,
        session_name: selectedSession.session_name,
        exercise_name: pendingAddName,
        scope,
      });
      const scheduleRes = await getSchedule(activeProgram.id);
      setScheduleData(scheduleRes);
      const flatSessions = flattenScheduleForWeek(scheduleRes, currentWeek);
      setSessions(flatSessions);
      const match = flatSessions.find(
        (s) => s.session_name === selectedSession.session_name
      );
      if (match) setSelectedSession(match);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setPendingAddName(null);
      setAddExerciseOpen(false);
      setAddExerciseSearch('');
    }
  };
```

> Implementer note: `getSchedule`, `flattenScheduleForWeek`, `setScheduleData`, `setSessions`, `setSelectedSession`, `currentWeek`, `addToast` are all already in scope in `Logger.jsx` (the swap flow uses them via the hook; confirm imports — `flattenScheduleForWeek` is exported from `../hooks/useLoggerSession` and `getSchedule` from `../api/client`). Add any missing import.

- [ ] **Step 4: Add the "+ Add exercise" button**

In `frontend/src/pages/Logger.jsx`, after the `displayGroups.map(...)` block closes (after line 737, the `))}` that ends the map) and before the sticky Save `<div className="sticky bottom-4 z-10">` (line 740), insert:

```javascript
              <button
                type="button"
                onClick={() => { setAddExerciseOpen(true); openSwapModal(null, null); }}
                className="w-full mb-3 flex items-center justify-center gap-1.5 text-xs text-text-muted hover:text-accent-light border border-dashed border-surface-lighter hover:border-accent/40 rounded-lg py-3 transition-colors touch-manipulation"
              >
                <Plus size={14} /> {t('logger.addExercise')}
              </button>
```

> The `openSwapModal(null, null)` call pre-loads `catalogData` (its first branch fetches the catalog when empty). We render our own picker below rather than the swap modal, so guard the swap modal to stay closed when `swapTarget == null` (it already only renders `{swapTarget && (...)}`, so passing `null` keeps it closed while still warming the catalog). If reusing `openSwapModal` for its side effect feels indirect, instead call `getExerciseCatalog()` directly here and `setCatalogData`.

- [ ] **Step 5: Add the picker + scope modal**

In `frontend/src/pages/Logger.jsx`, after the existing Swap Modal block (after the `{swapTarget && ( ... )}` closes near line 760), add:

```javascript
      {/* Add-exercise picker */}
      {addExerciseOpen && pendingAddName == null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => { setAddExerciseOpen(false); setAddExerciseSearch(''); }}>
          <div className="bg-surface border border-surface-lighter rounded-2xl p-4 sm:p-5 max-w-sm w-full shadow-2xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-text">{t('logger.addExercise')}</h3>
              <button onClick={() => { setAddExerciseOpen(false); setAddExerciseSearch(''); }}
                className="text-text-muted hover:text-text p-1 touch-manipulation">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Search exercises..."
              value={addExerciseSearch}
              onChange={(e) => setAddExerciseSearch(e.target.value)}
              autoFocus
              className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:ring-1 focus:ring-accent outline-none mb-3"
            />
            <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-0.5">
              {catalogData
                .map((ex) => (typeof ex === 'string' ? ex : ex.name || ex.exercise_name || ''))
                .filter((name) => name && name.toLowerCase().includes(addExerciseSearch.toLowerCase()))
                .slice(0, 60)
                .map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPendingAddName(name)}
                    className="w-full text-left px-3 py-2.5 min-h-[44px] rounded-lg text-sm text-text hover:bg-surface-light transition-colors touch-manipulation"
                  >
                    {name}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Add-exercise scope prompt */}
      {pendingAddName != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setPendingAddName(null)}>
          <div className="bg-surface border border-surface-lighter rounded-2xl p-5 max-w-xs w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-text mb-1 font-semibold">{pendingAddName}</p>
            <p className="text-xs text-text-muted mb-4">{t('logger.addScopePrompt')}</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => confirmAddExercise('week')}
                className="w-full rounded-lg border border-accent/40 bg-surface-light hover:bg-surface-lighter px-3 py-2.5 text-sm font-medium touch-manipulation"
              >
                {t('logger.addForTodayOnly')}
              </button>
              <button
                type="button"
                onClick={() => confirmAddExercise('all_weeks')}
                className="w-full rounded-lg border border-accent/40 bg-surface-light hover:bg-surface-lighter px-3 py-2.5 text-sm font-medium touch-manipulation"
              >
                {t('logger.addPermanently')}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Manual verification**

Run: `cd frontend && npm run dev`, open the Logger, tap **+ Add exercise**, choose an exercise, pick **Today only** → it appears with empty set rows in the current session; reload and confirm it persists for this week. Repeat with **Add to program** and switch weeks to confirm it appears in other weeks.

- [ ] **Step 7: Run frontend tests + commit**

Run: `cd frontend && npm test -- --run`
Expected: PASS (no regressions).

```bash
git add frontend/src/api/client.js frontend/src/pages/Logger.jsx
git commit -m "feat(logger): add-exercise button with today-only vs permanent scope

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## FEATURE 1 — Program switcher + preset surfacing

### Task 6: Backend activate endpoint

**Files:**
- Modify: `backend/app/routers/programs.py` (new endpoint near `update_program_status`)
- Test: `backend/tests/test_program_activate.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_program_activate.py`:

```python
"""Tests for the one-active-invariant activate endpoint."""

from datetime import date

from app.models import Program, User


def _prog(db, user_id, name, status):
    p = Program(user_id=user_id, name=name, frequency=3,
                start_date=date.today(), status=status, total_weeks=4)
    db.add(p)
    db.flush()
    return p


def test_activate_pauses_other_active(client, db):
    user = db.query(User).first()
    a = _prog(db, user.id, "A", "active")
    b = _prog(db, user.id, "B", "paused")
    db.commit()

    r = client.post(f"/api/program/{b.id}/activate")
    assert r.status_code == 200, r.text

    db.refresh(a)
    db.refresh(b)
    assert b.status == "active"
    assert a.status == "paused"


def test_activate_already_active_noop(client, db):
    user = db.query(User).first()
    a = _prog(db, user.id, "A", "active")
    db.commit()
    r = client.post(f"/api/program/{a.id}/activate")
    assert r.status_code == 200
    db.refresh(a)
    assert a.status == "active"


def test_activate_other_users_program_404(client, db):
    user = db.query(User).first()
    other = User(name="o", username="other3", password_hash="x")
    db.add(other)
    db.flush()
    p = _prog(db, other.id, "X", "paused")
    db.commit()
    r = client.post(f"/api/program/{p.id}/activate")
    assert r.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_program_activate.py -v`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Add the endpoint**

In `backend/app/routers/programs.py`, add after `update_program_status` (after line 436):

```python
@router.post("/program/{program_id}/activate")
def activate_program(
    program_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Make this program the active one; pause any other active program."""
    program = db.query(Program).filter(
        Program.id == program_id, Program.user_id == current_user.id
    ).first()
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    others = (
        db.query(Program)
        .filter(
            Program.user_id == current_user.id,
            Program.id != program_id,
            Program.status == "active",
        )
        .all()
    )
    for other in others:
        other.status = "paused"
    program.status = "active"
    db.commit()

    return {"status": "activated", "program_id": program_id}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_program_activate.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/programs.py backend/tests/test_program_activate.py
git commit -m "feat(programs): activate endpoint enforcing one-active invariant

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend — "My Programs" switcher panel

**Files:**
- Modify: `frontend/src/api/client.js` (add `activateProgram`)
- Modify: `frontend/src/pages/Program.jsx` (panel)

- [ ] **Step 1: Add the client function**

In `frontend/src/api/client.js`, near `updateProgramStatus`, add:

```javascript
export const activateProgram = (id) =>
  request(`/program/${id}/activate`, { method: 'POST' });
```

- [ ] **Step 2: Wire state + handler in Program.jsx**

In `frontend/src/pages/Program.jsx`:

Add `activateProgram` to the import from `../api/client`. Pull `programs` from `useApp()` (line 27 currently destructures `{ activeProgram, refreshPrograms }`):

```javascript
  const { activeProgram, programs, refreshPrograms } = useApp();
```

Add a handler in the component body:

```javascript
  const handleActivate = async (id) => {
    try {
      await activateProgram(id);
      await refreshPrograms();
    } catch (err) {
      setError(err.message || 'Failed to switch program');
    }
  };
```

- [ ] **Step 3: Render the "My Programs" panel**

In `frontend/src/pages/Program.jsx`, render this panel near the top of the page content (both the active and no-active branches should show it — place it where the page renders its main column; if the no-active branch returns early at line 127, add the panel there too, or lift it above the early return). Use the existing `Card` and `STATUS_STYLES`:

```jsx
      {programs && programs.length > 0 && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold mb-3">My Programs</h3>
          <div className="space-y-2">
            {programs.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-lighter px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-text-muted">{p.frequency}x / week</p>
                </div>
                {p.status === 'active' ? (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES.active}`}>
                    Active
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleActivate(p.id)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-accent/40 bg-surface-light hover:bg-surface-lighter touch-manipulation"
                  >
                    Activate
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
```

> Implementer note: confirm `Card` is imported in `Program.jsx`. The no-active early return (line 127) already renders `NippardPresetPicker`; keep that, and ensure this "My Programs" panel renders above or alongside it so switching + presets sit together. If `Program.jsx` returns early when `!activeProgram`, place the panel before that `return` so it shows in both states.

- [ ] **Step 4: Manual verification**

Run: `cd frontend && npm run dev`. With 2+ imported programs, open the Program page, confirm the list shows all programs with one "Active" chip; click **Activate** on a paused one and confirm it becomes active (and the previously-active one flips to paused after refresh).

- [ ] **Step 5: Run frontend tests + commit**

Run: `cd frontend && npm test -- --run`
Expected: PASS.

```bash
git add frontend/src/api/client.js frontend/src/pages/Program.jsx
git commit -m "feat(program): My Programs panel to switch active program

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Update documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a notes section**

In `CLAUDE.md`, add a dated section documenting:
- Exercise swap is now **by `program_exercise_id`** and **this-week-only** (was name-based, all-weeks). Endpoint: `PATCH /api/program/{id}/exercise/{pe_id}/swap`.
- New `POST /api/program/{id}/exercise` (add exercise; `scope: "week" | "all_weeks"`).
- New `POST /api/program/{id}/activate` (switch active program, pauses others).
- Logger shows the weight unit once at the top; per-field unit labels and the "auto" wording were removed.

- [ ] **Step 2: Run the full backend + frontend suites**

Run: `cd backend && python -m pytest -q`
Expected: prior pass count + 9 new backend tests pass (1 pre-existing unrelated failure `test_log_bulk_relog_replaces` may remain).

Run: `cd frontend && npm test -- --run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: program switcher, add-exercise, swap-by-id, logger unit cleanup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Deployment reminder

The backend changes require a manual Fly.io deploy after merge (Vercel auto-deploys the frontend). Print for the user:

```powershell
cd backend
flyctl deploy --app gym-tracker-api-bold-violet-7582
```
