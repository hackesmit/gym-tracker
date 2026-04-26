# Bodyweight Input + Back-Rank Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the WEIGHTED PULLUP input ambiguity that caused Aragorn's Champion-back rank, ship a clean BW input UX (auto-fill BW from user's recorded bodyweight, two-field layout for weighted-capable lifts), migrate historical bad data with a one-click rollback, add an interim size-bonus multiplier for fairer ranking across bodyweights, and rebuild the unreliable draft-restore flow.

**Architecture:** Approach A from the spec — `WorkoutLog.load_kg` becomes "effective load" (BW + plate for bodyweight-class lifts), new column `added_load_kg` captures the plate-only number. Catalog gains `bodyweight_kind` flag (`pure` / `weighted_capable` / `NULL`). One-shot migration audits + corrects historical logs into a `bw_migration_audit` table with a rollback endpoint. Rank engine reads `added_load_kg` directly and applies a `size_bonus()` multiplier (back/arms only). Frontend Logger renders a `<SetRow>` per exercise in one of three layouts. Draft restore extracted into `useWorkoutDraft` hook with TTL + session-aware key handling.

**Tech Stack:** FastAPI + SQLAlchemy ORM (Postgres prod / in-memory SQLite for tests), pytest, React 18 + Vite + Tailwind, Vitest.

**Spec:** [docs/superpowers/specs/2026-04-25-bodyweight-input-and-back-rank-fix-design.md](../specs/2026-04-25-bodyweight-input-and-back-rank-fix-design.md)

## Test commands

```bash
# Backend (run from repo root)
cd backend && python -m pytest tests/ -q                 # all tests
cd backend && python -m pytest tests/test_ranks.py -v    # one file
cd backend && python -m pytest tests/test_bw_migration.py::test_aragorn_correction -v   # one test

# Frontend (run from repo root)
cd frontend && npm test -- --run                          # all tests
cd frontend && npm test -- --run useWorkoutDraft          # filter
```

## Conventions

- Backend tests use the `db` and `client` fixtures from `backend/tests/conftest.py` (in-memory SQLite, fresh per test, seeded `testuser`).
- Backend migrations always use `_ensure_column(table, column, col_type, default=…)` from `backend/app/main.py:44` — never raw `ALTER TABLE`. New tables go through `Base.metadata.create_all(bind=engine)` (already called in lifespan).
- Frontend tests live in `frontend/src/__tests__/` (Vitest auto-discovers `*.test.{js,jsx}`).
- Commit after each task using `feat:` / `fix:` / `chore:` prefixes. Never amend; always create new commits. Hooks must not be skipped.
- Local dev: `flyctl deploy` is **never** run from this environment — see `CLAUDE.md`. After this plan completes, the user runs the deploy themselves.

---

## Phase 1 — Backend foundations (schema + pure helpers)

### Task 1: Add `WorkoutLog.added_load_kg` column + migration

**Files:**
- Modify: `backend/app/models.py:133-156` (WorkoutLog class)
- Modify: `backend/app/main.py:62-68` (workout_logs migrations block)
- Test: `backend/tests/test_workout_log_schema.py` (new)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_workout_log_schema.py
"""Schema-level tests for the new added_load_kg column."""

from datetime import date

from app.models import (
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)


def _make_pe(db, user_id):
    """Helper: create a program + program_exercise so WorkoutLog FK is satisfied."""
    program = Program(user_id=user_id, name="P", frequency=3, start_date=date.today(), total_weeks=1)
    db.add(program)
    db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="S",
        exercise_order=1, exercise_name_raw="X", exercise_name_canonical="X",
        prescribed_sets="3", working_sets=3,
    )
    db.add(pe)
    db.commit()
    return pe


def test_workout_log_added_load_kg_defaults_to_null(db):
    user = db.query(User).first()
    pe = _make_pe(db, user.id)
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id,
        date=date.today(), set_number=1,
        load_kg=100.0, reps_completed=5,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    assert log.added_load_kg is None


def test_workout_log_added_load_kg_round_trip(db):
    user = db.query(User).first()
    pe = _make_pe(db, user.id)
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id,
        date=date.today(), set_number=1,
        load_kg=105.0, reps_completed=5, added_load_kg=25.0,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    assert log.added_load_kg == 25.0
    assert log.load_kg == 105.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_workout_log_schema.py -v`
Expected: FAIL with `AttributeError: 'WorkoutLog' object has no attribute 'added_load_kg'` or a SQLAlchemy "unknown column" error.

- [ ] **Step 3: Add the column to the model**

Edit `backend/app/models.py` — after the `dropset_load_kg` line in `WorkoutLog`, add:

```python
    added_load_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
```

- [ ] **Step 4: Add the migration**

Edit `backend/app/main.py` — inside `_run_migrations()`, in the workout_logs block, add this line after the existing workout_logs `_ensure_column` calls (around line 68):

```python
    _ensure_column("workout_logs", "added_load_kg", "FLOAT", nullable=True)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_workout_log_schema.py -v`
Expected: both tests PASS.

- [ ] **Step 6: Run the full backend suite to confirm no regressions**

Run: `cd backend && python -m pytest tests/ -q`
Expected: 55+ pass / 1 pre-existing unrelated failure (`test_log_bulk_relog_replaces` per CLAUDE.md).

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/app/main.py backend/tests/test_workout_log_schema.py
git commit -m "feat(models): add WorkoutLog.added_load_kg column

Stores the added-load (plate) component of bodyweight-class lifts.
NULL for external-load lifts (barbell, DB, machine). 0 for pure-BW
sets (pushup, ab work). >0 for weighted-capable sets (weighted pullup).

load_kg semantics now mean 'effective load' (BW + plate for bodyweight
class). Reads via SQLAlchemy ORM. Migration added to _run_migrations."
```

---

### Task 2: Add `ExerciseCatalog.bodyweight_kind` column + migration

**Files:**
- Modify: `backend/app/models.py:119-130` (ExerciseCatalog class)
- Modify: `backend/app/main.py` (add to `_run_migrations`)
- Test: extend `backend/tests/test_workout_log_schema.py` with a catalog test

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_workout_log_schema.py`:

```python
from app.models import ExerciseCatalog


def test_exercise_catalog_bodyweight_kind_defaults_to_null(db):
    cat = ExerciseCatalog(
        canonical_name="TEST_PUSHUP",
        muscle_group_primary="chest",
        movement_pattern="horizontal push",
        equipment="bodyweight",
        difficulty_level="beginner",
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    assert cat.bodyweight_kind is None


def test_exercise_catalog_bodyweight_kind_accepts_enum_values(db):
    for kind in ("pure", "weighted_capable"):
        cat = ExerciseCatalog(
            canonical_name=f"TEST_{kind}",
            muscle_group_primary="back",
            movement_pattern="vertical pull",
            equipment="bodyweight",
            difficulty_level="advanced",
            bodyweight_kind=kind,
        )
        db.add(cat)
    db.commit()
    rows = db.query(ExerciseCatalog).filter(ExerciseCatalog.canonical_name.like("TEST_%")).all()
    kinds = {r.bodyweight_kind for r in rows}
    assert "pure" in kinds and "weighted_capable" in kinds
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_workout_log_schema.py::test_exercise_catalog_bodyweight_kind_defaults_to_null -v`
Expected: FAIL with attribute / column error.

- [ ] **Step 3: Add the column to the model**

Edit `backend/app/models.py` `ExerciseCatalog` (around line 130, after `difficulty_level`):

```python
    bodyweight_kind: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 4: Add the migration**

In `backend/app/main.py` `_run_migrations()`, add a new section after the `programs` block (around line 71):

```python
    # exercise_catalog: bodyweight_kind drives the new Logger input layout
    # (pure / weighted_capable / NULL). Backfill values are set in
    # seed_catalog.py and a one-shot UPDATE in this same function — see
    # _backfill_catalog_bodyweight_kind() below.
    _ensure_column("exercise_catalog", "bodyweight_kind", "VARCHAR")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_workout_log_schema.py -v`
Expected: all four tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/main.py backend/tests/test_workout_log_schema.py
git commit -m "feat(models): add ExerciseCatalog.bodyweight_kind column

Drives the new Logger input layout (pure | weighted_capable | NULL).
Backfill values live in seed_catalog.py (next task)."
```

---

### Task 3: Add `bw_migration_audit` and `migration_log` tables

**Files:**
- Modify: `backend/app/models.py` (append two new model classes)
- Test: `backend/tests/test_bw_migration_audit_table.py` (new)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_bw_migration_audit_table.py
"""Schema test for the new audit + migration_log tables."""

from datetime import datetime

from app.models import BwMigrationAudit, MigrationLog, User


def test_bw_migration_audit_round_trip(db):
    user = db.query(User).first()
    row = BwMigrationAudit(
        log_id=42,
        user_id=user.id,
        exercise_name="WEIGHTED PULLUP",
        old_load_kg=70.3,
        new_load_kg=70.0,
        new_added_load_kg=0.0,
        reason="aragorn_correction",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    assert row.id is not None
    assert row.created_at is not None
    assert row.reason == "aragorn_correction"


def test_migration_log_unique_name(db):
    db.add(MigrationLog(name="bw_input_2026_04"))
    db.commit()
    # Same name must conflict
    db.add(MigrationLog(name="bw_input_2026_04"))
    import pytest
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        db.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_bw_migration_audit_table.py -v`
Expected: FAIL with `ImportError: cannot import name 'BwMigrationAudit'`.

- [ ] **Step 3: Add the model classes**

Append to `backend/app/models.py`:

```python
class BwMigrationAudit(Base):
    """Audit row for every WorkoutLog touched by the 2026-04 BW input migration.

    Lets the rollback endpoint revert specific changes and lets ops query
    `SELECT ... WHERE reason = 'aragorn_correction'` to spot-check
    suspicious corrections.
    """

    __tablename__ = "bw_migration_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    log_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    exercise_name: Mapped[str] = mapped_column(String, nullable=False)
    old_load_kg: Mapped[float] = mapped_column(Float, nullable=False)
    new_load_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    new_added_load_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason: Mapped[str] = mapped_column(String, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class MigrationLog(Base):
    """Records which one-shot migrations have run, so they don't re-execute."""

    __tablename__ = "migration_log"

    name: Mapped[str] = mapped_column(String, primary_key=True)
    ran_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_bw_migration_audit_table.py -v`
Expected: both tests PASS. Tables auto-created via `Base.metadata.create_all()` in conftest's `db` fixture.

- [ ] **Step 5: Run the full suite**

Run: `cd backend && python -m pytest tests/ -q`
Expected: same pass count as before plus the new tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/tests/test_bw_migration_audit_table.py
git commit -m "feat(models): add BwMigrationAudit + MigrationLog tables

BwMigrationAudit records every WorkoutLog touched by the 2026-04
BW-input migration with old/new values + reason. MigrationLog
gates one-shot migrations so they don't re-execute on redeploy."
```

---

### Task 4: Add `size_bonus`, `SIZE_BONUS_REFERENCE_KG`, `MAX_ADDED_RATIO_FOR_BACK_ARMS` to `muscle_rank_config`

**Files:**
- Modify: `backend/app/muscle_rank_config.py` (append helpers)
- Test: extend `backend/tests/test_ranks.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_ranks.py`:

```python
from app.muscle_rank_config import (
    MAX_ADDED_RATIO_FOR_BACK_ARMS,
    SIZE_BONUS_REFERENCE_KG,
    size_bonus,
)


def test_size_bonus_at_reference_weight_is_one():
    assert size_bonus(SIZE_BONUS_REFERENCE_KG) == 1.0


def test_size_bonus_heavier_lifter_gets_boost():
    assert size_bonus(100) == pytest.approx(1.118, abs=0.005)
    assert size_bonus(120) == pytest.approx(1.225, abs=0.005)


def test_size_bonus_lighter_lifter_gets_reduction():
    assert size_bonus(60) == pytest.approx(0.866, abs=0.005)
    assert size_bonus(50) == pytest.approx(0.791, abs=0.005)


def test_size_bonus_handles_invalid_input():
    # Non-positive bw collapses to a 1 kg floor — no division-by-zero.
    assert size_bonus(0) > 0
    assert size_bonus(-10) > 0


def test_max_added_ratio_for_back_arms_is_capped_at_2():
    assert MAX_ADDED_RATIO_FOR_BACK_ARMS == 2.0
```

(The `import pytest` should already be at the top of the file; add it if not.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_ranks.py -v -k size_bonus`
Expected: FAIL with `ImportError`.

- [ ] **Step 3: Add the helpers**

Append to `backend/app/muscle_rank_config.py` (just after the `MAX_RATIO_CAP = 5.0` line):

```python
# Tighter sanity guard for back/arms added-load lifts. Anything above 2× BW
# in added load is implausible for pullups/dips and is silently dropped by
# the rank engine.
MAX_ADDED_RATIO_FOR_BACK_ARMS = 2.0

# Size-bonus multiplier (interim fairness correction; Phase 2 replaces this
# with DOTS). Heavier athletes get partial credit for moving more absolute
# mass on bodyweight-class lifts. Reference weight = 80 kg (multiplier 1.0).
# Applied to back + arms only — barbell groups stay on standard ratios.
SIZE_BONUS_REFERENCE_KG = 80.0


def size_bonus(bw_kg: float) -> float:
    """Returns (BW / 80)^0.5. Heavier > 1.0, lighter < 1.0.

    A 100 kg lifter gets ~12% boost; a 60 kg lifter ~13% reduction.
    `max(bw_kg, 1.0)` floor prevents divide-by-zero for malformed input.
    """
    return (max(float(bw_kg), 1.0) / SIZE_BONUS_REFERENCE_KG) ** 0.5
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_ranks.py -v -k size_bonus`
Expected: all 5 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/muscle_rank_config.py backend/tests/test_ranks.py
git commit -m "feat(ranks): add size_bonus + tighter back/arms guard

size_bonus(bw) = (bw / 80)^0.5. Interim fairness correction so heavier
athletes get partial credit for moving more absolute mass on bodyweight
class lifts (back, arms). Phase 2 (separate spec) replaces with DOTS.

MAX_ADDED_RATIO_FOR_BACK_ARMS = 2.0 — silent drop guard for back/arms
candidates. Existing MAX_RATIO_CAP=5.0 stays for barbell lifts."
```

---

## Phase 2 — Catalog backfill

### Task 5: Update `seed_catalog.py` entries with `bodyweight_kind`

**Files:**
- Modify: `backend/app/seed_catalog.py`
- Test: `backend/tests/test_catalog_bodyweight_kind.py` (new)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_catalog_bodyweight_kind.py
"""Verify seed_catalog tags the right exercises with bodyweight_kind."""

from app.models import ExerciseCatalog
from app.seed_catalog import seed_exercise_catalog


def test_pure_bw_exercises_tagged(db):
    seed_exercise_catalog(db)
    expected_pure = ["PULLUP", "2-GRIP PULLUP", "DIP", "DIPS",
                     "WALKING LUNGES", "BW WALKING LUNGES"]
    for name in expected_pure:
        cat = db.query(ExerciseCatalog).filter_by(canonical_name=name).first()
        assert cat is not None, f"missing catalog entry: {name}"
        assert cat.bodyweight_kind == "pure", (
            f"{name} expected bodyweight_kind='pure', got {cat.bodyweight_kind!r}"
        )


def test_weighted_capable_exercises_tagged(db):
    seed_exercise_catalog(db)
    expected = ["WEIGHTED PULLUP", "WEIGHTED DIP"]
    for name in expected:
        cat = db.query(ExerciseCatalog).filter_by(canonical_name=name).first()
        assert cat is not None, f"missing catalog entry: {name}"
        assert cat.bodyweight_kind == "weighted_capable", (
            f"{name} expected bodyweight_kind='weighted_capable', got {cat.bodyweight_kind!r}"
        )


def test_external_load_exercises_have_null_kind(db):
    seed_exercise_catalog(db)
    expected_null = ["BARBELL BENCH PRESS", "BACK SQUAT", "DB ROW",
                     "LAT PULLDOWN", "DB WALKING LUNGE"]
    for name in expected_null:
        cat = db.query(ExerciseCatalog).filter_by(canonical_name=name).first()
        if cat is None:
            # Some catalog names vary; skip if not seeded
            continue
        assert cat.bodyweight_kind is None, (
            f"{name} expected bodyweight_kind=NULL, got {cat.bodyweight_kind!r}"
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_catalog_bodyweight_kind.py -v`
Expected: FAIL — assertion that `bodyweight_kind == "pure"` is violated (currently None).

- [ ] **Step 3: Add `bodyweight_kind` to all relevant catalog entries**

Open `backend/app/seed_catalog.py` and edit each affected entry, adding a `"bodyweight_kind": "pure"` or `"bodyweight_kind": "weighted_capable"` field to the dict.

The complete list of catalog edits:

**Mark `bodyweight_kind = "weighted_capable"`** (and consider whether to also bump `equipment` to `"barbell"` since a plate is involved — leave equipment alone to avoid breaking other UI; only the new flag matters):
- `WEIGHTED PULLUP`
- `WEIGHTED DIP`, `WEIGHTED DIPS`, `WEIGHTED DIP (HEAVY)`, `WEIGHTED DIP (BACK OFF)` (only those that exist in the file — grep first)

**Mark `bodyweight_kind = "pure"`:**
- `PULLUP`, `2-GRIP PULLUP`, `2-GRIP PULLUP (ASSISTED)` → leave NULL (machine-loaded; out of scope per spec — verify and skip)
- `DIP`, `DIPS`, `BODYWEIGHT DIP`, `PARALLEL BAR DIP` (only those that exist)
- `WALKING LUNGES`, `BW WALKING LUNGES`
- All ab/core canonicals — grep `seed_catalog.py` for `"muscle_group_primary": "core"` or `"muscle_group_primary": "abs"` and tag each unless its `equipment` is `"machine"` or `"cable"`. Specifically check for: `MACHINE CRUNCH` (skip — machine), `HANGING KNEE RAISE`, `HANGING LEG RAISE`, `PLANK`, `CABLE CRUNCH` (skip — cable), `SIT UP`, etc.

Use these greps before editing to avoid missing or over-tagging:

```bash
cd backend && grep -n "PULL\|CHIN\|DIP\|LUNGE\|CRUNCH\|RAISE\|PLANK\|SIT" app/seed_catalog.py
cd backend && grep -n '"muscle_group_primary":' app/seed_catalog.py | grep -i 'abs\|core'
```

For each match, add the `bodyweight_kind` key to the dict. Pattern:

```python
{
    "canonical_name": "PULLUP",
    "muscle_group_primary": "back",
    ...
    "difficulty_level": "intermediate",
    "bodyweight_kind": "pure",       # ← add this line
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_catalog_bodyweight_kind.py -v`
Expected: all 3 tests PASS. If `test_pure_bw_exercises_tagged` still fails for a specific name, that catalog entry was missed — fix it and re-run.

- [ ] **Step 5: Commit**

```bash
git add backend/app/seed_catalog.py backend/tests/test_catalog_bodyweight_kind.py
git commit -m "feat(catalog): tag bodyweight_kind on pullup/dip/lunge/ab entries

Pure: PULLUP, DIP variants, WALKING LUNGES, ab/core BW lifts.
Weighted-capable: WEIGHTED PULLUP, WEIGHTED DIP variants.
External-load entries (barbell, DB, machine) keep bodyweight_kind=NULL.

Drives the new Logger SetRow input layout selection."
```

---

### Task 6: Catalog backfill for already-seeded rows

**Background:** `seed_exercise_catalog()` is idempotent — it only inserts missing canonicals, never updates existing ones. Production rows seeded before today have `bodyweight_kind = NULL`. Need a one-shot UPDATE that runs alongside the migration.

**Files:**
- Modify: `backend/app/seed_catalog.py` (add helper function)
- Modify: `backend/app/main.py` (call helper from `_run_migrations`)
- Test: extend `backend/tests/test_catalog_bodyweight_kind.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_catalog_bodyweight_kind.py`:

```python
def test_backfill_updates_existing_rows(db):
    """Pre-existing catalog rows (without bodyweight_kind) get backfilled."""
    # Simulate a pre-migration row by inserting WITHOUT bodyweight_kind
    pre_existing = ExerciseCatalog(
        canonical_name="PULLUP",
        muscle_group_primary="back",
        movement_pattern="vertical pull",
        equipment="bodyweight",
        difficulty_level="intermediate",
        bodyweight_kind=None,
    )
    db.add(pre_existing)
    db.commit()

    from app.seed_catalog import backfill_catalog_bodyweight_kind
    backfill_catalog_bodyweight_kind(db)

    refreshed = db.query(ExerciseCatalog).filter_by(canonical_name="PULLUP").first()
    assert refreshed.bodyweight_kind == "pure"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_catalog_bodyweight_kind.py::test_backfill_updates_existing_rows -v`
Expected: FAIL with `ImportError: cannot import name 'backfill_catalog_bodyweight_kind'`.

- [ ] **Step 3: Add the backfill function**

In `backend/app/seed_catalog.py`, after the `EXERCISE_CATALOG` list and the existing seed function, add:

```python
def backfill_catalog_bodyweight_kind(db):
    """Update existing ExerciseCatalog rows with the bodyweight_kind value
    from the EXERCISE_CATALOG seed list. Idempotent — only updates rows
    where the DB value differs from the seed value (so it can be called on
    every startup safely).
    """
    from .models import ExerciseCatalog
    seed_by_name = {
        entry["canonical_name"]: entry.get("bodyweight_kind")
        for entry in EXERCISE_CATALOG
    }
    for cat in db.query(ExerciseCatalog).all():
        wanted = seed_by_name.get(cat.canonical_name)
        if cat.bodyweight_kind != wanted:
            cat.bodyweight_kind = wanted
    db.commit()
```

- [ ] **Step 4: Wire it into the migration block**

Edit `backend/app/main.py` `_run_migrations()` — after the `_ensure_column("exercise_catalog", "bodyweight_kind", "VARCHAR")` line, add a call to the backfill (must run AFTER the column exists AND AFTER the seed function has had a chance to populate fresh rows). Actually the cleanest place is right after `seed_exercise_catalog(db)` in `lifespan()` (around line 156). Edit `lifespan` instead:

```python
        seed_exercise_catalog(db)
        from .seed_catalog import backfill_catalog_bodyweight_kind
        backfill_catalog_bodyweight_kind(db)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_catalog_bodyweight_kind.py -v`
Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/seed_catalog.py backend/app/main.py backend/tests/test_catalog_bodyweight_kind.py
git commit -m "feat(catalog): backfill bodyweight_kind on existing rows

seed_exercise_catalog only inserts missing canonicals; existing rows
seeded before today were unaffected. backfill_catalog_bodyweight_kind
runs on every lifespan startup, idempotently updating rows whose
bodyweight_kind differs from the seed list."
```

---

## Phase 3 — Migration engine (Phase 4c of spec)

### Task 7: New module `bw_migration.py` with per-log backfill + audit

**Files:**
- Create: `backend/app/bw_migration.py`
- Test: `backend/tests/test_bw_migration.py` (new)

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_bw_migration.py
"""End-to-end migration tests for the 2026-04 BW input fix."""

from datetime import date, timedelta

import pytest

from app.bw_migration import run_bw_migration
from app.models import (
    BodyMetric,
    BwMigrationAudit,
    ExerciseCatalog,
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)
from app.seed_catalog import seed_exercise_catalog, backfill_catalog_bodyweight_kind


def _seed_catalog(db):
    seed_exercise_catalog(db)
    backfill_catalog_bodyweight_kind(db)


def _make_user(db, name, bw):
    u = User(name=name, username=name, password_hash="!", bodyweight_kg=bw)
    db.add(u)
    db.commit()
    return u


def _make_log(db, user, exercise_canonical, load_kg, reps=5, day_offset=0):
    program = Program(
        user_id=user.id, name=f"P-{exercise_canonical}",
        frequency=3, start_date=date.today(),
    )
    db.add(program)
    db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="A",
        exercise_order=1, exercise_name_raw=exercise_canonical,
        exercise_name_canonical=exercise_canonical,
        prescribed_sets="3", working_sets=3,
    )
    db.add(pe)
    db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id,
        date=date.today() - timedelta(days=day_offset),
        set_number=1, load_kg=load_kg, reps_completed=reps,
    )
    db.add(log)
    db.commit()
    return log


def test_aragorn_correction(db):
    """Weighted pullup logged at user's bodyweight gets corrected to BW only."""
    _seed_catalog(db)
    aragorn = _make_user(db, "aragorn", bw=70.0)
    # Aragorn entered 70kg (his BW) into WEIGHTED PULLUP, thinking it was BW input
    log = _make_log(db, aragorn, "WEIGHTED PULLUP", load_kg=70.3)

    run_bw_migration(db)

    db.refresh(log)
    assert log.added_load_kg == 0
    assert log.load_kg == pytest.approx(70.0)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit is not None
    assert audit.reason == "aragorn_correction"
    assert audit.old_load_kg == pytest.approx(70.3)


def test_legitimate_weighted_pullup_promoted(db):
    """Real +25 kg pullup gets load_kg = BW + 25, added_load_kg = 25."""
    _seed_catalog(db)
    legolas = _make_user(db, "legolas", bw=70.0)
    log = _make_log(db, legolas, "WEIGHTED PULLUP", load_kg=25.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.added_load_kg == pytest.approx(25.0)
    assert log.load_kg == pytest.approx(95.0)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "weighted_capable_added_promoted"


def test_pure_bw_pushup_backfilled(db):
    """Pre-migration pushup with load=0 gets load_kg = BW."""
    _seed_catalog(db)
    gimli = _make_user(db, "gimli", bw=90.0)
    # Tag a "PUSHUP" canonical as pure for this test
    cat = ExerciseCatalog(
        canonical_name="PUSHUP",
        muscle_group_primary="chest",
        movement_pattern="horizontal push",
        equipment="bodyweight",
        difficulty_level="beginner",
        bodyweight_kind="pure",
    )
    db.add(cat)
    db.commit()
    log = _make_log(db, gimli, "PUSHUP", load_kg=0.0, reps=15)

    run_bw_migration(db)

    db.refresh(log)
    assert log.added_load_kg == 0
    assert log.load_kg == pytest.approx(90.0)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "pure_bw_backfilled"


def test_no_bodyweight_user_skipped(db):
    """User without recorded BW gets logs flagged but untouched."""
    _seed_catalog(db)
    saruman = _make_user(db, "saruman", bw=None)
    log = _make_log(db, saruman, "WEIGHTED PULLUP", load_kg=50.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.load_kg == pytest.approx(50.0)
    assert log.added_load_kg is None
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "no_bw_skipped"


def test_pure_with_nonzero_load_skipped(db):
    """Pure exercise with pre-existing nonzero load is flagged, not overwritten."""
    _seed_catalog(db)
    user = _make_user(db, "vest_user", bw=80.0)
    cat = ExerciseCatalog(
        canonical_name="PUSHUP",
        muscle_group_primary="chest",
        movement_pattern="horizontal push",
        equipment="bodyweight",
        difficulty_level="beginner",
        bodyweight_kind="pure",
    )
    db.add(cat)
    db.commit()
    log = _make_log(db, user, "PUSHUP", load_kg=15.0)  # pre-existing vest weight

    run_bw_migration(db)

    db.refresh(log)
    assert log.load_kg == pytest.approx(15.0)  # untouched
    assert log.added_load_kg is None  # untouched
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "pure_with_nonzero_load_skipped"


def test_weighted_capable_zero_load(db):
    """Weighted pullup logged with 0 load = bodyweight-only attempt."""
    _seed_catalog(db)
    user = _make_user(db, "test", bw=80.0)
    log = _make_log(db, user, "WEIGHTED PULLUP", load_kg=0.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.added_load_kg == 0
    assert log.load_kg == pytest.approx(80.0)
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "weighted_capable_zero_load"


def test_external_load_untouched(db):
    """Barbell bench press should not be touched by the migration."""
    _seed_catalog(db)
    user = _make_user(db, "test", bw=80.0)
    log = _make_log(db, user, "BARBELL BENCH PRESS", load_kg=100.0)

    run_bw_migration(db)

    db.refresh(log)
    assert log.load_kg == pytest.approx(100.0)
    assert log.added_load_kg is None
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit is None  # external-load logs don't generate audit rows


def test_migration_is_idempotent(db):
    """Running the migration twice doesn't double-mutate."""
    _seed_catalog(db)
    aragorn = _make_user(db, "aragorn", bw=70.0)
    log = _make_log(db, aragorn, "WEIGHTED PULLUP", load_kg=70.3)

    run_bw_migration(db)
    first_load = log.load_kg
    audit_count_first = db.query(BwMigrationAudit).count()

    run_bw_migration(db)
    db.refresh(log)
    assert log.load_kg == first_load
    assert db.query(BwMigrationAudit).count() == audit_count_first


def test_migration_uses_historical_bodymetric(db):
    """If a BodyMetric exists with date <= log.date, prefer it over user.bodyweight_kg."""
    _seed_catalog(db)
    user = _make_user(db, "yoyo", bw=85.0)  # current BW
    # Log is 30 days old; user weighed 75 kg back then
    log = _make_log(db, user, "WEIGHTED PULLUP", load_kg=75.5, day_offset=30)
    db.add(BodyMetric(
        user_id=user.id, date=date.today() - timedelta(days=35),
        bodyweight_kg=75.0,
    ))
    db.commit()

    run_bw_migration(db)

    db.refresh(log)
    # 75.5 ≈ 75 (Aragorn band against historical BW), not against current 85
    audit = db.query(BwMigrationAudit).filter_by(log_id=log.id).first()
    assert audit.reason == "aragorn_correction"
    assert log.load_kg == pytest.approx(75.0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_bw_migration.py -v`
Expected: all 9 tests FAIL with `ImportError: cannot import name 'run_bw_migration'`.

- [ ] **Step 3: Implement the migration**

Create `backend/app/bw_migration.py`:

```python
"""One-shot migration: backfill load_kg/added_load_kg on bodyweight-class
WorkoutLog rows. Audits every change into bw_migration_audit. Idempotent —
the audit table itself is the dedup signal (never re-touch a log_id that
already has an audit row from a previous run).

Exported entry points:
    run_bw_migration(db)               — run the migration
    rerun_bw_migration_for_user(db, user_id) — admin re-run for a single user
                                         after they backfill bodyweight
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from .models import (
    BodyMetric,
    BwMigrationAudit,
    ExerciseCatalog,
    User,
    WorkoutLog,
)

ARAGORN_BAND_LOW = 0.85
ARAGORN_BAND_HIGH = 1.15


def _bw_at_log_date(db: Session, user_id: int, current_bw: float | None, log_date: date) -> float | None:
    """Resolve user's BW as of `log_date`. Latest BodyMetric on or before
    the log date wins; fall back to user.bodyweight_kg if none."""
    latest = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == user_id, BodyMetric.date <= log_date)
        .order_by(BodyMetric.date.desc())
        .first()
    )
    if latest and latest.bodyweight_kg and latest.bodyweight_kg > 0:
        return float(latest.bodyweight_kg)
    if current_bw and current_bw > 0:
        return float(current_bw)
    return None


def _process_log(
    db: Session, log: WorkoutLog, kind: str, user_bw: float | None,
) -> tuple[str, float | None, float | None] | None:
    """Decide what to do with one log. Returns (reason, new_load_kg, new_added_load_kg)
    or None if the log should be skipped entirely (no audit row)."""
    if user_bw is None:
        return ("no_bw_skipped", None, None)

    old_load = float(log.load_kg or 0.0)

    if kind == "pure":
        if old_load <= 0:
            return ("pure_bw_backfilled", user_bw, 0.0)
        else:
            # Pre-existing nonzero load — likely vested pushup. Leave alone.
            return ("pure_with_nonzero_load_skipped", None, None)

    if kind == "weighted_capable":
        if old_load <= 0:
            return ("weighted_capable_zero_load", user_bw, 0.0)
        if ARAGORN_BAND_LOW * user_bw <= old_load <= ARAGORN_BAND_HIGH * user_bw:
            return ("aragorn_correction", user_bw, 0.0)
        return ("weighted_capable_added_promoted", user_bw + old_load, old_load)

    return None  # external load — no action


def run_bw_migration(db: Session, *, only_user_id: int | None = None) -> dict:
    """Audit + backfill all bodyweight-class WorkoutLogs.

    Idempotent: skips logs that already have a BwMigrationAudit row from a
    prior run. `only_user_id` scopes the run to a single user (admin re-run).

    Returns a summary dict with per-reason counts.
    """
    # Pre-build canonical → bodyweight_kind map
    kind_by_canonical: dict[str, str] = {}
    for cat in db.query(ExerciseCatalog).filter(ExerciseCatalog.bodyweight_kind.isnot(None)).all():
        kind_by_canonical[cat.canonical_name] = cat.bodyweight_kind

    if not kind_by_canonical:
        return {"touched": 0}

    # Skip logs that already have audit rows
    already_audited = {
        row.log_id for row in db.query(BwMigrationAudit.log_id).all()
    }

    from .models import ProgramExercise
    q = (
        db.query(WorkoutLog, ProgramExercise.exercise_name_canonical)
        .join(ProgramExercise, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(ProgramExercise.exercise_name_canonical.in_(list(kind_by_canonical.keys())))
    )
    if only_user_id is not None:
        q = q.filter(WorkoutLog.user_id == only_user_id)

    summary: dict[str, int] = {"touched": 0}
    user_bw_cache: dict[tuple[int, date], float | None] = {}

    for log, canonical in q.all():
        if log.id in already_audited:
            continue
        kind = kind_by_canonical.get(canonical)
        if kind is None:
            continue

        cache_key = (log.user_id, log.date)
        if cache_key not in user_bw_cache:
            u = db.get(User, log.user_id)
            user_bw_cache[cache_key] = _bw_at_log_date(
                db, log.user_id, u.bodyweight_kg if u else None, log.date,
            )
        user_bw = user_bw_cache[cache_key]

        outcome = _process_log(db, log, kind, user_bw)
        if outcome is None:
            continue
        reason, new_load_kg, new_added_kg = outcome

        old_load = float(log.load_kg or 0.0)
        # Mutate the log only when the migration actually has a value to set
        if new_load_kg is not None:
            log.load_kg = new_load_kg
        if new_added_kg is not None:
            log.added_load_kg = new_added_kg

        db.add(BwMigrationAudit(
            log_id=log.id,
            user_id=log.user_id,
            exercise_name=canonical,
            old_load_kg=old_load,
            new_load_kg=new_load_kg,
            new_added_load_kg=new_added_kg,
            reason=reason,
        ))
        summary["touched"] += 1
        summary[reason] = summary.get(reason, 0) + 1

    db.commit()
    return summary


def rerun_bw_migration_for_user(db: Session, user_id: int) -> dict:
    """Admin re-run: re-process this user's logs, picking up any newly
    set bodyweight. Skips logs that were already audited (so it's safe to
    call multiple times)."""
    return run_bw_migration(db, only_user_id=user_id)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_bw_migration.py -v`
Expected: all 9 tests PASS.

- [ ] **Step 5: Run full backend suite to check for regressions**

Run: `cd backend && python -m pytest tests/ -q`
Expected: same baseline + new tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/bw_migration.py backend/tests/test_bw_migration.py
git commit -m "feat(migration): backfill load_kg/added_load_kg with audit

run_bw_migration walks every bodyweight-class WorkoutLog and sets
load_kg = effective_load + added_load_kg = plate-only. Aragorn-style
bug detection: weighted pullup logs within +-15% of user BW are
corrected to bodyweight-only. Audit row per change in
bw_migration_audit. Idempotent — already-audited log_ids are skipped."
```

---

### Task 8: Wire migration into `main.py` lifespan with feature-flag gate

**Files:**
- Modify: `backend/app/main.py` (lifespan + new gate function)
- Test: `backend/tests/test_bw_migration_gate.py` (new)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_bw_migration_gate.py
"""The migration must run exactly once across multiple lifespan invocations."""

from datetime import date

from app.bw_migration import run_bw_migration
from app.main import _run_bw_migration_once
from app.models import (
    BwMigrationAudit,
    ExerciseCatalog,
    MigrationLog,
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)
from app.seed_catalog import seed_exercise_catalog, backfill_catalog_bodyweight_kind


MIGRATION_NAME = "bw_input_2026_04"


def test_first_run_inserts_marker_row(db):
    seed_exercise_catalog(db)
    backfill_catalog_bodyweight_kind(db)
    assert db.query(MigrationLog).filter_by(name=MIGRATION_NAME).first() is None
    _run_bw_migration_once(db)
    assert db.query(MigrationLog).filter_by(name=MIGRATION_NAME).first() is not None


def test_second_run_is_no_op(db):
    seed_exercise_catalog(db)
    backfill_catalog_bodyweight_kind(db)
    user = User(name="t", username="t", password_hash="!", bodyweight_kg=70)
    db.add(user)
    db.commit()
    program = Program(user_id=user.id, name="P", frequency=3, start_date=date.today())
    db.add(program)
    db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="A", exercise_order=1,
        exercise_name_raw="WEIGHTED PULLUP", exercise_name_canonical="WEIGHTED PULLUP",
        prescribed_sets="3", working_sets=3,
    )
    db.add(pe)
    db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date.today(),
        set_number=1, load_kg=25.0, reps_completed=5,
    )
    db.add(log)
    db.commit()

    _run_bw_migration_once(db)
    audit_after_first = db.query(BwMigrationAudit).count()

    _run_bw_migration_once(db)
    assert db.query(BwMigrationAudit).count() == audit_after_first
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_bw_migration_gate.py -v`
Expected: FAIL with `ImportError: cannot import name '_run_bw_migration_once'`.

- [ ] **Step 3: Add the gate function and call it from lifespan**

In `backend/app/main.py`, add this function near `_run_migrations`:

```python
def _run_bw_migration_once(db):
    """Run the BW input migration exactly once across deploys.

    Gated by a row in `migration_log`. The migration body itself is also
    idempotent (skips audited log_ids), so this gate is belt-and-suspenders
    plus avoids the per-row scan on every cold start.
    """
    from .bw_migration import run_bw_migration
    from .models import MigrationLog

    name = "bw_input_2026_04"
    existing = db.query(MigrationLog).filter_by(name=name).first()
    if existing is not None:
        return
    summary = run_bw_migration(db)
    db.add(MigrationLog(name=name))
    db.commit()
    print(
        f"BW migration: touched {summary.get('touched', 0)} logs. "
        f"Aragorn corrections: {summary.get('aragorn_correction', 0)}. "
        f"Pure-BW backfills: {summary.get('pure_bw_backfilled', 0)}. "
        f"No-BW-skipped: {summary.get('no_bw_skipped', 0)}.",
        flush=True,
    )
```

Then in the `lifespan` function (around line 158), add the call after `_backfill_default_user(db)`:

```python
        _backfill_default_user(db)
        _run_bw_migration_once(db)
        seed_preset_programs(db)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_bw_migration_gate.py -v`
Expected: both tests PASS.

- [ ] **Step 5: Run full suite**

Run: `cd backend && python -m pytest tests/ -q`
Expected: same baseline.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_bw_migration_gate.py
git commit -m "feat(migration): gate bw migration with migration_log marker

_run_bw_migration_once writes a migration_log row on first success;
subsequent lifespan startups short-circuit. Logs a summary line to
stdout (visible in flyctl logs) showing touched/aragorn/no-bw counts."
```

---

## Phase 4 — Rank engine updates

### Task 9: Update `_best_weighted_calisthenic` to read `added_load_kg`, apply guard, apply size_bonus

**Files:**
- Modify: `backend/app/rank_engine.py:210-362` (`_best_weighted_calisthenic`)
- Modify: `backend/app/rank_engine.py:30-65` (imports — add new symbols)
- Test: extend `backend/tests/test_ranks.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_ranks.py`:

```python
from datetime import date

from app.models import Program, ProgramExercise, WorkoutLog, User
from app.rank_engine import recompute_for_user
from app.seed_catalog import seed_exercise_catalog, backfill_catalog_bodyweight_kind


def _setup_pullup_log(db, user, *, load_kg, added_load_kg, reps=5):
    program = Program(user_id=user.id, name="X", frequency=3, start_date=date.today())
    db.add(program); db.flush()
    pe = ProgramExercise(
        program_id=program.id, week=1, session_name="A", exercise_order=1,
        exercise_name_raw="WEIGHTED PULLUP", exercise_name_canonical="WEIGHTED PULLUP",
        prescribed_sets="3", working_sets=3,
    )
    db.add(pe); db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date.today(),
        set_number=1, load_kg=load_kg, reps_completed=reps,
        added_load_kg=added_load_kg,
    )
    db.add(log); db.commit()
    return log


def test_rank_engine_reads_added_load_kg_directly(db):
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # Effective load 105 kg = BW 80 + 25 plate
    _setup_pullup_log(db, user, load_kg=105.0, added_load_kg=25.0)

    ranks = recompute_for_user(db, user.id)

    # Ratio = 25 / 80 * size_bonus(80) = 0.3125 * 1.0 = 0.3125 → Silver tier
    back = ranks["back"]
    assert back["rank"] in {"Silver", "Gold"}, back


def test_rank_engine_drops_implausible_added_load(db):
    """A log with added_load_kg = 3 * BW must be dropped silently."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()
    user.bodyweight_kg = 80.0
    db.commit()
    # 240 kg added on a single rep — beyond MAX_ADDED_RATIO_FOR_BACK_ARMS = 2.0 * 80
    _setup_pullup_log(db, user, load_kg=320.0, added_load_kg=240.0, reps=1)

    ranks = recompute_for_user(db, user.id)

    # Should NOT be Champion — guard drops the candidate, falls back to Copper
    assert ranks["back"]["rank"] == "Copper"


def test_size_bonus_helps_heavy_lifter(db):
    """Heavy 100kg lifter and light 60kg lifter both add 25kg pullup —
    heavy ranks higher under size_bonus."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    heavy = User(name="heavy", username="heavy", password_hash="!", bodyweight_kg=100.0)
    light = User(name="light", username="light", password_hash="!", bodyweight_kg=60.0)
    db.add_all([heavy, light])
    db.commit()
    _setup_pullup_log(db, heavy, load_kg=125.0, added_load_kg=25.0)
    _setup_pullup_log(db, light, load_kg=85.0, added_load_kg=25.0)

    h_ranks = recompute_for_user(db, heavy.id)
    l_ranks = recompute_for_user(db, light.id)

    # Heavy: 25/100 * (100/80)^0.5 = 0.25 * 1.118 = 0.2795 → Silver IV
    # Light: 25/60  * (60/80)^0.5  = 0.4167 * 0.866 = 0.361 → Silver III
    # Light still wins on this calibration (the small bonus doesn't fully invert),
    # but the GAP must shrink — heavy's elo must be > what it would be without bonus.
    # Concretely: heavy elo > light elo's old un-bonused elo (0.4167 → ~Silver III).
    # Strict comparator: heavy ratio under bonus > 0.25 (no-bonus baseline).
    assert h_ranks["back"]["ratio"] > 0.25
    # And lighter's ratio after bonus shrinks below the old un-bonused value.
    assert l_ranks["back"]["ratio"] < 0.4167
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_ranks.py -v -k "rank_engine_reads or rank_engine_drops or size_bonus_helps"`
Expected: FAIL — engine does not yet read added_load_kg or apply size_bonus.

- [ ] **Step 3: Update the imports in `rank_engine.py`**

Edit `backend/app/rank_engine.py` — extend the existing `from .muscle_rank_config import (...)` block to include:

```python
from .muscle_rank_config import (
    # ... existing imports
    MAX_ADDED_RATIO_FOR_BACK_ARMS,
    size_bonus,
)
```

- [ ] **Step 4: Update the SQL query and the weighted branch in `_best_weighted_calisthenic`**

Inside `_best_weighted_calisthenic` (currently around line 210):

Change the query to also select `added_load_kg`:

```python
    rows = (
        db.query(
            ProgramExercise.exercise_name_canonical,
            WorkoutLog.load_kg,
            WorkoutLog.reps_completed,
            WorkoutLog.date,
            WorkoutLog.added_load_kg,    # NEW
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(...same as before...)
        .all()
    )
```

Update the loop unpack:

```python
    for name, load, reps, _d, added_kg in rows:
```

Replace the weighted branch (currently `if name in weighted and load is not None and load > 0:`):

```python
        if name in weighted:
            # Prefer added_load_kg; fall back to (load - bw) for legacy rows
            # the migration didn't catch (no_bw_skipped users).
            if added_kg is not None:
                effective_added = max(0.0, float(added_kg))
            else:
                effective_added = max(0.0, float(load or 0.0) - bw_kg)

            if effective_added <= 0 and reps and reps > 0:
                # Bodyweight-only attempt — fall through to the bodyweight branch
                saw_bodyweight = True
                if best_added_ratio < 0:
                    best_added_ratio = 0.0
                    best_weighted_source = f"logged:{name}"
                if reps > best_rep_count:
                    best_rep_count = reps
                    best_rep_source = f"logged_reps:{name}"
                continue

            if reps > MAX_REPS_FOR_E1RM:
                continue
            e1rm = _epley_e1rm(effective_added, reps)
            if e1rm <= 0:
                continue
            ratio = (e1rm / bw_kg) * size_bonus(bw_kg)
            if ratio > MAX_ADDED_RATIO_FOR_BACK_ARMS:
                continue   # silent drop — implausible for pullup/dip
            if ratio > best_added_ratio:
                best_added_ratio = ratio
                best_weighted_source = f"logged:{name}"
```

Inside the `elif name in bodyweight:` branch (currently around line 284), apply the size bonus to the rep count fallback:

```python
        elif name in bodyweight:
            saw_bodyweight = True
            if best_added_ratio < 0:
                best_added_ratio = 0.0
                best_weighted_source = f"logged:{name}"
            # Size-bonus applied: heavier athletes' rep count counts more
            scaled_reps = int(reps * size_bonus(bw_kg))
            if scaled_reps > best_rep_count:
                best_rep_count = scaled_reps
                best_rep_source = f"logged_reps:{name}(scaled)"
```

Inside the `elif close_grip_fallback...` branch, also apply the cap (it's an arms-only proxy so MAX_ADDED_RATIO_FOR_BACK_ARMS applies):

```python
            if shifted > MAX_ADDED_RATIO_FOR_BACK_ARMS:
                continue
```

Inside the `elif name in compound_map...` branch (rows / pulldowns / triceps), apply size_bonus and cap:

```python
            ratio = (e1rm * spec / bw_kg) * size_bonus(bw_kg)
            if ratio > MAX_ADDED_RATIO_FOR_BACK_ARMS:
                continue
```

(The cap matters for arms compound too. Keeping the existing `MAX_RATIO_CAP` check as well — defense in depth.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_ranks.py -v`
Expected: all rank tests PASS, including the three new ones.

- [ ] **Step 6: Run full backend suite**

Run: `cd backend && python -m pytest tests/ -q`
Expected: same baseline.

- [ ] **Step 7: Commit**

```bash
git add backend/app/rank_engine.py backend/tests/test_ranks.py
git commit -m "feat(ranks): read added_load_kg, apply size_bonus, tighter cap

_best_weighted_calisthenic now sources added load from the dedicated
column rather than re-deriving from (load_kg - bw). Falls back to the
old derivation for legacy rows the migration didn't catch.

Size-bonus multiplier (BW/80)^0.5 applied to the back/arms ratio AND
to the bodyweight rep-count fallback — heavier athletes get partial
credit for moving more absolute mass. Phase 2 (separate spec) replaces
this with DOTS.

MAX_ADDED_RATIO_FOR_BACK_ARMS = 2.0 silently drops implausible
candidates (e.g. Aragorn-style legacy rows that escaped migration)."
```

---

## Phase 5 — API surface

### Task 10: Bulk + single log endpoints accept `added_load_kg`

**Files:**
- Modify: `backend/app/routers/logging.py:34-45` (single-set Pydantic schema)
- Modify: `backend/app/routers/logging.py:64-73` (bulk-set Pydantic schema)
- Modify: `backend/app/routers/logging.py:180-192` (single-log handler)
- Modify: `backend/app/routers/logging.py:276-291` (bulk-log handler)
- Test: extend `backend/tests/test_logging.py` (or create if missing)

- [ ] **Step 1: Write the failing tests**

Find (or create) `backend/tests/test_logging.py`. Append:

```python
from datetime import date

from app.models import Program, ProgramExercise, User, WorkoutLog


def _make_program(db, user):
    p = Program(user_id=user.id, name="P", frequency=3, start_date=date.today())
    db.add(p); db.flush()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="A", exercise_order=1,
        exercise_name_raw="PUSHUP", exercise_name_canonical="PUSHUP",
        prescribed_sets="3", working_sets=3,
    )
    db.add(pe); db.commit()
    return p, pe


def test_bulk_log_round_trips_added_load_kg(db, client):
    user = db.query(User).first()
    p, pe = _make_program(db, user)
    payload = {
        "program_id": p.id, "week": 1, "session_name": "A",
        "date": str(date.today()),
        "sets": [{
            "program_exercise_id": pe.id, "set_number": 1,
            "load_kg": 80.0, "reps_completed": 15,
            "added_load_kg": 0,
        }],
    }
    r = client.post("/api/log/bulk", json=payload)
    assert r.status_code == 201
    log = db.query(WorkoutLog).first()
    assert log.added_load_kg == 0
    assert log.load_kg == 80.0


def test_bulk_log_omitted_added_load_kg_stays_null(db, client):
    user = db.query(User).first()
    p, pe = _make_program(db, user)
    payload = {
        "program_id": p.id, "week": 1, "session_name": "A",
        "date": str(date.today()),
        "sets": [{
            "program_exercise_id": pe.id, "set_number": 1,
            "load_kg": 100.0, "reps_completed": 5,
        }],
    }
    r = client.post("/api/log/bulk", json=payload)
    assert r.status_code == 201
    log = db.query(WorkoutLog).first()
    assert log.added_load_kg is None


def test_single_log_round_trips_added_load_kg(db, client):
    user = db.query(User).first()
    _, pe = _make_program(db, user)
    payload = {
        "program_exercise_id": pe.id, "date": str(date.today()),
        "set_number": 1, "load_kg": 105.0, "reps_completed": 5,
        "added_load_kg": 25.0,
    }
    r = client.post("/api/log", json=payload)
    assert r.status_code == 201
    log = db.query(WorkoutLog).filter_by(program_exercise_id=pe.id).first()
    assert log.added_load_kg == 25.0
    assert log.load_kg == 105.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_logging.py -v -k "added_load_kg"`
Expected: FAIL — Pydantic doesn't yet accept `added_load_kg`, or the column isn't being copied to the WorkoutLog row.

- [ ] **Step 3: Extend the Pydantic schemas**

Edit `backend/app/routers/logging.py`:

`SetLogRequest` (around line 34) — add field after `dropset_load_kg`:

```python
    added_load_kg: Optional[float] = Field(None, ge=0)
```

`SetLogResponse` (around line 47) — same field added to the response shape:

```python
    added_load_kg: Optional[float]
```

`BulkSetItem` (around line 64) — add field:

```python
    added_load_kg: Optional[float] = Field(None, ge=0)
```

`WorkoutLogOut` (around line 109) — add field for `/api/logs` consumers:

```python
    added_load_kg: Optional[float] = None
```

- [ ] **Step 4: Pass the field through to the WorkoutLog constructor**

In `log_single_set` (around line 180), add `added_load_kg=payload.added_load_kg` to the WorkoutLog construction.

In `log_bulk_session` (around line 276), inside the `for s in payload.sets:` loop, add `added_load_kg=s.added_load_kg` to the WorkoutLog construction.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_logging.py -v -k "added_load_kg"`
Expected: all 3 new tests PASS.

- [ ] **Step 6: Run the full suite**

Run: `cd backend && python -m pytest tests/ -q`
Expected: same baseline + the new tests.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/logging.py backend/tests/test_logging.py
git commit -m "feat(api): /api/log + /api/log/bulk accept added_load_kg

Optional float field; null = external load, 0 = pure BW set,
>0 = weighted-capable set. Pydantic schemas + WorkoutLog
constructors updated. WorkoutLogOut exposes the field too."
```

---

### Task 11: Admin rollback + re-run-for-user endpoints

**Files:**
- Modify: `backend/app/routers/auth.py` (append new endpoints — admin-gated)
- Test: `backend/tests/test_bw_migration_admin.py` (new)

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_bw_migration_admin.py
"""Admin endpoints for rollback + per-user re-run."""

from datetime import date

import pytest

from app.models import (
    BodyMetric,
    BwMigrationAudit,
    Program,
    ProgramExercise,
    User,
    WorkoutLog,
)
from app.seed_catalog import seed_exercise_catalog, backfill_catalog_bodyweight_kind
from app.bw_migration import run_bw_migration


def _make_pullup_log(db, user, load_kg):
    p = Program(user_id=user.id, name="P", frequency=3, start_date=date.today())
    db.add(p); db.flush()
    pe = ProgramExercise(
        program_id=p.id, week=1, session_name="A", exercise_order=1,
        exercise_name_raw="WEIGHTED PULLUP", exercise_name_canonical="WEIGHTED PULLUP",
        prescribed_sets="3", working_sets=3,
    )
    db.add(pe); db.flush()
    log = WorkoutLog(
        user_id=user.id, program_exercise_id=pe.id, date=date.today(),
        set_number=1, load_kg=load_kg, reps_completed=5,
    )
    db.add(log); db.commit()
    return log


def _make_admin_user(db):
    """Replace the seeded user with hackesmit so admin checks pass."""
    user = db.query(User).first()
    user.username = "hackesmit"
    user.name = "hackesmit"
    user.bodyweight_kg = 70.0
    db.commit()
    return user


def test_rollback_endpoint_reverts_changes(db, client):
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    admin = _make_admin_user(db)
    log = _make_pullup_log(db, admin, load_kg=70.3)

    run_bw_migration(db)
    db.refresh(log)
    assert log.added_load_kg == 0
    assert log.load_kg == pytest.approx(70.0)

    r = client.post("/api/admin/bw-migration-rollback")
    assert r.status_code == 200

    db.refresh(log)
    assert log.load_kg == pytest.approx(70.3)
    assert log.added_load_kg is None
    # Audit table is cleared after a successful rollback
    assert db.query(BwMigrationAudit).count() == 0


def test_rollback_requires_admin(db, client):
    """Non-admin users get 403."""
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    user = db.query(User).first()  # default seeded user is "testuser", not admin
    user.username = "testuser"
    db.commit()
    r = client.post("/api/admin/bw-migration-rollback")
    assert r.status_code == 403


def test_rerun_for_user_processes_only_target(db, client):
    seed_exercise_catalog(db); backfill_catalog_bodyweight_kind(db)
    admin = _make_admin_user(db)
    other = User(name="other", username="other", password_hash="!", bodyweight_kg=70.0)
    db.add(other); db.commit()

    other_log = _make_pullup_log(db, other, load_kg=70.0)

    # Run initial migration — both users processed (admin has no log here)
    run_bw_migration(db)
    audit_count_first = db.query(BwMigrationAudit).count()

    # Add a NEW log for `other` that wasn't present at first run
    new_log = _make_pullup_log(db, other, load_kg=25.0)

    r = client.post(f"/api/admin/bw-migration-rerun-for-user/{other.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["touched"] >= 1
    db.refresh(new_log)
    assert new_log.added_load_kg == 25.0


def test_rerun_for_user_requires_admin(db, client):
    user = db.query(User).first()
    user.username = "testuser"
    db.commit()
    r = client.post("/api/admin/bw-migration-rerun-for-user/1")
    assert r.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_bw_migration_admin.py -v`
Expected: FAIL with `404 Not Found` (endpoints don't exist yet).

- [ ] **Step 3: Add the endpoints**

In `backend/app/routers/auth.py`, append these endpoints. Reuse the existing `ADMIN_USERNAMES` set (already defined in the file per the spec):

```python
@router.post("/api/admin/bw-migration-rollback")
def admin_bw_migration_rollback(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revert every WorkoutLog touched by the BW migration to its old_load_kg.
    Clears the bw_migration_audit table on success. Admin-gated."""
    if current_user.username not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Admin only.")

    from ..models import BwMigrationAudit, WorkoutLog
    rows = db.query(BwMigrationAudit).all()
    reverted = 0
    for row in rows:
        log = db.get(WorkoutLog, row.log_id)
        if log is None:
            continue
        log.load_kg = row.old_load_kg
        log.added_load_kg = None
        reverted += 1
    db.query(BwMigrationAudit).delete()
    db.commit()

    # Recompute ranks so the rollback is reflected immediately
    try:
        from ..rank_engine import recompute_all
        recompute_all(db)
    except Exception:
        pass
    return {"reverted": reverted}


@router.post("/api/admin/bw-migration-rerun-for-user/{user_id}")
def admin_bw_migration_rerun_for_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run the BW migration for one user (e.g. after they backfill BW
    and want their old `no_bw_skipped` logs reprocessed). Admin-gated.
    Idempotent — already-audited logs are skipped."""
    if current_user.username not in ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="Admin only.")

    from ..bw_migration import rerun_bw_migration_for_user
    summary = rerun_bw_migration_for_user(db, user_id)

    try:
        from ..rank_engine import recompute_for_user
        recompute_for_user(db, user_id)
    except Exception:
        pass
    return summary
```

If `ADMIN_USERNAMES` isn't already imported at the top of `auth.py`, the symbol is in the same file (per CLAUDE.md). Verify with `grep -n ADMIN_USERNAMES backend/app/routers/auth.py` and use the existing reference.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_bw_migration_admin.py -v`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/auth.py backend/tests/test_bw_migration_admin.py
git commit -m "feat(admin): bw-migration rollback + per-user rerun endpoints

POST /api/admin/bw-migration-rollback — reverts every audited log to
its old_load_kg, clears the audit table, recomputes all ranks.

POST /api/admin/bw-migration-rerun-for-user/{user_id} — re-runs the
migration for one user (e.g. after they backfill bodyweight). Idempotent.

Both gated by ADMIN_USERNAMES = {hackesmit}."
```

---

## Phase 6 — Frontend client + context plumbing

### Task 12: Extend `client.js` for new payload + body metric helper

**Files:**
- Modify: `frontend/src/api/client.js`

**Note:** This task has no new vitest coverage (the existing `logBulkSession` tests will still pass; the new `added_load_kg` field is additive at the boundary).

- [ ] **Step 1: Find and read the current `logBulkSession` + body-metric API helpers**

Run: `grep -n "logBulkSession\|logBodyMetric" frontend/src/api/client.js`

You'll likely find `logBulkSession` already exists. Verify its current shape — it should pass through any extra fields by default (most JSON-stringify-then-POST helpers do).

- [ ] **Step 2: If `logBodyMetric` exists, verify its signature; if not, add it**

The Logger already calls `logBodyMetric(data)`. Confirm it POSTs to `/api/body-metrics`. No changes needed unless the function is missing.

- [ ] **Step 3: No code edits if both helpers already pass arbitrary fields through**

The new `added_load_kg` field will flow through the existing `logBulkSession` JSON body without code changes. Verify by skimming the implementation — if it explicitly picks fields, add `added_load_kg` to the picker.

- [ ] **Step 4: Commit only if changes were made**

```bash
git add frontend/src/api/client.js
git commit -m "chore(api-client): pass added_load_kg through bulk log payload"
```

(If no changes were needed, skip the commit — proceed to next task.)

---

### Task 13: AppContext exposes `userBodyweightKg` + `refreshUser`

**Files:**
- Modify: `frontend/src/context/AppContext.jsx`
- Test: `frontend/src/__tests__/AppContext.test.jsx` (new) — only if existing AppContext tests don't already cover this

- [ ] **Step 1: Find the current AppContext shape**

Run: `grep -n "userBodyweightKg\|bodyweight_kg\|refreshUser" frontend/src/context/AppContext.jsx`

If `userBodyweightKg` is already exposed, skip to Step 4. If user data is fetched on mount but not exposed as a selector, continue.

- [ ] **Step 2: Add the selector + a refresh callback**

The user object likely lives in `AuthContext` (per CLAUDE.md split: AppContext = programs/units/timer/realm/lang; AuthContext = current user). Verify which context owns `bodyweight_kg`. Likely AuthContext.

If it's in AuthContext: expose a `refreshUser` async function that re-fetches `/api/auth/me` and updates state, plus a derived selector `userBodyweightKg` (or just use `user?.bodyweight_kg` at the call site).

If it's in AppContext: same pattern.

Pseudo-edit for AuthContext:

```javascript
// At the top of the provider:
const refreshUser = async () => {
  try {
    const fresh = await getMe();   // existing API client call
    setUser(fresh);
  } catch { /* ignore */ }
};

// In the provider value object:
return (
  <AuthContext.Provider value={{ user, login, logout, refreshUser }}>
    {children}
  </AuthContext.Provider>
);
```

- [ ] **Step 3: Add a derived `userBodyweightKg` helper in AppContext (or just expose via useAuth)**

Cleanest: callers do `const { user, refreshUser } = useAuth(); const bw = user?.bodyweight_kg;`. No new context surface needed if AuthContext already exposes the user object.

- [ ] **Step 4: Commit if changes were made**

```bash
git add frontend/src/context/AuthContext.jsx
git commit -m "feat(auth): expose refreshUser for in-place bodyweight updates

After the user submits BW from the new SetBwPrompt component, callers
need to refresh user state so subsequent SetRows pick up the new value
without a page reload."
```

---

## Phase 7 — Frontend draft restore (Section 5 of spec)

### Task 14: `useWorkoutDraft` hook with TTL + session-aware key handling

**Files:**
- Create: `frontend/src/hooks/useWorkoutDraft.js`
- Test: `frontend/src/__tests__/useWorkoutDraft.test.js` (new)

- [ ] **Step 1: Write the failing tests**

```javascript
// frontend/src/__tests__/useWorkoutDraft.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useWorkoutDraft from '../hooks/useWorkoutDraft';

const KEY = (programId, week, sessionName) =>
  `gym-pending-${programId}-${week}-${sessionName}`;

beforeEach(() => {
  localStorage.clear();
});

describe('useWorkoutDraft', () => {
  it('persists when any set has reps_completed > 0 (no load)', () => {
    const sets = [{ load_kg: 0, reps_completed: 15 }];
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets, saved: false, knownProgramIds: [1] })
    );
    const stored = JSON.parse(localStorage.getItem(KEY(1, 1, 'A')));
    expect(stored.sets).toHaveLength(1);
    expect(stored.sets[0].reps_completed).toBe(15);
  });

  it('persists when any set has load_kg > 0', () => {
    const sets = [{ load_kg: 100, reps_completed: 5 }];
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets, saved: false, knownProgramIds: [1] })
    );
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeTruthy();
  });

  it('does not persist when all sets are empty', () => {
    const sets = [{ load_kg: 0, reps_completed: 0 }];
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets, saved: false, knownProgramIds: [1] })
    );
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
  });

  it('returns null pendingRestore when no key exists', () => {
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    expect(result.current.pendingRestore).toBeNull();
  });

  it('returns pendingRestore from existing key', () => {
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 100, reps_completed: 5 }],
    }));
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    expect(result.current.pendingRestore).toBeTruthy();
    expect(result.current.pendingRestore.sets[0].load_kg).toBe(100);
  });

  it('expires keys older than 14 days', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 3600 * 1000);
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: fifteenDaysAgo.toISOString(),
      sets: [{ load_kg: 100, reps_completed: 5 }],
    }));
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    expect(result.current.pendingRestore).toBeNull();
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
  });

  it('clears pendingRestore on session change', () => {
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 50, reps_completed: 5 }],
    }));
    const { result, rerender } = renderHook(
      ({ sessionName }) =>
        useWorkoutDraft({ programId: 1, week: 1, sessionName,
                          sets: [], saved: false, knownProgramIds: [1] }),
      { initialProps: { sessionName: 'A' } },
    );
    expect(result.current.pendingRestore.sets[0].load_kg).toBe(50);

    rerender({ sessionName: 'B' });
    expect(result.current.pendingRestore).toBeNull();
  });

  it('acceptRestore removes the localStorage key', () => {
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 50, reps_completed: 5 }],
    }));
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    act(() => result.current.acceptRestore());
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
    expect(result.current.pendingRestore).toBeNull();
  });

  it('discardRestore removes the localStorage key', () => {
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 50, reps_completed: 5 }],
    }));
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    act(() => result.current.discardRestore());
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
  });

  it('orphaned key for unknown programId is swept on mount', () => {
    localStorage.setItem(KEY(99, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 50, reps_completed: 5 }],
    }));
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    expect(localStorage.getItem(KEY(99, 1, 'A'))).toBeNull();
  });

  it('saved=true disables persistence', () => {
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [{ load_kg: 100, reps_completed: 5 }],
                        saved: true, knownProgramIds: [1] })
    );
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run useWorkoutDraft`
Expected: FAIL with `Cannot find module '../hooks/useWorkoutDraft'`.

- [ ] **Step 3: Implement the hook**

```javascript
// frontend/src/hooks/useWorkoutDraft.js
import { useEffect, useMemo, useRef, useState } from 'react';

const KEY_PREFIX = 'gym-pending-';
const TTL_MS = 14 * 24 * 60 * 60 * 1000;   // 14 days

const keyFor = (programId, week, sessionName) =>
  `${KEY_PREFIX}${programId}-${week}-${sessionName}`;

const hasMeaningfulData = (sets) =>
  Array.isArray(sets) && sets.some(
    (s) => (Number(s.load_kg) > 0) || (Number(s.reps_completed) > 0)
  );

/**
 * Manages localStorage persistence of in-progress workout sets, with TTL,
 * session-aware key handling, and orphaned-key sweeping. Replaces the
 * inline localStorage logic that previously lived in Logger.jsx.
 */
export default function useWorkoutDraft({
  programId, week, sessionName, sets, saved, knownProgramIds,
}) {
  const [pendingRestore, setPendingRestore] = useState(null);
  const sweptRef = useRef(false);
  const currentKey = useMemo(() => {
    if (!programId || !week || !sessionName) return null;
    return keyFor(programId, week, sessionName);
  }, [programId, week, sessionName]);

  // 1. Orphaned-key sweep — once per page load
  useEffect(() => {
    if (sweptRef.current) return;
    sweptRef.current = true;
    const known = new Set((knownProgramIds || []).map(String));
    const cutoff = Date.now() - TTL_MS;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        const savedAt = parsed && parsed.savedAt ? new Date(parsed.savedAt).getTime() : 0;
        if (!savedAt || savedAt < cutoff) {
          localStorage.removeItem(key);
          continue;
        }
        const matched = key.match(/^gym-pending-(\d+)-/);
        if (matched && known.size > 0 && !known.has(matched[1])) {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }, [knownProgramIds]);

  // 2. Re-evaluate pendingRestore whenever the key changes
  useEffect(() => {
    if (!currentKey) {
      setPendingRestore(null);
      return;
    }
    try {
      const raw = localStorage.getItem(currentKey);
      if (!raw) {
        setPendingRestore(null);
        return;
      }
      const parsed = JSON.parse(raw);
      const savedAt = parsed?.savedAt ? new Date(parsed.savedAt).getTime() : 0;
      if (!savedAt || savedAt < Date.now() - TTL_MS) {
        localStorage.removeItem(currentKey);
        setPendingRestore(null);
        return;
      }
      if (!Array.isArray(parsed.sets) || parsed.sets.length === 0) {
        setPendingRestore(null);
        return;
      }
      setPendingRestore({ key: currentKey, savedAt, sets: parsed.sets });
    } catch {
      setPendingRestore(null);
    }
  }, [currentKey]);

  // 3. Persist on every meaningful sets change (when not saved)
  useEffect(() => {
    if (!currentKey || saved) return;
    if (!hasMeaningfulData(sets)) return;
    localStorage.setItem(currentKey, JSON.stringify({
      savedAt: new Date().toISOString(),
      sets,
    }));
  }, [sets, currentKey, saved]);

  const acceptRestore = () => {
    if (currentKey) localStorage.removeItem(currentKey);
    setPendingRestore(null);
  };

  const discardRestore = () => {
    if (currentKey) localStorage.removeItem(currentKey);
    setPendingRestore(null);
  };

  return { pendingRestore, acceptRestore, discardRestore };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- --run useWorkoutDraft`
Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useWorkoutDraft.js frontend/src/__tests__/useWorkoutDraft.test.js
git commit -m "feat(hooks): useWorkoutDraft replaces inline restore logic

Persists when any set has load OR reps > 0 (catches BW reps-only
workouts that the old code dropped). 14-day TTL on stored entries.
Session/week change clears pendingRestore and re-evaluates. Orphaned
keys (unknown programId, expired) swept on mount. accept/discard
explicitly clean the key. saved=true disables persistence."
```

---

### Task 15: Wire `useWorkoutDraft` into Logger.jsx, drop inline localStorage code, drop `pendingRestore` from `useLoggerSession`

**Files:**
- Modify: `frontend/src/pages/Logger.jsx`
- Modify: `frontend/src/hooks/useLoggerSession.js`

- [ ] **Step 1: Drop `pendingRestore` from `useLoggerSession`**

Edit `frontend/src/hooks/useLoggerSession.js`:

- Remove the `pendingRestore` state (line 29) and `setPendingRestore` from the return object (lines 121-122).

- [ ] **Step 2: Add the new hook usage in `Logger.jsx`**

Near the top of the `Logger` component (after the existing hook calls):

```javascript
import useWorkoutDraft from '../hooks/useWorkoutDraft';
```

After the `useApp()` and `useExerciseSwap()` calls, add:

```javascript
  const { programs } = useApp();
  const knownProgramIds = (programs || []).map((p) => p.id);

  const { pendingRestore, acceptRestore, discardRestore } = useWorkoutDraft({
    programId: activeProgram?.id,
    week: currentWeek,
    sessionName: selectedSession?.session_name,
    sets,
    saved,
    knownProgramIds,
  });
```

(Confirm `programs` is available from `useApp()`; if not, inspect AppContext and use whatever the right selector is.)

- [ ] **Step 3: Remove the inline localStorage useEffect** (currently around lines 165-188)

Delete the entire `useEffect` that reads `localStorage.getItem(storageKey)` and the second useEffect that writes `localStorage.setItem`. The hook handles both now.

Inside the existing init useEffect (around line 109), the `setPendingRestore` call also goes — the hook owns that state.

- [ ] **Step 4: Update the restore banner JSX** (around lines 436-454)

Change the banner buttons to call the hook's accept/discard:

```javascript
{pendingRestore && !saved && (
  <div className="bg-info/10 border border-info/25 rounded-xl p-3 flex items-center justify-between gap-3">
    <p className="text-xs text-info">Unsaved workout found. Restore?</p>
    <div className="flex gap-2">
      <button
        onClick={() => { setSets(pendingRestore.sets); acceptRestore(); }}
        className="px-3 py-1.5 text-xs font-medium bg-info text-white rounded-lg touch-manipulation"
      >
        Restore
      </button>
      <button
        onClick={discardRestore}
        className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text touch-manipulation"
      >
        Discard
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Update the post-save cleanup** (around line 230-232)

Remove the inline `localStorage.removeItem(storageKey)` and `setPendingRestore(null)` calls — the hook handles both via `acceptRestore()` flow OR naturally via `saved=true`. (When the bulk-save succeeds, `setSaved(true)` is called; the hook's effect sees `saved=true` and stops persisting. The next session change clears the key.)

Actually, on save we WANT to clear the key now (so future visits don't show a "Restore?" prompt for the just-saved session). Replace the deleted lines with an explicit call to the hook:

```javascript
// After: setSaved(true);
acceptRestore();   // explicitly clears the localStorage key for this session
```

- [ ] **Step 6: Run frontend tests + smoke**

Run: `cd frontend && npm test -- --run`
Expected: all tests pass (the hook tests cover the behavior; Logger.jsx has no direct unit tests).

Manual smoke (will be repeated in Phase 9):
- `cd frontend && npm run dev`, log in, start a workout with one set load=100 reps=5, refresh the page, expect the "Restore?" banner.
- Click Restore, the set populates. Refresh again — banner gone.
- Start a different session, do the BW-reps-only workflow (load=0, reps=15), refresh. Expect banner. Restore. Verify.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Logger.jsx frontend/src/hooks/useLoggerSession.js
git commit -m "fix(logger): replace inline draft persistence with useWorkoutDraft

Drops the inline localStorage logic that:
 - never persisted bodyweight reps-only sets (load_kg check only)
 - left stale entries forever (no TTL)
 - bled across sessions (pendingRestore wasn't cleared on switch)
 - was overridden by overload reloads
 - never cleaned orphaned keys after program delete

The hook owns pendingRestore + accept/discard. saved=true disables
persistence; explicit acceptRestore() on bulk-save success clears the
key for the just-saved session."
```

---

## Phase 8 — Frontend BW UI

### Task 16: `SetBwPrompt` inline component

**Files:**
- Create: `frontend/src/components/SetBwPrompt.jsx`
- Test: `frontend/src/__tests__/SetBwPrompt.test.jsx` (new)

- [ ] **Step 1: Write the failing test**

```javascript
// frontend/src/__tests__/SetBwPrompt.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SetBwPrompt from '../components/SetBwPrompt';

describe('SetBwPrompt', () => {
  it('renders the Set BW button initially', () => {
    render(<SetBwPrompt unitLabel="kg" onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: /set bw/i })).toBeInTheDocument();
  });

  it('reveals an input when tapped', () => {
    render(<SetBwPrompt unitLabel="kg" onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    expect(screen.getByPlaceholderText(/bw/i)).toBeInTheDocument();
  });

  it('calls onSubmit with the entered numeric value', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    const input = screen.getByPlaceholderText(/bw/i);
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(80);
    });
  });

  it('does not call onSubmit on empty submission', () => {
    const onSubmit = vi.fn();
    render(<SetBwPrompt unitLabel="kg" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /set bw/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --run SetBwPrompt`
Expected: FAIL with `Cannot find module '../components/SetBwPrompt'`.

- [ ] **Step 3: Implement the component**

```javascript
// frontend/src/components/SetBwPrompt.jsx
import { useState } from 'react';
import { Save } from 'lucide-react';

/**
 * Inline "Set BW" affordance shown in SetRow when the user has no recorded
 * bodyweight. Tapping reveals a numeric input. Submission calls the parent's
 * onSubmit (which POSTs /api/body-metrics and refreshes user state).
 */
export default function SetBwPrompt({ unitLabel, onSubmit }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const num = parseFloat(value);
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      await onSubmit(num);
      setEditing(false);
      setValue('');
    } finally {
      setSaving(false);
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
        onChange={(e) => setValue(e.target.value)}
        placeholder={`BW (${unitLabel})`}
        className="bg-surface-light border border-accent rounded-lg px-2 py-1.5 text-xs text-text w-20 focus:ring-1 focus:ring-accent outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="p-1.5 rounded-lg bg-accent text-accent-ink touch-manipulation disabled:opacity-50"
      >
        <Save size={12} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- --run SetBwPrompt`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SetBwPrompt.jsx frontend/src/__tests__/SetBwPrompt.test.jsx
git commit -m "feat(components): SetBwPrompt for inline BW entry

Replaces the BW chip in SetRow when the user has no recorded
bodyweight. Tap to reveal input, submit to save. Parent handles
the actual POST + user refresh."
```

---

### Task 17: `SetRow` component with three layouts

**Files:**
- Create: `frontend/src/components/SetRow.jsx`
- Test: `frontend/src/__tests__/SetRow.test.jsx` (new)

- [ ] **Step 1: Write the failing tests**

```javascript
// frontend/src/__tests__/SetRow.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SetRow from '../components/SetRow';

const baseSet = {
  set_number: 1, load_kg: '', reps_completed: '',
  rpe_actual: '', is_dropset: false,
};

const noop = () => {};

function renderRow(props) {
  return render(<SetRow
    set={baseSet}
    bodyweightKind={null}
    userBodyweightKg={80}
    unitLabel="kg"
    units="kg"
    onUpdate={noop}
    onTriggerTimer={noop}
    onSetBw={noop}
    {...props}
  />);
}

describe('SetRow', () => {
  it('renders external-load layout when bodyweightKind is null', () => {
    renderRow({ bodyweightKind: null });
    // External layout has a kg input
    expect(screen.getByLabelText(/kg/i)).toBeInTheDocument();
    // No "BW" auto-chip
    expect(screen.queryByText(/^BW$/i)).not.toBeInTheDocument();
  });

  it('renders pure-BW layout: BW chip read-only, no Added field, no DS button', () => {
    renderRow({ bodyweightKind: 'pure', userBodyweightKg: 80 });
    expect(screen.getByText(/80/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/added/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^DS$/ })).not.toBeInTheDocument();
  });

  it('renders weighted-capable layout: BW + Added + Total', () => {
    renderRow({
      bodyweightKind: 'weighted_capable',
      userBodyweightKg: 80,
      set: { ...baseSet, added_load_kg: 25 },
    });
    expect(screen.getByText(/80/)).toBeInTheDocument();
    expect(screen.getByLabelText(/added/i)).toBeInTheDocument();
    expect(screen.getByText(/total/i)).toBeInTheDocument();
    expect(screen.getByText(/105/)).toBeInTheDocument();   // 80 + 25
  });

  it('renders Set BW prompt when userBodyweightKg is null', () => {
    renderRow({ bodyweightKind: 'pure', userBodyweightKg: null });
    expect(screen.getByRole('button', { name: /set bw/i })).toBeInTheDocument();
    expect(screen.queryByText(/^80$/)).not.toBeInTheDocument();
  });

  it('shows DS button on weighted-capable layout', () => {
    renderRow({ bodyweightKind: 'weighted_capable', userBodyweightKg: 80 });
    expect(screen.getByRole('button', { name: /DS/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run SetRow`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the component**

```javascript
// frontend/src/components/SetRow.jsx
import { kgToDisplay } from '../utils/units';
import { PlateCalcButton } from './PlateCalculator';
import SetBwPrompt from './SetBwPrompt';

function ExternalLayout({ set, unitLabel, weightHint, onUpdate, onTriggerTimer }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem_2rem] sm:grid-cols-[2rem_1fr_1fr_5rem_2.5rem] gap-1.5 sm:gap-2 items-end relative">
      <span className="text-xs text-text-muted text-center pb-2">{set.set_number}</span>
      <div className="relative">
        <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          {unitLabel}{weightHint ? ` ${weightHint}` : ''}
        </label>
        <input
          type="number" inputMode="decimal" value={set.load_kg}
          onChange={(e) => onUpdate('load_kg', e.target.value)}
          className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-accent outline-none min-w-0"
          placeholder="0"
        />
      </div>
      <RepsInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
      <RpeInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
      <DsButton set={set} onUpdate={onUpdate} />
    </div>
  );
}

function PureBwLayout({ set, userBodyweightKg, unitLabel, units, onUpdate, onTriggerTimer, onSetBw }) {
  const bwDisplay = userBodyweightKg ? kgToDisplay(userBodyweightKg, units) : null;
  return (
    <div className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem] sm:grid-cols-[2rem_1fr_1fr_5rem] gap-1.5 sm:gap-2 items-end">
      <span className="text-xs text-text-muted text-center pb-2">{set.set_number}</span>
      <div className="relative">
        <span className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          BW (auto, {unitLabel})
        </span>
        <div className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text-muted min-h-[42px] flex items-center">
          {bwDisplay !== null ? (
            <span>{bwDisplay}</span>
          ) : (
            <SetBwPrompt unitLabel={unitLabel} onSubmit={onSetBw} />
          )}
        </div>
      </div>
      <RepsInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
      <RpeInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
    </div>
  );
}

function WeightedCapableLayout({
  set, userBodyweightKg, unitLabel, units, onUpdate, onTriggerTimer, onSetBw,
}) {
  const bwDisplay = userBodyweightKg ? kgToDisplay(userBodyweightKg, units) : null;
  const added = parseFloat(set.added_load_kg) || 0;
  const totalKg = (userBodyweightKg || 0) + added;
  const totalDisplay = kgToDisplay(totalKg, units);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_3.5rem_2rem] sm:grid-cols-[2rem_1fr_1fr_1fr_5rem_2.5rem] gap-1.5 sm:gap-2 items-end">
        <span className="text-xs text-text-muted text-center pb-2">{set.set_number}</span>
        <div className="relative">
          <span className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
            BW (auto, {unitLabel})
          </span>
          <div className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text-muted min-h-[42px] flex items-center">
            {bwDisplay !== null ? (
              <span>{bwDisplay}</span>
            ) : (
              <SetBwPrompt unitLabel={unitLabel} onSubmit={onSetBw} />
            )}
          </div>
        </div>
        <div className="relative">
          <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
            Added {unitLabel}
          </label>
          <input
            type="number" inputMode="decimal" value={set.added_load_kg ?? ''}
            onChange={(e) => onUpdate('added_load_kg', e.target.value)}
            className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-accent outline-none min-w-0"
            placeholder="0"
          />
        </div>
        <RepsInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
        <RpeInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
        <DsButton set={set} onUpdate={onUpdate} />
      </div>
      {userBodyweightKg && (
        <p className="text-[10px] text-text-muted text-right pr-12">
          Total: {totalDisplay} {unitLabel}
        </p>
      )}
    </div>
  );
}

function RepsInput({ set, onUpdate, onTriggerTimer }) {
  return (
    <div className="relative">
      <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">Reps</label>
      <input
        type="number" inputMode="numeric" value={set.reps_completed}
        onChange={(e) => onUpdate('reps_completed', e.target.value)}
        onBlur={onTriggerTimer}
        className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-accent outline-none min-w-0"
        placeholder="0"
      />
    </div>
  );
}

function RpeInput({ set, onUpdate, onTriggerTimer }) {
  return (
    <div className="relative">
      <label className="absolute top-1 left-1.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">RPE</label>
      <input
        type="number" inputMode="decimal" step="0.5" value={set.rpe_actual}
        onChange={(e) => onUpdate('rpe_actual', e.target.value)}
        onBlur={onTriggerTimer}
        className="bg-surface-light border border-surface-lighter rounded-lg px-1.5 sm:px-2 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-accent outline-none min-w-0"
        placeholder="--"
      />
    </div>
  );
}

function DsButton({ set, onUpdate }) {
  return (
    <button
      type="button"
      onClick={() => onUpdate('is_dropset', !set.is_dropset)}
      title="Drop set"
      className={`pb-1.5 pt-1 text-[10px] font-bold rounded-lg border transition-colors touch-manipulation ${
        set.is_dropset
          ? 'border-warning bg-warning/15 text-warning'
          : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text'
      }`}
    >
      DS
    </button>
  );
}

export default function SetRow({
  set, bodyweightKind, userBodyweightKg, unitLabel, units,
  weightHint, onUpdate, onTriggerTimer, onSetBw,
}) {
  if (bodyweightKind === 'pure') {
    return <PureBwLayout
      set={set} userBodyweightKg={userBodyweightKg}
      unitLabel={unitLabel} units={units}
      onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} onSetBw={onSetBw}
    />;
  }
  if (bodyweightKind === 'weighted_capable') {
    return <WeightedCapableLayout
      set={set} userBodyweightKg={userBodyweightKg}
      unitLabel={unitLabel} units={units}
      onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} onSetBw={onSetBw}
    />;
  }
  return <ExternalLayout
    set={set} unitLabel={unitLabel} weightHint={weightHint}
    onUpdate={onUpdate} onTriggerTimer={onTriggerTimer}
  />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- --run SetRow`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SetRow.jsx frontend/src/__tests__/SetRow.test.jsx
git commit -m "feat(components): SetRow with three input layouts

External (today's UI), pure-BW (BW chip + Reps + RPE), and
weighted-capable (BW + Added + Reps + RPE + Total). Drives
input by bodyweight_kind from the catalog. Falls through to
SetBwPrompt when userBodyweightKg is null."
```

---

### Task 18: Wire `<SetRow>` into Logger.jsx, build new save payload

**Files:**
- Modify: `frontend/src/pages/Logger.jsx`

- [ ] **Step 1: Add a helper for `bodyweight_kind` lookup near the existing `getWeightHint`**

Just below `getWeightHint`:

```javascript
function getBodyweightKind(exerciseName, catalog) {
  if (!exerciseName || !catalog || !catalog.length) return null;
  const entry = catalog.find((ex) => {
    const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
    return name === exerciseName;
  });
  if (!entry || typeof entry === 'string') return null;
  return entry.bodyweight_kind || null;
}
```

- [ ] **Step 2: Read user + add `onSetBw` callback**

In the `Logger` component body, add:

```javascript
import { useAuth } from '../context/AuthContext';
import { logBodyMetric } from '../api/client';   // already imported

// Inside Logger():
const { user, refreshUser } = useAuth();
const userBodyweightKg = user?.bodyweight_kg ?? null;

const handleSetBw = async (bw) => {
  await logBodyMetric({
    date: new Date().toISOString().split('T')[0],
    bodyweight_kg: displayToKg(bw, units),
  });
  if (refreshUser) await refreshUser();
};
```

(Verify `useAuth` exposes `user` and `refreshUser` per Task 13.)

- [ ] **Step 3: Replace the inline set-row JSX with `<SetRow>`**

In the `displayGroups.map(...)` -> `dg.exercises.map((group) => ...)` -> `group.sets.map((s) => ...)` block (currently around lines 526-617), replace the inline set rendering with:

```javascript
<SetRow
  key={s.idx}
  set={s}
  bodyweightKind={getBodyweightKind(s.exercise_name, catalogData)}
  userBodyweightKg={userBodyweightKg}
  unitLabel={unitLabel}
  units={units}
  weightHint={getWeightHint(s.exercise_name, catalogData)}
  onUpdate={(field, value) => updateSet(s.idx, field, value)}
  onTriggerTimer={() => setRestTimerTriggers((prev) => ({
    ...prev, [group.name]: (prev[group.name] || 0) + 1,
  }))}
  onSetBw={handleSetBw}
/>
```

Keep the dropset-detail row JSX as-is (it appears below the main row when `s.is_dropset` is true). It still works because it operates on `dropset_load_kg` and `dropset_reps`.

Add `import SetRow from '../components/SetRow';` at the top.

- [ ] **Step 4: Update the save payload to include `added_load_kg` + remove `is_bodyweight`**

In `handleSave` (around line 200), update the payload mapping:

```javascript
sets: sets
  .filter((s) => {
    const kind = getBodyweightKind(s.exercise_name, catalogData);
    if (kind === 'pure') return +s.reps_completed > 0;
    if (kind === 'weighted_capable') return +s.reps_completed > 0;
    return +s.load_kg > 0;
  })
  .map((s) => {
    const kind = getBodyweightKind(s.exercise_name, catalogData);
    let load_kg, added_load_kg;
    if (kind === 'pure') {
      load_kg = userBodyweightKg ?? 0;
      added_load_kg = 0;
    } else if (kind === 'weighted_capable') {
      const added = parseFloat(s.added_load_kg) || 0;
      load_kg = (userBodyweightKg ?? 0) + added;
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
```

(Drop the `is_bodyweight` field entirely — the backend now derives semantics from `added_load_kg IS NOT NULL`.)

- [ ] **Step 5: Add the pre-save validation guard**

In `handleSave`, before the request:

```javascript
const needsBwButMissing = sets.some((s) => {
  const kind = getBodyweightKind(s.exercise_name, catalogData);
  return (kind === 'pure' || kind === 'weighted_capable')
         && +s.reps_completed > 0
         && !userBodyweightKg;
});
if (needsBwButMissing) {
  addToast('Set your bodyweight to log bodyweight exercises.', 'error');
  setSaving(false);
  return;
}

const oversizedAdded = sets.some((s) => {
  const kind = getBodyweightKind(s.exercise_name, catalogData);
  if (kind !== 'weighted_capable') return false;
  return parseFloat(s.added_load_kg) > 100;
});
if (oversizedAdded) {
  // Non-blocking — just warn. Continue with the save.
  addToast('Added weight > 100 kg. Double-check before lifting!', 'warning');
}
```

- [ ] **Step 6: Run frontend tests + manual smoke**

Run: `cd frontend && npm test -- --run`
Expected: all tests pass.

Manual smoke (also covered in Phase 9):
- Log into a fresh test account, no BW set. Try logging a pushup row → "Set BW" prompt appears. Tap, enter 80, save. The chip becomes "BW: 80 (auto, kg)". Save the session — verify in backend logs the request body has `load_kg: 80, added_load_kg: 0`.
- For an existing user (hackesmit) with BW set, do a weighted pullup at +25. Verify Total displays as 105. Save and inspect the row in DB.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Logger.jsx
git commit -m "feat(logger): render SetRow per exercise, send added_load_kg

- New helper getBodyweightKind() reads catalog flag.
- Inline set JSX replaced by <SetRow>; layout now driven by
  bodyweight_kind (pure | weighted_capable | null).
- handleSave builds load_kg = effective load (BW + plate for
  bodyweight class) and added_load_kg = plate-only (or 0 / null).
- Drops is_bodyweight from the payload — backend derives semantics
  from added_load_kg presence.
- Pre-save guard: blocks BW-class save if userBodyweightKg is null
  (with toast prompt). Warns on added_kg > 100 (non-blocking).
- handleSetBw POSTs body-metric and refreshes user state, so the
  BW chip updates inline without a page reload."
```

---

## Phase 9 — Docs + manual smoke

### Task 19: Update CLAUDE.md, docs/known-bugs.md; manual smoke

**Files:**
- Modify: `CLAUDE.md` (gym tracker, not the dashboard one)
- Modify: `docs/known-bugs.md`

- [ ] **Step 1: Update CLAUDE.md**

In `/mnt/c/users/danie/downloads/gym tracker/CLAUDE.md`, find the "Notable columns" section (around the WorkoutLog mention). Add to the WorkoutLog bullet:

```
- `WorkoutLog.added_load_kg` (2026-04-25): plate-only load for
  bodyweight-class lifts. NULL = external load (barbell/DB/machine).
  0 = pure BW set (pushup, ab work, BW pullup). >0 = weighted-capable
  set (weighted pullup/dip). `load_kg` always = effective load
  (BW + plate for bodyweight class). `is_bodyweight` is deprecated;
  authoritative test is `added_load_kg IS NOT NULL`.
```

Add to the catalog notes:

```
- `ExerciseCatalog.bodyweight_kind` (2026-04-25): drives Logger SetRow
  layout. "pure" / "weighted_capable" / NULL.
```

In the Muscle rank engine section, add a sentence under the bullet about back/arms:

```
- 2026-04-25: size_bonus(bw) = (bw/80)^0.5 multiplier applied to back
  and arms ratios + back rep-count fallback. Interim fairness
  correction; Phase 2 (separate spec) replaces with DOTS.
- 2026-04-25: `MAX_ADDED_RATIO_FOR_BACK_ARMS = 2.0` silently drops
  implausible weighted-pullup/dip candidates.
```

- [ ] **Step 2: Update docs/known-bugs.md**

Find the entries for the restore-unsaved-workout flow and the back-rank Champion anomaly. Mark them resolved with a 2026-04-25 note pointing to this plan.

- [ ] **Step 3: Run the manual smoke test**

Start backend + frontend locally:

```powershell
./start-dev.ps1
```

Then walk through:

1. **Fresh user, no BW.** Register a new user. Go to Logger, navigate to a session containing a bodyweight exercise (PUSHUP, PULLUP, or similar). Verify the "Set BW" button appears. Tap it, enter 80 kg, hit save. Verify the chip becomes "BW: 80 (auto, kg)".
2. **Save and verify payload.** Log one set: 15 reps. Hit Save. In the backend Fly logs (or local console), grep for the bulk-log request body. Verify it contains `"load_kg": 80, "added_load_kg": 0`.
3. **Aragorn check.** As `hackesmit` (after the migration has run on local DB at startup), check the `bw_migration_audit` table:
   ```bash
   cd backend && python -c "
   from app.database import SessionLocal
   from app.models import BwMigrationAudit
   db = SessionLocal()
   for r in db.query(BwMigrationAudit).all():
     print(r.exercise_name, r.user_id, r.old_load_kg, '→', r.new_load_kg, r.reason)
   "
   ```
   Confirm Aragorn-style corrections are flagged as expected.
4. **Real weighted pullup.** Log a +20 kg added pullup at BW 80. Verify Total displays as 100, the saved row has `load_kg=100, added_load_kg=20`.
5. **Restore round trip.** Mid-pushup workout, force-quit the browser (close the tab). Reopen, navigate back to the session. Restore banner appears with BW reps preserved. Tap Restore — sets populate.
6. **Cross-session bleed test.** Start logging Session A, fill one set. Switch to Session B. Restore banner should disappear.
7. **TTL test.** In DevTools, edit a `gym-pending-*` localStorage entry: set `savedAt` to 30 days ago. Reload Logger. The entry must be auto-cleaned and no Restore banner shown.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md docs/known-bugs.md
git commit -m "docs: update CLAUDE.md + known-bugs for BW input + back-rank fix

- New WorkoutLog.added_load_kg column + load_kg-as-effective-load
  semantic shift documented.
- ExerciseCatalog.bodyweight_kind column documented.
- size_bonus + MAX_ADDED_RATIO_FOR_BACK_ARMS noted in muscle rank
  engine section.
- Restore-unsaved-workout + back-rank Champion anomaly marked as
  resolved in docs/known-bugs.md."
```

- [ ] **Step 5: Final reminder for the user**

Print:

```
All tasks complete. Code is committed locally on `master`.

Next steps for you (the user):
  1. Review the diff locally with `git log --oneline master..` or `git diff origin/master..master`.
  2. Push: `git push`.
  3. Vercel auto-deploys the frontend.
  4. Fly.io deploy is MANUAL — run from PowerShell:
       cd backend
       flyctl deploy --app gym-tracker-api-bold-violet-7582
  5. Watch flyctl logs for the migration summary line:
       flyctl logs --app gym-tracker-api-bold-violet-7582
     Look for: "BW migration: touched N logs..."
  6. Spot-check the audit table for false positives:
       SELECT user_id, exercise_name, old_load_kg, new_load_kg
       FROM bw_migration_audit WHERE reason = 'aragorn_correction';
  7. If any look like genuine added-load lifts (rare, expected mostly
     for small/strong users), revert via:
       POST /api/admin/bw-migration-rollback   (reverts ALL — nuclear option)
     or use the per-user rerun-after-bw-set endpoint on a per-case basis.
```

---

## Self-review checklist (run after writing the plan, before handoff)

This was performed during plan authorship. Notes captured below for traceability.

**1. Spec coverage:**
- ✅ Section 1 (data model + catalog) → Tasks 1, 2, 3, 5, 6
- ✅ Section 2 (Logger UI) → Tasks 16, 17, 18 + Task 13 (context plumbing)
- ✅ Section 3 (rank engine + size_bonus + guard) → Tasks 4, 9
- ✅ Section 4 (migration + audit + rollback + per-user rerun) → Tasks 7, 8, 11
- ✅ Section 5 (restore-unsaved fix) → Tasks 14, 15
- ✅ Section 6 (testing) → embedded inline in each task; cumulative coverage matches the spec list
- ✅ Phase 2 (DOTS) explicitly excluded — only the size_bonus interim correction lands here

**2. Placeholder scan:** All steps contain code or commands. The two "no edits if helpers already pass-through" notes (Tasks 12 and 13) are intentional gating logic, not placeholders — the engineer is told exactly what to verify.

**3. Type consistency:**
- `WorkoutLog.added_load_kg`: `Optional[float]` (Pydantic) / `Mapped[float | None]` (ORM) — consistent.
- `ExerciseCatalog.bodyweight_kind`: `str | None` everywhere; values are exactly `"pure"`, `"weighted_capable"`, `None`.
- Hook return: `{ pendingRestore, acceptRestore, discardRestore }` — same shape in test and impl.
- API endpoint paths: `/api/admin/bw-migration-rollback`, `/api/admin/bw-migration-rerun-for-user/{user_id}` — used identically in router and tests.
