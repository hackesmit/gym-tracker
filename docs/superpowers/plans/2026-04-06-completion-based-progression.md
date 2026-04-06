# Completion-Based Progression & Week Streak — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace calendar-based workout progression with completion-based progression, add calendar-week streaks, and add vacation period support.

**Architecture:** Three backend changes (rewrite `_compute_current_week` + `_compute_streaks`, new `VacationPeriod` model + CRUD router) and three frontend changes (Settings vacation card, Dashboard/Tracker streak label updates). All changes are backward-compatible — no data migration needed.

**Tech Stack:** FastAPI, SQLAlchemy, React, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-06-completion-based-progression-design.md`

---

## File Map

### Backend — Create
| File | Responsibility |
|------|----------------|
| `backend/app/routers/vacation.py` | CRUD endpoints for vacation periods |
| `backend/tests/test_tracker_progression.py` | Tests for completion-based week + week streaks |
| `backend/tests/test_vacation.py` | Tests for vacation CRUD endpoints |

### Backend — Modify
| File | Lines | Change |
|------|-------|--------|
| `backend/app/models.py` | After line 243 | Add `VacationPeriod` model, add relationship on `User` |
| `backend/app/routers/tracker.py` | 88-94, 124-159, 170, 195-217, 232, 295-333, 582-636, 664-712 | Rewrite `_compute_current_week`, `_compute_streaks`, remove auto-missed logic |
| `backend/app/main.py` | 8-9, 85-89 | Import and register vacation router |

### Frontend — Modify
| File | Change |
|------|--------|
| `frontend/src/api/client.js` | Add 4 vacation API functions |
| `frontend/src/pages/Settings.jsx` | Add Vacation Mode card |
| `frontend/src/pages/Dashboard.jsx` | Rename streak labels to "Week Streak" |
| `frontend/src/pages/Tracker.jsx` | Rename streak labels, remove `missed` icon entry |

---

## Task 1: Rewrite `_compute_current_week` — completion-based

**Files:**
- Modify: `backend/app/routers/tracker.py:88-94`
- Test: `backend/tests/test_tracker_progression.py` (create)

- [ ] **Step 1: Write failing tests for the new function**

Create `backend/tests/test_tracker_progression.py`:

```python
"""Tests for completion-based week progression and week streaks."""

from datetime import date

import pytest

from app.routers.tracker import _compute_current_week, _compute_streaks


class TestComputeCurrentWeek:
    """_compute_current_week returns the first week with uncompleted sessions."""

    def _make_sessions(self, weeks, sessions_per_week=4):
        """Helper: build sessions_by_week dict."""
        result = {}
        for w in range(1, weeks + 1):
            result[w] = [
                {"session_name": f"Session {i+1}", "session_order": i + 1}
                for i in range(sessions_per_week)
            ]
        return result

    def _make_logs(self, completed_keys, status="completed"):
        """Helper: build logs_map from list of (week, session_name) tuples."""

        class FakeLog:
            def __init__(self, s):
                self.status = s

        return {key: FakeLog(status) for key in completed_keys}

    def test_no_sessions_logged_returns_week_1(self):
        sessions = self._make_sessions(4)
        logs = {}
        assert _compute_current_week(sessions, logs, 4) == 1

    def test_week_1_fully_completed_returns_week_2(self):
        sessions = self._make_sessions(4)
        logs = self._make_logs([
            (1, "Session 1"), (1, "Session 2"),
            (1, "Session 3"), (1, "Session 4"),
        ])
        assert _compute_current_week(sessions, logs, 4) == 2

    def test_week_1_partially_completed_stays_on_week_1(self):
        sessions = self._make_sessions(4)
        logs = self._make_logs([(1, "Session 1"), (1, "Session 2")])
        assert _compute_current_week(sessions, logs, 4) == 1

    def test_skipped_sessions_count_as_done(self):
        sessions = self._make_sessions(4)
        logs = self._make_logs(
            [(1, "Session 1"), (1, "Session 2"), (1, "Session 3")],
        )
        # Session 4 is skipped
        class FakeLog:
            def __init__(self):
                self.status = "skipped"
        logs[(1, "Session 4")] = FakeLog()
        assert _compute_current_week(sessions, logs, 4) == 2

    def test_all_weeks_completed_returns_last_week(self):
        sessions = self._make_sessions(2, sessions_per_week=2)
        logs = self._make_logs([
            (1, "Session 1"), (1, "Session 2"),
            (2, "Session 1"), (2, "Session 2"),
        ])
        assert _compute_current_week(sessions, logs, 2) == 2

    def test_gap_in_middle_returns_gap_week(self):
        """If week 1 is done but week 2 has a gap, returns week 2."""
        sessions = self._make_sessions(4, sessions_per_week=2)
        logs = self._make_logs([
            (1, "Session 1"), (1, "Session 2"),
            (2, "Session 1"),  # Session 2 of week 2 not done
        ])
        assert _compute_current_week(sessions, logs, 4) == 2
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd backend && python -m pytest tests/test_tracker_progression.py -v`
Expected: FAIL — old `_compute_current_week` has a different signature `(program, today)`.

- [ ] **Step 3: Rewrite `_compute_current_week`**

In `backend/app/routers/tracker.py`, replace lines 88-94:

```python
def _compute_current_week(
    sessions_by_week: dict[int, list[dict]],
    logs_map: dict[tuple[int, str], SessionLog],
    total_weeks: int,
) -> int:
    """Current week = first week with any uncompleted session (completion-based)."""
    for week_num in range(1, total_weeks + 1):
        for sess in sessions_by_week.get(week_num, []):
            key = (week_num, sess["session_name"])
            log = logs_map.get(key)
            if not log or log.status not in ("completed", "skipped"):
                return week_num
    return total_weeks
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd backend && python -m pytest tests/test_tracker_progression.py::TestComputeCurrentWeek -v`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/tracker.py backend/tests/test_tracker_progression.py
git commit -m "feat: rewrite _compute_current_week to completion-based progression"
```

---

## Task 2: Update all call sites for the new `_compute_current_week` signature

**Files:**
- Modify: `backend/app/routers/tracker.py:170, 205, 232, 295-333, 582-636, 664-712`

- [ ] **Step 1: Update `get_tracker()` (line 170)**

Replace line 170:
```python
    current_week = _compute_current_week(program, today)
```
with:
```python
    current_week = _compute_current_week(sessions_by_week, logs_map, program.total_weeks)
```

Remove the `today = date.today()` line at 169 (no longer needed here).

- [ ] **Step 2: Remove auto-missed logic in `get_tracker()` (lines 204-207)**

Replace lines 204-207:
```python
            else:
                status = "missed" if week_num < current_week else "pending"
                if status == "missed":
                    missed += 1
```
with:
```python
            else:
                status = "pending"
```

Remove the `missed` counter variable initialization (line 180) and its usage. Set `missed = 0` in the return dict or remove it. Keep the field in the response for backward compat:

The entry block becomes:
```python
            else:
                entry = {
                    "session_name": sess["session_name"],
                    "session_order": sess["session_order"],
                    "status": "pending",
                    "date": None,
                    "sets_logged": 0,
                    "session_rpe": None,
                }
```

In the return dict, set `"missed": 0`.

- [ ] **Step 3: Update `next_session` scan in `get_tracker()` (line 232)**

Replace:
```python
    for week_num in range(current_week, program.total_weeks + 1):
```
with:
```python
    for week_num in range(1, program.total_weeks + 1):
```

This scans from week 1, finding the true first uncompleted session.

- [ ] **Step 4: Update `get_week_detail()` (lines 294-333)**

At line 295, replace:
```python
    today = date.today()
    current_week = _compute_current_week(program, today)
```
with:
```python
    sessions_by_week = _distinct_sessions_by_week(db, program_id)
    logs_map_full = _session_logs_map(db, program_id)
    current_week = _compute_current_week(sessions_by_week, logs_map_full, program.total_weeks)
```

At lines 326-327, replace:
```python
        elif week_num < current_week:
            status = "missed"
```
with:
```python
        else:
            status = "pending"
```

(Remove the `else: status = "pending"` block at lines 329-331 since the new `else` covers both cases.)

- [ ] **Step 5: Update `get_adherence()` (lines 582-636)**

At line 582, replace:
```python
    current_week = _compute_current_week(program, today)
```
with:
```python
    current_week = _compute_current_week(sessions_by_week, logs_map, program.total_weeks)
```

Remove `today = date.today()` at line 581.

At line 607-608, replace the missed counting:
```python
            else:
                total_missed += 1
```
with nothing — remove the else block. Or set `total_missed = 0` in the return. Keep the response field for backward compat.

- [ ] **Step 6: Update `get_workout_today()` (lines 664-712)**

At line 664, replace:
```python
    current_week = _compute_current_week(program, today)
```
with:
```python
    current_week = _compute_current_week(sessions_by_week, logs_map, program.total_weeks)
```

At line 670, change the scan to start from week 1:
```python
    for week_num in range(1, program.total_weeks + 1):
```

Remove `today = date.today()` at line 663.

- [ ] **Step 7: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All existing tests still pass (the signature change is internal).

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/tracker.py
git commit -m "fix: update all call sites for completion-based _compute_current_week"
```

---

## Task 3: Rewrite `_compute_streaks` — calendar-week based

**Files:**
- Modify: `backend/app/routers/tracker.py:124-159`
- Test: `backend/tests/test_tracker_progression.py` (append)

- [ ] **Step 1: Write failing tests for the new streak function**

Append to `backend/tests/test_tracker_progression.py`:

```python
class TestComputeStreaks:
    """_compute_streaks counts consecutive calendar weeks with full attendance."""

    def _make_logs_map_with_dates(self, entries):
        """Helper: build logs_map from list of (week, name, date_str, status)."""

        class FakeLog:
            def __init__(self, d, s):
                self.date = date.fromisoformat(d)
                self.status = s

        return {
            (w, n): FakeLog(d, s)
            for w, n, d, s in entries
        }

    def test_no_logs_returns_zero(self):
        current, longest = _compute_streaks({}, 4, [])
        assert current == 0
        assert longest == 0

    def test_one_full_week_returns_1(self):
        # 4 sessions in one calendar week (Mon 2026-03-30 to Sun 2026-04-05)
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
        ])
        current, longest = _compute_streaks(logs, 4, [])
        assert current == 1
        assert longest == 1

    def test_two_consecutive_full_weeks(self):
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
            (2, "S1", "2026-04-06", "completed"),
            (2, "S2", "2026-04-07", "completed"),
            (2, "S3", "2026-04-08", "completed"),
            (2, "S4", "2026-04-09", "completed"),
        ])
        current, longest = _compute_streaks(logs, 4, [])
        assert current == 2
        assert longest == 2

    def test_incomplete_week_breaks_streak(self):
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
            # week 2: only 3 sessions
            (2, "S1", "2026-04-06", "completed"),
            (2, "S2", "2026-04-07", "completed"),
            (2, "S3", "2026-04-08", "completed"),
        ])
        current, longest = _compute_streaks(logs, 4, [])
        assert current == 0  # current week is incomplete
        assert longest == 1

    def test_partial_status_does_not_count(self):
        logs = self._make_logs_map_with_dates([
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "partial"),  # partial doesn't count
        ])
        current, longest = _compute_streaks(logs, 4, [])
        assert current == 0
        assert longest == 0

    def test_vacation_week_is_transparent(self):
        """A vacation week between two full weeks doesn't break the streak."""

        class FakeVacation:
            def __init__(self, s, e):
                self.start_date = date.fromisoformat(s)
                self.end_date = date.fromisoformat(e)

        vacations = [FakeVacation("2026-04-06", "2026-04-12")]  # week 2

        logs = self._make_logs_map_with_dates([
            # week 1 (Mar 30 - Apr 5)
            (1, "S1", "2026-03-30", "completed"),
            (1, "S2", "2026-03-31", "completed"),
            (1, "S3", "2026-04-01", "completed"),
            (1, "S4", "2026-04-02", "completed"),
            # week 2 skipped (vacation)
            # week 3 (Apr 13 - Apr 19)
            (3, "S1", "2026-04-13", "completed"),
            (3, "S2", "2026-04-14", "completed"),
            (3, "S3", "2026-04-15", "completed"),
            (3, "S4", "2026-04-16", "completed"),
        ])
        current, longest = _compute_streaks(logs, 4, vacations)
        assert current == 2  # vacation is transparent
        assert longest == 2
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd backend && python -m pytest tests/test_tracker_progression.py::TestComputeStreaks -v`
Expected: FAIL — old `_compute_streaks` has a different signature.

- [ ] **Step 3: Rewrite `_compute_streaks`**

Replace lines 124-159 in `backend/app/routers/tracker.py`:

```python
def _compute_streaks(
    logs_map: dict[tuple[int, str], SessionLog],
    frequency: int,
    vacation_periods: list,
) -> tuple[int, int]:
    """Return (current_streak, longest_streak) of consecutive calendar weeks
    where the user completed >= frequency sessions. Vacation weeks are transparent."""
    if not logs_map:
        return 0, 0

    # Group completed sessions by ISO calendar week
    from collections import defaultdict
    week_counts: dict[tuple[int, int], int] = defaultdict(int)  # (iso_year, iso_week) -> count
    earliest_date = None
    latest_date = None
    for (_wk, _sn), log in logs_map.items():
        if log.status == "completed":
            iso_year, iso_week, _ = log.date.isocalendar()
            week_counts[(iso_year, iso_week)] += 1
            if earliest_date is None or log.date < earliest_date:
                earliest_date = log.date
            if latest_date is None or log.date > latest_date:
                latest_date = log.date

    if not week_counts:
        return 0, 0

    # Build list of all ISO weeks from earliest to latest
    def _iso_weeks_between(start: date, end: date):
        """Yield (iso_year, iso_week) for each week from start to end."""
        current = start - timedelta(days=start.weekday())  # Monday of start week
        end_monday = end - timedelta(days=end.weekday())
        while current <= end_monday:
            iso_y, iso_w, _ = current.isocalendar()
            yield (iso_y, iso_w)
            current += timedelta(days=7)

    def _is_vacation_week(monday: date):
        """Check if this week overlaps any vacation period."""
        sunday = monday + timedelta(days=6)
        for vp in vacation_periods:
            vp_end = vp.end_date or date.max
            if vp.start_date <= sunday and vp_end >= monday:
                return True
        return False

    # Walk all calendar weeks
    all_weeks = list(_iso_weeks_between(earliest_date, latest_date))

    streak = 0
    longest = 0
    current = 0

    for iso_year, iso_week in all_weeks:
        # Find the Monday of this ISO week
        monday = date.fromisocalendar(iso_year, iso_week, 1)

        if _is_vacation_week(monday):
            continue  # transparent — doesn't break or extend

        if week_counts.get((iso_year, iso_week), 0) >= frequency:
            streak += 1
            longest = max(longest, streak)
        else:
            streak = 0

    # Current streak = trailing run (from latest week backward)
    current = 0
    for iso_year, iso_week in reversed(all_weeks):
        monday = date.fromisocalendar(iso_year, iso_week, 1)
        if _is_vacation_week(monday):
            continue
        if week_counts.get((iso_year, iso_week), 0) >= frequency:
            current += 1
        else:
            break

    return current, longest
```

- [ ] **Step 4: Run streak tests to confirm they pass**

Run: `cd backend && python -m pytest tests/test_tracker_progression.py::TestComputeStreaks -v`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/tracker.py backend/tests/test_tracker_progression.py
git commit -m "feat: rewrite _compute_streaks to calendar-week based with vacation support"
```

---

## Task 4: Update `_compute_streaks` call sites

**Files:**
- Modify: `backend/app/routers/tracker.py:226-228, 614-616`

The new `_compute_streaks` needs `logs_map`, `program.frequency`, and `vacation_periods`. We need to query vacation periods at each call site.

- [ ] **Step 1: Add VacationPeriod import to tracker.py**

At the top of `backend/app/routers/tracker.py`, add `VacationPeriod` to the models import:

```python
from ..models import (
    Program,
    ProgramExercise,
    ProgramProgress,
    SessionLog,
    VacationPeriod,
    WorkoutLog,
)
```

(This will work after Task 5 adds the model, but we add the import now and it'll resolve when we run things end-to-end.)

- [ ] **Step 2: Add vacation query helper**

Add after the existing helpers (after `_session_logs_map`):

```python
def _vacation_periods(db: Session, user_id: int) -> list[VacationPeriod]:
    """Return all vacation periods for a user, ordered by start date."""
    return (
        db.query(VacationPeriod)
        .filter(VacationPeriod.user_id == user_id)
        .order_by(VacationPeriod.start_date)
        .all()
    )
```

- [ ] **Step 3: Update `get_tracker()` streak call (around line 226)**

Replace:
```python
    current_streak, longest_streak = _compute_streaks(
        sessions_by_week, logs_map, current_week
    )
```
with:
```python
    vacations = _vacation_periods(db, program.user_id)
    current_streak, longest_streak = _compute_streaks(
        logs_map, program.frequency, vacations
    )
```

- [ ] **Step 4: Update `get_adherence()` streak call (around line 614)**

Replace:
```python
    current_streak, longest_streak = _compute_streaks(
        sessions_by_week, logs_map, current_week
    )
```
with:
```python
    vacations = _vacation_periods(db, program.user_id)
    current_streak, longest_streak = _compute_streaks(
        logs_map, program.frequency, vacations
    )
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/tracker.py
git commit -m "fix: wire up new _compute_streaks call sites with vacation periods"
```

---

## Task 5: Add `VacationPeriod` model

**Files:**
- Modify: `backend/app/models.py` (after `Achievement` class, around line 245)
- Modify: `backend/app/models.py` (add relationship on `User`, around line 42)

- [ ] **Step 1: Add VacationPeriod class**

Add after the `Achievement` class in `backend/app/models.py`:

```python
class VacationPeriod(Base):
    __tablename__ = "vacation_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="vacation_periods")
```

- [ ] **Step 2: Add relationship on User model**

In the `User` class (around line 42), add after the `body_metrics` relationship:

```python
    vacation_periods: Mapped[list["VacationPeriod"]] = relationship(back_populates="user")
```

- [ ] **Step 3: Run existing tests to confirm nothing breaks**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All existing tests PASS (new model auto-creates on metadata.create_all).

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add VacationPeriod model"
```

---

## Task 6: Create vacation CRUD router

**Files:**
- Create: `backend/app/routers/vacation.py`
- Test: `backend/tests/test_vacation.py` (create)

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_vacation.py`:

```python
"""Tests for vacation period CRUD endpoints."""

from datetime import date

import pytest


def _seed_program(db):
    """Seed a minimal program so we have a user."""
    from app.models import User
    user = db.query(User).first()
    return user.id


class TestVacationCRUD:

    def test_list_empty(self, client, db):
        res = client.get("/api/vacation")
        assert res.status_code == 200
        assert res.json() == []

    def test_create_vacation(self, client, db):
        res = client.post("/api/vacation", json={
            "start_date": "2026-04-06",
            "reason": "Spring break",
        })
        assert res.status_code == 201
        body = res.json()
        assert body["start_date"] == "2026-04-06"
        assert body["end_date"] is None
        assert body["reason"] == "Spring break"
        assert "id" in body

    def test_create_vacation_with_end_date(self, client, db):
        res = client.post("/api/vacation", json={
            "start_date": "2026-04-06",
            "end_date": "2026-04-12",
        })
        assert res.status_code == 201
        assert res.json()["end_date"] == "2026-04-12"

    def test_end_vacation(self, client, db):
        # Create open vacation
        res = client.post("/api/vacation", json={"start_date": "2026-04-06"})
        vid = res.json()["id"]

        # End it
        res = client.put(f"/api/vacation/{vid}", json={"end_date": "2026-04-10"})
        assert res.status_code == 200
        assert res.json()["end_date"] == "2026-04-10"

    def test_delete_vacation(self, client, db):
        res = client.post("/api/vacation", json={"start_date": "2026-04-06"})
        vid = res.json()["id"]

        res = client.delete(f"/api/vacation/{vid}")
        assert res.status_code == 200

        res = client.get("/api/vacation")
        assert res.json() == []

    def test_list_returns_all(self, client, db):
        client.post("/api/vacation", json={"start_date": "2026-03-01", "end_date": "2026-03-07"})
        client.post("/api/vacation", json={"start_date": "2026-04-06"})
        res = client.get("/api/vacation")
        assert len(res.json()) == 2

    def test_active_vacation(self, client, db):
        """GET /api/vacation/active returns the open vacation."""
        res = client.get("/api/vacation/active")
        assert res.status_code == 404

        client.post("/api/vacation", json={"start_date": "2026-04-06"})
        res = client.get("/api/vacation/active")
        assert res.status_code == 200
        assert res.json()["end_date"] is None
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd backend && python -m pytest tests/test_vacation.py -v`
Expected: FAIL — router doesn't exist yet.

- [ ] **Step 3: Create the vacation router**

Create `backend/app/routers/vacation.py`:

```python
"""Vacation period CRUD endpoints."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, VacationPeriod

router = APIRouter(prefix="/api/vacation", tags=["vacation"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class VacationCreate(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    reason: Optional[str] = None


class VacationUpdate(BaseModel):
    end_date: Optional[date] = None
    reason: Optional[str] = None


def _serialize(vp: VacationPeriod) -> dict:
    return {
        "id": vp.id,
        "start_date": str(vp.start_date),
        "end_date": str(vp.end_date) if vp.end_date else None,
        "reason": vp.reason,
        "created_at": str(vp.created_at) if vp.created_at else None,
    }


def _default_user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found")
    return user


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_vacations(db: Session = Depends(get_db)):
    user = _default_user(db)
    periods = (
        db.query(VacationPeriod)
        .filter(VacationPeriod.user_id == user.id)
        .order_by(VacationPeriod.start_date)
        .all()
    )
    return [_serialize(vp) for vp in periods]


@router.get("/active")
def get_active_vacation(db: Session = Depends(get_db)):
    user = _default_user(db)
    vp = (
        db.query(VacationPeriod)
        .filter(
            VacationPeriod.user_id == user.id,
            VacationPeriod.end_date.is_(None),
        )
        .order_by(VacationPeriod.start_date.desc())
        .first()
    )
    if not vp:
        raise HTTPException(status_code=404, detail="No active vacation")
    return _serialize(vp)


@router.post("", status_code=201)
def create_vacation(body: VacationCreate, db: Session = Depends(get_db)):
    user = _default_user(db)
    vp = VacationPeriod(
        user_id=user.id,
        start_date=body.start_date,
        end_date=body.end_date,
        reason=body.reason,
    )
    db.add(vp)
    db.commit()
    db.refresh(vp)
    return _serialize(vp)


@router.put("/{vacation_id}")
def update_vacation(
    vacation_id: int, body: VacationUpdate, db: Session = Depends(get_db)
):
    vp = db.query(VacationPeriod).filter(VacationPeriod.id == vacation_id).first()
    if not vp:
        raise HTTPException(status_code=404, detail="Vacation period not found")
    if body.end_date is not None:
        vp.end_date = body.end_date
    if body.reason is not None:
        vp.reason = body.reason
    db.commit()
    db.refresh(vp)
    return _serialize(vp)


@router.delete("/{vacation_id}")
def delete_vacation(vacation_id: int, db: Session = Depends(get_db)):
    vp = db.query(VacationPeriod).filter(VacationPeriod.id == vacation_id).first()
    if not vp:
        raise HTTPException(status_code=404, detail="Vacation period not found")
    db.delete(vp)
    db.commit()
    return {"ok": True}
```

- [ ] **Step 4: Register the router in main.py**

In `backend/app/main.py`, add to the imports (line 9):
```python
from .routers import analytics, logging, programs, tracker, vacation
```

Add after the existing `include_router` calls (around line 89):
```python
app.include_router(vacation.router)
```

- [ ] **Step 5: Run vacation tests**

Run: `cd backend && python -m pytest tests/test_vacation.py -v`
Expected: All 7 tests PASS.

- [ ] **Step 6: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: ALL tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/vacation.py backend/app/main.py backend/tests/test_vacation.py
git commit -m "feat: add vacation period CRUD router with tests"
```

---

## Task 7: Frontend — vacation API functions

**Files:**
- Modify: `frontend/src/api/client.js`

- [ ] **Step 1: Add vacation API functions**

Append to `frontend/src/api/client.js` (before the final export or at the end of the exports section):

```javascript
// Vacation
export const getVacations = () => request('/vacation');
export const getActiveVacation = () => request('/vacation/active');
export const startVacation = (data) => request('/vacation', { method: 'POST', body: JSON.stringify(data) });
export const endVacation = (id, data) => request(`/vacation/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteVacation = (id) => request(`/vacation/${id}`, { method: 'DELETE' });
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.js
git commit -m "feat: add vacation API client functions"
```

---

## Task 8: Frontend — Vacation Mode card in Settings

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

- [ ] **Step 1: Add imports**

Add to the import from `lucide-react` (line 6):
```javascript
import { Settings as SettingsIcon, Timer, AlertTriangle, Download, Palette, Palmtree } from 'lucide-react';
```

Add to the api import (line 7):
```javascript
import { getManual1RM, updateManual1RM, exportLogs, getActiveVacation, startVacation, endVacation } from '../api/client';
```

- [ ] **Step 2: Add vacation state and effects**

Inside the `Settings` component function, add state variables (after the existing useState calls):

```javascript
  const [vacationActive, setVacationActive] = useState(false);
  const [vacationId, setVacationId] = useState(null);
  const [vacationStart, setVacationStart] = useState(null);
  const [vacationReason, setVacationReason] = useState('');
```

Add a useEffect to load active vacation status (after the existing useEffect for 1RM):

```javascript
  useEffect(() => {
    getActiveVacation()
      .then((v) => {
        setVacationActive(true);
        setVacationId(v.id);
        setVacationStart(v.start_date);
        setVacationReason(v.reason || '');
      })
      .catch(() => {
        setVacationActive(false);
        setVacationId(null);
      });
  }, []);
```

- [ ] **Step 3: Add toggle handler**

```javascript
  const handleVacationToggle = async () => {
    try {
      if (vacationActive && vacationId) {
        const today = new Date().toISOString().split('T')[0];
        await endVacation(vacationId, { end_date: today });
        setVacationActive(false);
        setVacationId(null);
        setVacationStart(null);
        toast({ title: 'Vacation ended', description: 'Welcome back! Streak tracking resumed.' });
      } else {
        const today = new Date().toISOString().split('T')[0];
        const v = await startVacation({ start_date: today, reason: vacationReason || null });
        setVacationActive(true);
        setVacationId(v.id);
        setVacationStart(v.start_date);
        toast({ title: 'Vacation started', description: 'Streak tracking paused until you return.' });
      }
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };
```

- [ ] **Step 4: Add Vacation Mode card JSX**

Insert after the Rest Timer card (after line 198, before the Known 1RM card):

```jsx
      {/* Vacation Mode */}
      <Card title="Vacation Mode" icon={<Palmtree size={18} />}>
        <p className="text-sm text-text-muted mb-4">
          Pause streak tracking while you're away. Your progress is safe — vacation weeks won't count against your streak.
        </p>
        {vacationActive && vacationStart && (
          <p className="text-xs text-accent mb-3">
            On vacation since {new Date(vacationStart + 'T00:00:00').toLocaleDateString()}
          </p>
        )}
        {!vacationActive && (
          <input
            type="text"
            placeholder="Reason (optional)"
            value={vacationReason}
            onChange={(e) => setVacationReason(e.target.value)}
            className="w-full p-2 mb-3 rounded bg-surface-lighter text-text text-sm border border-border"
          />
        )}
        <button
          onClick={handleVacationToggle}
          className={`w-full py-2.5 rounded font-semibold text-sm transition-colors ${
            vacationActive
              ? 'bg-success/20 text-success hover:bg-success/30'
              : 'bg-warning/20 text-warning hover:bg-warning/30'
          }`}
        >
          {vacationActive ? 'End Vacation' : 'Start Vacation'}
        </button>
      </Card>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat: add Vacation Mode card to Settings page"
```

---

## Task 9: Frontend — update streak labels

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx:147-148, 271-273`
- Modify: `frontend/src/pages/Tracker.jsx:15-22, 120-121`

- [ ] **Step 1: Update Dashboard streak labels**

In `frontend/src/pages/Dashboard.jsx`, at line 148:
```jsx
              <div className="text-[10px] text-text-muted uppercase tracking-wider">Streak</div>
```
Change to:
```jsx
              <div className="text-[10px] text-text-muted uppercase tracking-wider">Week Streak</div>
```

At line 272 (the KpiCard in This Week section):
```jsx
            label="Streak"
```
Change to:
```jsx
            label="Week Streak"
```

- [ ] **Step 2: Update Tracker streak labels**

In `frontend/src/pages/Tracker.jsx`, at line 120:
```jsx
          <StatCard label="Current Streak" value={adherence.current_streak ?? 0} />
          <StatCard label="Longest Streak" value={adherence.longest_streak ?? 0} />
```
Change to:
```jsx
          <StatCard label="Current Week Streak" value={adherence.current_streak ?? 0} />
          <StatCard label="Longest Week Streak" value={adherence.longest_streak ?? 0} />
```

- [ ] **Step 3: Remove `missed` status icon from Tracker**

In `frontend/src/pages/Tracker.jsx`, remove line 19:
```javascript
  missed: { icon: XCircle, color: 'text-danger', bg: 'bg-danger/20' },
```

Remove `XCircle` from the import on line 4 (unless used elsewhere).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Tracker.jsx
git commit -m "feat: rename streak labels to Week Streak, remove missed status icon"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: ALL tests pass.

- [ ] **Step 2: Start backend locally and verify `/api/workout/today`**

Run: `cd backend && python -m uvicorn app.main:app --reload --port 8000`

In another terminal:
```bash
curl http://localhost:8000/api/workout/today | python -m json.tool
```
Expected: Returns the first uncompleted session (week 1 leg day for Daniel's current program).

- [ ] **Step 3: Verify tracker endpoint**

```bash
curl http://localhost:8000/api/tracker/1 | python -m json.tool
```
Expected: No sessions have status `"missed"`. All unlogged sessions show `"pending"`. `current_week` reflects completion state, not calendar time.

- [ ] **Step 4: Verify vacation endpoints**

```bash
curl -X POST http://localhost:8000/api/vacation -H "Content-Type: application/json" -d '{"start_date": "2026-04-06"}'
curl http://localhost:8000/api/vacation/active
```
Expected: Vacation created and active vacation returned.

- [ ] **Step 5: Start frontend and visually verify**

Run: `cd frontend && npm run dev`

Check:
- Dashboard shows "Week Streak" label
- Today's Quest shows the correct next uncompleted workout
- Tracker page shows no red "missed" sessions — all unlogged show as pending
- Settings page has Vacation Mode card
- Tracker adherence stats show "Current Week Streak" / "Longest Week Streak"

- [ ] **Step 6: Commit any final adjustments, then push**

```bash
git push origin master
```
