# Medal Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "leaderboard" view to every medal — clicking a medal opens a modal listing every user's current value for that metric, sorted, so users can see how close everyone is to the holder.

**Architecture:** New backend module `medal_leaderboards.py` computes per-metric leaderboards on demand by reusing the medal engine's categorization rules. One new GET endpoint. Frontend adds a modal triggered from the existing medal cards. No schema change.

**Tech Stack:** FastAPI + SQLAlchemy on the backend (in-memory SQLite via pytest); React 18 + Vite + Tailwind on the frontend, tested with Vitest.

**Spec:** `docs/superpowers/specs/2026-05-11-medal-leaderboard-design.md`.

---

## File structure

**Backend:**
- Create: `backend/app/medal_leaderboards.py` — single-purpose module exposing `leaderboard_for(db, metric_type) -> list[Entry]`. Dispatches by `metric_type` to per-family helpers (strength, cardio, consistency, performance). Reuses `EXERCISE_TO_LIFT_CATEGORY` and `_epley` from `medal_engine.py`.
- Modify: `backend/app/routers/medals.py` — add `GET /api/medals/{medal_id}/leaderboard`.
- Create: `backend/tests/test_medal_leaderboard.py` — pytest module for the new endpoint + helpers.

**Frontend:**
- Create: `frontend/src/utils/medalFormat.js` — extracts `formatValue` + `displayUnit` so the new modal can import without circular dependencies.
- Modify: `frontend/src/pages/Medals.jsx` — import formatters from `utils/medalFormat.js`; open `MedalLeaderboardModal` on card click and on trophy-case tile click.
- Modify: `frontend/src/api/client.js` — add `getMedalLeaderboard(medalId)`.
- Create: `frontend/src/components/MedalLeaderboardModal.jsx` — modal component.
- Create: `frontend/src/components/__tests__/MedalLeaderboardModal.test.jsx` — Vitest test.
- Modify: `frontend/src/i18n.js` — add `medals.leaderboard.title` + `medals.leaderboard.empty` for `en` and `es`.

Each backend task is one TDD round (failing test → run → implement → run → commit). Frontend tasks follow the same flow where applicable.

---

## Task 1: Module skeleton + dispatcher

**Files:**
- Create: `backend/app/medal_leaderboards.py`
- Create: `backend/tests/test_medal_leaderboard.py`

- [ ] **Step 1: Write failing test for unknown metric_type**

Create `backend/tests/test_medal_leaderboard.py` with:

```python
"""Tests for the per-medal leaderboard module + endpoint."""

import pytest
from datetime import date, timedelta

from app.medal_leaderboards import leaderboard_for, Entry
from app.medal_engine import seed_medal_catalog
from app.models import (
    User, Program, ProgramExercise, WorkoutLog, SessionLog,
    CardioLog, BodyMetric, Medal, MedalCurrentHolder,
)
from app.auth import hash_password


def test_leaderboard_for_unknown_metric_raises(db):
    with pytest.raises(ValueError):
        leaderboard_for(db, "not_a_metric")
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && pytest tests/test_medal_leaderboard.py::test_leaderboard_for_unknown_metric_raises -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.medal_leaderboards'`

- [ ] **Step 3: Create module skeleton**

Create `backend/app/medal_leaderboards.py`:

```python
"""Per-medal leaderboards — compute every user's current value for a metric.

The medal engine flips `MedalCurrentHolder` only on improvements. This module
answers a different question — *all users*, not just the leader — so it
computes values on demand. Categorization rules are imported from
`medal_engine` so the top row here always matches `MedalCurrentHolder`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Callable

from sqlalchemy import func
from sqlalchemy.orm import Session

from .medal_engine import (
    EXERCISE_TO_LIFT_CATEGORY,
    _epley,
)
from .models import (
    BodyMetric,
    CardioLog,
    ProgramExercise,
    SessionLog,
    User,
    WorkoutLog,
)


@dataclass(frozen=True)
class Entry:
    user_id: int
    username: str
    value: float
    achieved_at: datetime | None


def _real_users(db: Session) -> list[User]:
    """All users except the synthetic `preset` account."""
    return db.query(User).filter(User.username != "preset").all()


# Dispatch table populated by per-family modules below.
_HANDLERS: dict[str, Callable[[Session], list[Entry]]] = {}


def leaderboard_for(db: Session, metric_type: str) -> list[Entry]:
    """Return the sorted leaderboard for a metric.

    Sort order is metric-dependent — handlers sort their own output before
    returning so the dispatch layer stays metric-agnostic.

    Raises ValueError for unknown metrics.
    """
    handler = _HANDLERS.get(metric_type)
    if handler is None:
        raise ValueError(f"Unknown metric_type: {metric_type!r}")
    return handler(db)
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && pytest tests/test_medal_leaderboard.py::test_leaderboard_for_unknown_metric_raises -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/medal_leaderboards.py backend/tests/test_medal_leaderboard.py
git commit -m "feat(backend): scaffold medal_leaderboards module + dispatcher"
```

---

## Task 2: Strength single-lift leaderboards

**Files:**
- Modify: `backend/app/medal_leaderboards.py`
- Modify: `backend/tests/test_medal_leaderboard.py`

The 4 strength medals (`strength_1rm:bench|squat|deadlift|ohp`) share one helper. Per the spec, each user's value = `max(manual_1rm[category], best WorkoutLog passing the strict 1RM gate)`.

- [ ] **Step 1: Add shared test helpers**

Append to `backend/tests/test_medal_leaderboard.py`:

```python
def _mk_user(db, username: str, manual_1rm=None, bw_kg=None) -> User:
    u = User(
        name=username,
        username=username,
        password_hash=hash_password("x"),
        manual_1rm=manual_1rm,
        bodyweight_kg=bw_kg,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _mk_program(db, user_id: int) -> Program:
    p = Program(
        user_id=user_id,
        name="P",
        weeks=1,
        frequency=3,
        active=True,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _mk_exercise(db, program_id: int, canonical: str) -> ProgramExercise:
    pe = ProgramExercise(
        program_id=program_id,
        week=1,
        session_name="A",
        exercise_order=1,
        exercise_name=canonical,
        exercise_name_canonical=canonical,
        sets=1,
        reps_target=1,
    )
    db.add(pe)
    db.commit()
    db.refresh(pe)
    return pe


def _mk_log_1rm(db, user_id: int, pe_id: int, load_kg: float, when: date | None = None):
    log = WorkoutLog(
        user_id=user_id,
        program_exercise_id=pe_id,
        date=when or date.today(),
        set_number=1,
        load_kg=load_kg,
        reps_completed=1,
        is_true_1rm_attempt=True,
        completed_successfully=True,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
```

Then add the strength test:

```python
def test_strength_bench_orders_descending_excludes_users_without_value(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice", manual_1rm={"bench": {"value_kg": 100.0, "tested_at": "2026-01-01"}})
    b = _mk_user(db, "bob", manual_1rm={"bench": {"value_kg": 120.0, "tested_at": "2026-01-01"}})
    _ = _mk_user(db, "carol")  # no bench data

    rows = leaderboard_for(db, "strength_1rm:bench")
    usernames = [e.username for e in rows]
    values = [e.value for e in rows]

    assert usernames == ["bob", "alice"]
    assert values == [120.0, 100.0]


def test_strength_bench_manual_first_class_beats_old_logged(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")  # will have a logged 1RM
    p = _mk_program(db, a.id)
    pe = _mk_exercise(db, p.id, "Barbell Bench Press")
    _mk_log_1rm(db, a.id, pe.id, load_kg=100.0)

    b = _mk_user(db, "bob", manual_1rm={"bench": {"value_kg": 120.0, "tested_at": "2026-01-01"}})

    rows = leaderboard_for(db, "strength_1rm:bench")
    assert [e.username for e in rows] == ["bob", "alice"]


def test_strength_logged_only_counts_true_1rm_attempts(db):
    """A 5-rep bench at 100kg must not appear (engine never awards it)."""
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    p = _mk_program(db, a.id)
    pe = _mk_exercise(db, p.id, "Barbell Bench Press")
    log = WorkoutLog(
        user_id=a.id,
        program_exercise_id=pe.id,
        date=date.today(),
        set_number=1,
        load_kg=100.0,
        reps_completed=5,
        is_true_1rm_attempt=False,
        completed_successfully=True,
    )
    db.add(log)
    db.commit()

    rows = leaderboard_for(db, "strength_1rm:bench")
    assert rows == []
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k strength`
Expected: FAIL — `ValueError: Unknown metric_type: 'strength_1rm:bench'`

- [ ] **Step 3: Implement the strength single-lift helper**

Append to `backend/app/medal_leaderboards.py`:

```python
# ---------------------------------------------------------------------------
# Strength single-lift metrics
# ---------------------------------------------------------------------------

def _manual_1rm_value(user: User, key: str) -> tuple[float, datetime | None]:
    """Return (value_kg, tested_at) from User.manual_1rm — supports legacy float format."""
    m = user.manual_1rm or {}
    entry = m.get(key)
    if entry is None:
        return 0.0, None
    if isinstance(entry, (int, float)):
        return float(entry), None
    if isinstance(entry, dict):
        try:
            val = float(entry.get("value_kg") or 0.0)
        except (TypeError, ValueError):
            return 0.0, None
        tested_raw = entry.get("tested_at")
        tested = None
        if isinstance(tested_raw, str):
            try:
                tested = datetime.fromisoformat(tested_raw)
            except ValueError:
                tested = None
        return val, tested
    return 0.0, None


def _best_official_1rm_with_when(
    db: Session, user_id: int, category: str
) -> tuple[float, datetime | None]:
    """Mirror of `_best_official_1rm` in medal_engine, but also returns the log timestamp."""
    patterns = EXERCISE_TO_LIFT_CATEGORY.get(category) or []
    if not patterns:
        return 0.0, None
    rows = (
        db.query(
            ProgramExercise.exercise_name_canonical,
            WorkoutLog.load_kg,
            WorkoutLog.date,
        )
        .join(WorkoutLog, WorkoutLog.program_exercise_id == ProgramExercise.id)
        .filter(
            WorkoutLog.user_id == user_id,
            WorkoutLog.is_true_1rm_attempt.is_(True),
            WorkoutLog.completed_successfully.is_(True),
            WorkoutLog.reps_completed == 1,
            WorkoutLog.load_kg > 0,
        )
        .all()
    )
    best = 0.0
    best_when: datetime | None = None
    for name, load, d in rows:
        if not name or not load:
            continue
        lower = name.lower()
        if not any(p in lower for p in patterns):
            continue
        if load > best:
            best = float(load)
            best_when = datetime.combine(d, datetime.min.time()) if d else None
    return best, best_when


def _strength_single_lift(category: str) -> Callable[[Session], list[Entry]]:
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        for user in _real_users(db):
            manual_val, manual_when = _manual_1rm_value(user, category)
            logged_val, logged_when = _best_official_1rm_with_when(db, user.id, category)
            if manual_val >= logged_val:
                value, when = manual_val, manual_when
            else:
                value, when = logged_val, logged_when
            if value <= 0:
                continue
            out.append(Entry(user_id=user.id, username=user.username, value=value, achieved_at=when))
        out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
        return out
    return handler


for _cat in ("bench", "squat", "deadlift", "ohp"):
    _HANDLERS[f"strength_1rm:{_cat}"] = _strength_single_lift(_cat)
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k strength`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/medal_leaderboards.py backend/tests/test_medal_leaderboard.py
git commit -m "feat(backend): add strength single-lift leaderboard handlers"
```

---

## Task 3: Strength derivatives (PL total, relative)

**Files:**
- Modify: `backend/app/medal_leaderboards.py`
- Modify: `backend/tests/test_medal_leaderboard.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_medal_leaderboard.py`:

```python
def test_strength_pl_total_omits_users_missing_a_lift(db):
    seed_medal_catalog(db)
    full = _mk_user(db, "full", manual_1rm={
        "bench": {"value_kg": 100.0, "tested_at": "2026-01-01"},
        "squat": {"value_kg": 150.0, "tested_at": "2026-01-01"},
        "deadlift": {"value_kg": 180.0, "tested_at": "2026-01-01"},
    })
    partial = _mk_user(db, "partial", manual_1rm={
        "bench": {"value_kg": 100.0, "tested_at": "2026-01-01"},
        "squat": {"value_kg": 150.0, "tested_at": "2026-01-01"},
    })

    rows = leaderboard_for(db, "strength_pl_total")
    assert [e.username for e in rows] == ["full"]
    assert rows[0].value == 430.0


def test_strength_relative_omits_users_without_bodyweight(db):
    seed_medal_catalog(db)
    full = _mk_user(db, "full", bw_kg=80.0, manual_1rm={
        "bench": {"value_kg": 100.0, "tested_at": "2026-01-01"},
        "squat": {"value_kg": 150.0, "tested_at": "2026-01-01"},
        "deadlift": {"value_kg": 200.0, "tested_at": "2026-01-01"},
    })
    no_bw = _mk_user(db, "no_bw", manual_1rm={
        "bench": {"value_kg": 100.0, "tested_at": "2026-01-01"},
        "squat": {"value_kg": 150.0, "tested_at": "2026-01-01"},
        "deadlift": {"value_kg": 200.0, "tested_at": "2026-01-01"},
    })

    rows = leaderboard_for(db, "strength_relative")
    assert [e.username for e in rows] == ["full"]
    assert rows[0].value == pytest.approx(450.0 / 80.0)
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k "pl_total or relative"`
Expected: FAIL — `ValueError: Unknown metric_type: 'strength_pl_total'`

- [ ] **Step 3: Implement**

Append to `backend/app/medal_leaderboards.py`:

```python
# ---------------------------------------------------------------------------
# Strength derivatives
# ---------------------------------------------------------------------------

def _user_strength_components(db: Session, user: User) -> tuple[float, float, float, datetime | None]:
    """Return (bench, squat, deadlift, latest_achieved_at) for a user."""
    parts = []
    latest: datetime | None = None
    for cat in ("bench", "squat", "deadlift"):
        mv, mw = _manual_1rm_value(user, cat)
        lv, lw = _best_official_1rm_with_when(db, user.id, cat)
        if mv >= lv:
            v, w = mv, mw
        else:
            v, w = lv, lw
        parts.append(v)
        if w is not None and (latest is None or w > latest):
            latest = w
    return parts[0], parts[1], parts[2], latest


def _bodyweight_kg(db: Session, user: User) -> float:
    if user.bodyweight_kg and user.bodyweight_kg > 0:
        return float(user.bodyweight_kg)
    latest = (
        db.query(BodyMetric)
        .filter(BodyMetric.user_id == user.id)
        .order_by(BodyMetric.date.desc())
        .first()
    )
    if latest and latest.bodyweight_kg and latest.bodyweight_kg > 0:
        return float(latest.bodyweight_kg)
    return 0.0


def _leaderboard_pl_total(db: Session) -> list[Entry]:
    out: list[Entry] = []
    for user in _real_users(db):
        b, s, d, when = _user_strength_components(db, user)
        if min(b, s, d) <= 0:
            continue
        out.append(Entry(user_id=user.id, username=user.username, value=b + s + d, achieved_at=when))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


def _leaderboard_relative(db: Session) -> list[Entry]:
    out: list[Entry] = []
    for user in _real_users(db):
        b, s, d, when = _user_strength_components(db, user)
        if min(b, s, d) <= 0:
            continue
        bw = _bodyweight_kg(db, user)
        if bw <= 0:
            continue
        out.append(Entry(user_id=user.id, username=user.username, value=(b + s + d) / bw, achieved_at=when))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


_HANDLERS["strength_pl_total"] = _leaderboard_pl_total
_HANDLERS["strength_relative"] = _leaderboard_relative
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k "pl_total or relative"`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/medal_leaderboards.py backend/tests/test_medal_leaderboard.py
git commit -m "feat(backend): add strength derivative leaderboards (pl_total, relative)"
```

---

## Task 4: Cardio leaderboards (longest + fastest)

**Files:**
- Modify: `backend/app/medal_leaderboards.py`
- Modify: `backend/tests/test_medal_leaderboard.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_medal_leaderboard.py`:

```python
def _mk_cardio(db, user_id: int, modality: str, distance_km: float, duration_min: float, when: date | None = None):
    log = CardioLog(
        user_id=user_id,
        modality=modality,
        distance_km=distance_km,
        duration_minutes=duration_min,
        date=when or date.today(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def test_cardio_longest_run_orders_descending(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    b = _mk_user(db, "bob")
    _mk_cardio(db, a.id, "run", distance_km=5.0, duration_min=30.0)
    _mk_cardio(db, a.id, "run", distance_km=10.0, duration_min=70.0)
    _mk_cardio(db, b.id, "run", distance_km=8.0, duration_min=50.0)

    rows = leaderboard_for(db, "cardio_longest:run")
    assert [e.username for e in rows] == ["alice", "bob"]
    assert rows[0].value == 10.0


def test_cardio_fastest_mile_orders_ascending(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    b = _mk_user(db, "bob")
    _mk_cardio(db, a.id, "run", distance_km=5.0, duration_min=30.0)  # 6 min/km
    _mk_cardio(db, b.id, "run", distance_km=5.0, duration_min=25.0)  # 5 min/km

    rows = leaderboard_for(db, "cardio_fastest_mile")
    assert [e.username for e in rows] == ["bob", "alice"]
    assert rows[0].value == pytest.approx(5.0)


def test_cardio_preset_user_excluded(db):
    seed_medal_catalog(db)
    preset = _mk_user(db, "preset")
    a = _mk_user(db, "alice")
    _mk_cardio(db, preset.id, "run", distance_km=100.0, duration_min=600.0)
    _mk_cardio(db, a.id, "run", distance_km=10.0, duration_min=60.0)

    rows = leaderboard_for(db, "cardio_longest:run")
    assert [e.username for e in rows] == ["alice"]
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k cardio`
Expected: FAIL — `ValueError`

- [ ] **Step 3: Implement**

Append to `backend/app/medal_leaderboards.py`:

```python
# ---------------------------------------------------------------------------
# Cardio
# ---------------------------------------------------------------------------

def _leaderboard_longest(modality: str) -> Callable[[Session], list[Entry]]:
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        for user in _real_users(db):
            row = (
                db.query(CardioLog.distance_km, CardioLog.date)
                .filter(
                    CardioLog.user_id == user.id,
                    CardioLog.modality == modality,
                    CardioLog.distance_km > 0,
                )
                .order_by(CardioLog.distance_km.desc())
                .first()
            )
            if row is None:
                continue
            dist, d = row
            when = datetime.combine(d, datetime.min.time()) if d else None
            out.append(Entry(user_id=user.id, username=user.username, value=float(dist), achieved_at=when))
        out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
        return out
    return handler


def _leaderboard_fastest(min_distance_km: float, scale_to_km: float | None) -> Callable[[Session], list[Entry]]:
    """Min pace metric.

    `min_distance_km` is the qualifying threshold (e.g. 1.6 for the mile).
    `scale_to_km` is the constant the pace is multiplied by to produce a
    total minutes value comparable across run lengths — None means "pace
    only" (Fastest Mile is stored as min/km in the engine).
    """
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        for user in _real_users(db):
            rows = (
                db.query(CardioLog.distance_km, CardioLog.duration_minutes, CardioLog.date)
                .filter(
                    CardioLog.user_id == user.id,
                    CardioLog.modality == "run",
                    CardioLog.distance_km >= min_distance_km,
                    CardioLog.duration_minutes > 0,
                )
                .all()
            )
            best = None
            best_when = None
            for dist, dur, d in rows:
                if not dist or not dur:
                    continue
                pace = float(dur) / float(dist)
                value = pace * scale_to_km if scale_to_km is not None else pace
                if best is None or value < best:
                    best = value
                    best_when = datetime.combine(d, datetime.min.time()) if d else None
            if best is None:
                continue
            out.append(Entry(user_id=user.id, username=user.username, value=best, achieved_at=best_when))
        out.sort(key=lambda e: (e.value, e.achieved_at or datetime.max))
        return out
    return handler


_HANDLERS["cardio_longest:run"] = _leaderboard_longest("run")
_HANDLERS["cardio_longest:bike"] = _leaderboard_longest("bike")
_HANDLERS["cardio_longest:swim"] = _leaderboard_longest("swim")
_HANDLERS["cardio_fastest_mile"] = _leaderboard_fastest(1.6, None)
_HANDLERS["cardio_fastest_5k"] = _leaderboard_fastest(5.0, 5.0)
_HANDLERS["cardio_fastest_10k"] = _leaderboard_fastest(10.0, 10.0)
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k cardio`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/medal_leaderboards.py backend/tests/test_medal_leaderboard.py
git commit -m "feat(backend): add cardio longest + fastest pace leaderboards"
```

---

## Task 5: Consistency — sessions, volume, perfect weeks

**Files:**
- Modify: `backend/app/medal_leaderboards.py`
- Modify: `backend/tests/test_medal_leaderboard.py`

These four metrics all derive from SessionLog and WorkoutLog. They mirror the same SQL the engine uses in `check_consistency_medals`.

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_medal_leaderboard.py`:

```python
def _mk_session(db, user_id: int, program_id: int, when: date, name: str = "A"):
    s = SessionLog(
        user_id=user_id,
        program_id=program_id,
        week=1,
        session_name=name,
        date=when,
        status="completed",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_consistency_sessions_30d_counts_recent(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    pa = _mk_program(db, a.id)
    today = date.today()
    for i, name in enumerate(["A", "B", "C"]):
        _mk_session(db, a.id, pa.id, today - timedelta(days=i), name=name)

    b = _mk_user(db, "bob")
    pb = _mk_program(db, b.id)
    _mk_session(db, b.id, pb.id, today, name="A")
    _mk_session(db, b.id, pb.id, today - timedelta(days=60), name="B")  # too old

    rows = leaderboard_for(db, "consistency_sessions_30d")
    assert [(e.username, int(e.value)) for e in rows] == [("alice", 3), ("bob", 1)]


def test_consistency_volume_30d_uses_added_load_for_bw_lifts(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    p = _mk_program(db, a.id)
    pe = _mk_exercise(db, p.id, "Weighted Pullup")
    log = WorkoutLog(
        user_id=a.id,
        program_exercise_id=pe.id,
        date=date.today(),
        set_number=1,
        load_kg=80.0,      # bw 80 + 20kg plate
        added_load_kg=20.0,
        reps_completed=5,
    )
    db.add(log)
    db.commit()

    rows = leaderboard_for(db, "consistency_volume_30d")
    # 20 (plate) * 5 reps = 100, not 80*5=400.
    assert rows[0].username == "alice"
    assert rows[0].value == pytest.approx(100.0)
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k consistency`
Expected: FAIL

- [ ] **Step 3: Implement**

Append to `backend/app/medal_leaderboards.py`:

```python
# ---------------------------------------------------------------------------
# Consistency
# ---------------------------------------------------------------------------

def _leaderboard_sessions(window_days: int | None) -> Callable[[Session], list[Entry]]:
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        today = date.today()
        cutoff = today - timedelta(days=window_days) if window_days else None
        for user in _real_users(db):
            q = (
                db.query(func.count(SessionLog.id), func.max(SessionLog.date))
                .filter(
                    SessionLog.user_id == user.id,
                    SessionLog.status == "completed",
                )
            )
            if cutoff is not None:
                q = q.filter(SessionLog.date >= cutoff)
            count, last_d = q.one()
            count = int(count or 0)
            if count <= 0:
                continue
            when = datetime.combine(last_d, datetime.min.time()) if last_d else None
            out.append(Entry(user_id=user.id, username=user.username, value=float(count), achieved_at=when))
        out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
        return out
    return handler


def _leaderboard_volume_30d(db: Session) -> list[Entry]:
    today = date.today()
    cutoff = today - timedelta(days=30)
    out: list[Entry] = []
    for user in _real_users(db):
        vol = (
            db.query(
                func.coalesce(
                    func.sum(
                        func.coalesce(WorkoutLog.added_load_kg, WorkoutLog.load_kg) * WorkoutLog.reps_completed
                    ),
                    0.0,
                )
            )
            .filter(WorkoutLog.user_id == user.id, WorkoutLog.date >= cutoff)
            .scalar()
        ) or 0.0
        vol = float(vol)
        if vol <= 0:
            continue
        last_d = (
            db.query(func.max(WorkoutLog.date))
            .filter(WorkoutLog.user_id == user.id, WorkoutLog.date >= cutoff)
            .scalar()
        )
        when = datetime.combine(last_d, datetime.min.time()) if last_d else None
        out.append(Entry(user_id=user.id, username=user.username, value=vol, achieved_at=when))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


def _leaderboard_perfect_weeks(db: Session) -> list[Entry]:
    today = date.today()
    window_start = today - timedelta(days=180)
    out: list[Entry] = []
    for user in _real_users(db):
        rows = (
            db.query(SessionLog.date)
            .filter(
                SessionLog.user_id == user.id,
                SessionLog.status == "completed",
                SessionLog.date >= window_start,
            )
            .all()
        )
        week_counter: dict[tuple[int, int], int] = {}
        latest: date | None = None
        for (d,) in rows:
            y, w, _ = d.isocalendar()
            week_counter[(y, w)] = week_counter.get((y, w), 0) + 1
            if latest is None or d > latest:
                latest = d
        perfect = sum(1 for v in week_counter.values() if v >= 3)
        if perfect <= 0:
            continue
        when = datetime.combine(latest, datetime.min.time()) if latest else None
        out.append(Entry(user_id=user.id, username=user.username, value=float(perfect), achieved_at=when))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


_HANDLERS["consistency_sessions_30d"] = _leaderboard_sessions(30)
_HANDLERS["consistency_sessions_all"] = _leaderboard_sessions(None)
_HANDLERS["consistency_volume_30d"] = _leaderboard_volume_30d
_HANDLERS["consistency_perfect_weeks"] = _leaderboard_perfect_weeks
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k consistency`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/medal_leaderboards.py backend/tests/test_medal_leaderboard.py
git commit -m "feat(backend): add consistency leaderboards (sessions, volume, perfect weeks)"
```

---

## Task 6: Consistency — longest streak

**Files:**
- Modify: `backend/app/medal_leaderboards.py`
- Modify: `backend/tests/test_medal_leaderboard.py`

The engine does not currently award `consistency_longest_streak`, so this metric's leaderboard may have rows while `MedalCurrentHolder` is empty — accepted. The rule: longest run of consecutive ISO weeks each containing ≥1 completed session.

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_medal_leaderboard.py`:

```python
def test_consistency_longest_streak_counts_consecutive_weeks(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    p = _mk_program(db, a.id)
    today = date.today()
    # 4 consecutive weeks of training, then a 1-week gap, then 1 more week.
    for weeks_ago in (5, 4, 3, 2, 0):
        _mk_session(db, a.id, p.id, today - timedelta(weeks=weeks_ago), name=f"w{weeks_ago}")
    rows = leaderboard_for(db, "consistency_longest_streak")
    assert rows[0].username == "alice"
    assert int(rows[0].value) == 4
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && pytest tests/test_medal_leaderboard.py::test_consistency_longest_streak_counts_consecutive_weeks -v`
Expected: FAIL — `ValueError: Unknown metric_type: 'consistency_longest_streak'`

- [ ] **Step 3: Implement**

Append to `backend/app/medal_leaderboards.py`:

```python
def _leaderboard_longest_streak(db: Session) -> list[Entry]:
    out: list[Entry] = []
    for user in _real_users(db):
        rows = (
            db.query(SessionLog.date)
            .filter(
                SessionLog.user_id == user.id,
                SessionLog.status == "completed",
            )
            .all()
        )
        if not rows:
            continue
        weeks = sorted({(d.isocalendar()[0], d.isocalendar()[1]) for (d,) in rows})
        if not weeks:
            continue
        # Walk in order, count consecutive ISO weeks.
        def _next_week(yw: tuple[int, int]) -> tuple[int, int]:
            y, w = yw
            monday = date.fromisocalendar(y, w, 1) + timedelta(days=7)
            ny, nw, _ = monday.isocalendar()
            return (ny, nw)

        best = 1
        run = 1
        for i in range(1, len(weeks)):
            if weeks[i] == _next_week(weeks[i - 1]):
                run += 1
                best = max(best, run)
            else:
                run = 1
        latest = max(d for (d,) in rows)
        out.append(Entry(user_id=user.id, username=user.username, value=float(best),
                         achieved_at=datetime.combine(latest, datetime.min.time())))
    out.sort(key=lambda e: (-e.value, e.achieved_at or datetime.max))
    return out


_HANDLERS["consistency_longest_streak"] = _leaderboard_longest_streak
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && pytest tests/test_medal_leaderboard.py::test_consistency_longest_streak_counts_consecutive_weeks -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/medal_leaderboards.py backend/tests/test_medal_leaderboard.py
git commit -m "feat(backend): add consistency_longest_streak leaderboard"
```

---

## Task 7: Performance leaderboards

**Files:**
- Modify: `backend/app/medal_leaderboards.py`
- Modify: `backend/tests/test_medal_leaderboard.py`

The engine already computes per-user values for these in `check_performance_medals`. We reuse its helpers (`_best_estimated_1rm_in_window` is already a per-user function).

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_medal_leaderboard.py`:

```python
def test_performance_1rm_increase_30d_orders_by_delta(db):
    seed_medal_catalog(db)
    a = _mk_user(db, "alice")
    p = _mk_program(db, a.id)
    pe = _mk_exercise(db, p.id, "Barbell Bench Press")
    today = date.today()
    # Last 30d: 110kg x1; Prior 30d: 100kg x1 → delta 10kg.
    log_recent = WorkoutLog(
        user_id=a.id, program_exercise_id=pe.id,
        date=today - timedelta(days=5),
        set_number=1, load_kg=110.0, reps_completed=1,
    )
    log_prior = WorkoutLog(
        user_id=a.id, program_exercise_id=pe.id,
        date=today - timedelta(days=45),
        set_number=1, load_kg=100.0, reps_completed=1,
    )
    db.add_all([log_recent, log_prior])
    db.commit()

    rows = leaderboard_for(db, "performance_1rm_increase_30d")
    assert rows[0].username == "alice"
    assert rows[0].value == pytest.approx(10.0)
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && pytest tests/test_medal_leaderboard.py::test_performance_1rm_increase_30d_orders_by_delta -v`
Expected: FAIL — `ValueError`

- [ ] **Step 3: Implement**

Append to `backend/app/medal_leaderboards.py`:

```python
# ---------------------------------------------------------------------------
# Performance (rolling 30d deltas)
# ---------------------------------------------------------------------------

from .medal_engine import _best_estimated_1rm_in_window  # noqa: E402


def _performance_user_metrics(db: Session, user_id: int) -> dict[str, float]:
    """Recompute the 3 performance metrics for one user. Returns {metric: value} for nonzero values only."""
    today = date.today()
    last_start = today - timedelta(days=30)
    prior_start = today - timedelta(days=60)
    prior_end = last_start - timedelta(days=1)

    best_delta_kg = 0.0
    best_pct = 0.0
    for cat in EXERCISE_TO_LIFT_CATEGORY:
        last = _best_estimated_1rm_in_window(db, user_id, cat, last_start, today)
        prior = _best_estimated_1rm_in_window(db, user_id, cat, prior_start, prior_end)
        if last <= 0 or prior <= 0:
            continue
        delta = last - prior
        if delta > best_delta_kg:
            best_delta_kg = delta
            best_pct = (last - prior) / prior * 100.0

    out: dict[str, float] = {}
    if best_delta_kg > 0:
        out["performance_1rm_increase_30d"] = best_delta_kg
        out["performance_most_improved_pct"] = best_pct

    vol_last = (
        db.query(func.coalesce(func.sum(func.coalesce(WorkoutLog.added_load_kg, WorkoutLog.load_kg) * WorkoutLog.reps_completed), 0.0))
        .filter(WorkoutLog.user_id == user_id, WorkoutLog.date >= last_start, WorkoutLog.date <= today)
        .scalar()
    ) or 0.0
    vol_prior = (
        db.query(func.coalesce(func.sum(func.coalesce(WorkoutLog.added_load_kg, WorkoutLog.load_kg) * WorkoutLog.reps_completed), 0.0))
        .filter(WorkoutLog.user_id == user_id, WorkoutLog.date >= prior_start, WorkoutLog.date <= prior_end)
        .scalar()
    ) or 0.0
    if vol_prior > 0 and vol_last > vol_prior:
        out["performance_volume_increase_30d"] = (float(vol_last) - float(vol_prior)) / float(vol_prior) * 100.0
    return out


def _leaderboard_performance(metric: str) -> Callable[[Session], list[Entry]]:
    def handler(db: Session) -> list[Entry]:
        out: list[Entry] = []
        for user in _real_users(db):
            metrics = _performance_user_metrics(db, user.id)
            v = metrics.get(metric, 0.0)
            if v <= 0:
                continue
            out.append(Entry(user_id=user.id, username=user.username, value=v, achieved_at=None))
        out.sort(key=lambda e: -e.value)
        return out
    return handler


_HANDLERS["performance_1rm_increase_30d"] = _leaderboard_performance("performance_1rm_increase_30d")
_HANDLERS["performance_volume_increase_30d"] = _leaderboard_performance("performance_volume_increase_30d")
_HANDLERS["performance_most_improved_pct"] = _leaderboard_performance("performance_most_improved_pct")
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && pytest tests/test_medal_leaderboard.py::test_performance_1rm_increase_30d_orders_by_delta -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/medal_leaderboards.py backend/tests/test_medal_leaderboard.py
git commit -m "feat(backend): add performance leaderboards (1RM/volume/most-improved)"
```

---

## Task 8: API endpoint + invariant test

**Files:**
- Modify: `backend/app/routers/medals.py`
- Modify: `backend/tests/test_medal_leaderboard.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_medal_leaderboard.py`:

```python
def test_endpoint_returns_404_for_unknown_medal(client):
    resp = client.get("/api/medals/9999/leaderboard")
    assert resp.status_code == 404


def test_endpoint_returns_entries_sorted(client, db):
    seed_medal_catalog(db)
    _mk_user(db, "alice", manual_1rm={"bench": {"value_kg": 100.0, "tested_at": "2026-01-01"}})
    _mk_user(db, "bob", manual_1rm={"bench": {"value_kg": 120.0, "tested_at": "2026-01-01"}})
    medal = db.query(Medal).filter(Medal.metric_type == "strength_1rm:bench").first()

    resp = client.get(f"/api/medals/{medal.id}/leaderboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["medal"]["metric_type"] == "strength_1rm:bench"
    assert [e["username"] for e in body["entries"]] == ["bob", "alice"]
    assert body["entries"][0]["value"] == 120.0


def test_leader_matches_current_holder_for_strength(client, db):
    """Invariant: when MedalCurrentHolder exists, the top of the leaderboard equals it."""
    seed_medal_catalog(db)
    _mk_user(db, "alice", manual_1rm={"bench": {"value_kg": 100.0, "tested_at": "2026-01-01"}})
    _mk_user(db, "bob", manual_1rm={"bench": {"value_kg": 130.0, "tested_at": "2026-01-01"}})
    medal = db.query(Medal).filter(Medal.metric_type == "strength_1rm:bench").first()
    # Simulate the engine running — write a MedalCurrentHolder row directly.
    bob = db.query(User).filter(User.username == "bob").first()
    db.add(MedalCurrentHolder(medal_id=medal.id, user_id=bob.id, value=130.0))
    db.commit()

    resp = client.get(f"/api/medals/{medal.id}/leaderboard")
    body = resp.json()
    top = body["entries"][0]
    holder = db.get(MedalCurrentHolder, medal.id)
    assert top["user_id"] == holder.user_id
    assert top["value"] == holder.value
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v -k "endpoint or invariant or matches"`
Expected: FAIL — 404 not returned / route not found

- [ ] **Step 3: Add the endpoint**

Modify `backend/app/routers/medals.py`. Add this import near the top:

```python
from ..medal_leaderboards import leaderboard_for
```

Then append at the end of the file:

```python
@router.get("/{medal_id}/leaderboard")
def medal_leaderboard(
    medal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    medal = db.get(Medal, medal_id)
    if medal is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="medal not found")

    entries = leaderboard_for(db, medal.metric_type)
    return {
        "medal": {
            "id": medal.id,
            "name": medal.name,
            "metric_type": medal.metric_type,
            "unit": medal.unit,
            "higher_is_better": medal.higher_is_better,
            "category": medal.category,
        },
        "entries": [
            {
                "user_id": e.user_id,
                "username": e.username,
                "value": e.value,
                "achieved_at": e.achieved_at.isoformat() if e.achieved_at else None,
            }
            for e in entries
        ],
    }
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && pytest tests/test_medal_leaderboard.py -v`
Expected: All tests in the file PASS.

Also run the full backend suite to catch regressions:

Run: `cd backend && pytest -q`
Expected: No new failures (the pre-existing unrelated `test_log_bulk_relog_replaces` failure documented in CLAUDE.md may still appear).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/medals.py backend/tests/test_medal_leaderboard.py
git commit -m "feat(backend): GET /api/medals/{id}/leaderboard endpoint"
```

---

## Task 9: Extract frontend formatters

**Files:**
- Create: `frontend/src/utils/medalFormat.js`
- Modify: `frontend/src/pages/Medals.jsx`

- [ ] **Step 1: Create the new utils file**

Create `frontend/src/utils/medalFormat.js`:

```javascript
// Shared formatting for medal values + units.
// Used by both the Medals page card and the new leaderboard modal.

export function formatValue(v, unit, higherIsBetter) {
  if (v == null) return '—';
  if (unit === 'min' || unit === 'min/km') {
    const display = unit === 'min/km' ? v * 1.609344 : v;
    let minutes = Math.floor(display);
    let seconds = Math.round((display - minutes) * 60);
    if (seconds === 60) { minutes += 1; seconds = 0; }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  if (typeof v !== 'number') return String(v);
  return Math.abs(v) >= 1000
    ? Math.round(v).toLocaleString()
    : (v % 1 === 0 ? v.toString() : v.toFixed(1));
}

// Stored unit → display unit. Pace stored in min/km but a "Fastest Mile" medal
// must read in /mi for the value to make sense.
export function displayUnit(unit) {
  return unit === 'min/km' ? '/mi' : unit;
}
```

- [ ] **Step 2: Update `pages/Medals.jsx` to import from the new module**

In `frontend/src/pages/Medals.jsx`:

Delete the local `formatValue` definition (lines 54-67 in the current file) and the local `displayUnit` (lines 71-73).

Add this import near the top of the file (after the existing imports):

```javascript
import { formatValue, displayUnit } from '../utils/medalFormat';
```

- [ ] **Step 3: Verify nothing broke**

Run: `cd frontend && npm test -- --run`
Expected: existing tests PASS (no behavioral change).

Manually verify in dev (`cd frontend && npm run dev`) that the Medals page still renders values correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/medalFormat.js frontend/src/pages/Medals.jsx
git commit -m "refactor(frontend): extract medal formatters to utils/medalFormat"
```

---

## Task 10: API client + i18n strings

**Files:**
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/i18n.js`

- [ ] **Step 1: Add the client function**

Find the existing medals client functions in `frontend/src/api/client.js` (`listMedals`, `getMyMedals`) and add a sibling:

```javascript
export async function getMedalLeaderboard(medalId) {
  return apiFetch(`/medals/${medalId}/leaderboard`);
}
```

(Use whatever helper the file already uses for GET — `apiFetch`, `api.get`, etc. Match the existing style.)

- [ ] **Step 2: Add i18n strings**

In `frontend/src/i18n.js`, add two new entries under `medals.*` for both `en` and `es`:

```javascript
// English
'medals.leaderboard.title': 'Leaderboard',
'medals.leaderboard.empty': 'No records yet. Log a qualifying lift to claim this medal.',

// Spanish
'medals.leaderboard.title': 'Clasificación',
'medals.leaderboard.empty': 'Aún no hay registros. Registra un levantamiento elegible para reclamar esta medalla.',
```

(Insert in alphabetical order if the file is sorted; otherwise next to other `medals.*` keys.)

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.js frontend/src/i18n.js
git commit -m "feat(frontend): add getMedalLeaderboard client + i18n strings"
```

---

## Task 11: Modal component + Vitest

**Files:**
- Create: `frontend/src/components/MedalLeaderboardModal.jsx`
- Create: `frontend/src/components/__tests__/MedalLeaderboardModal.test.jsx`

- [ ] **Step 1: Write failing Vitest test**

Create `frontend/src/components/__tests__/MedalLeaderboardModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MedalLeaderboardModal from '../MedalLeaderboardModal';

vi.mock('../../api/client', () => ({
  getMedalLeaderboard: vi.fn(async () => ({
    medal: {
      id: 1, name: 'Strongest Bench 1RM',
      metric_type: 'strength_1rm:bench', unit: 'kg',
      higher_is_better: true, category: 'strength',
    },
    entries: [
      { user_id: 2, username: 'bob',   value: 120.0, achieved_at: '2026-04-01T00:00:00Z' },
      { user_id: 1, username: 'alice', value: 100.0, achieved_at: '2026-03-01T00:00:00Z' },
    ],
  })),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'alice' } }),
}));

describe('MedalLeaderboardModal', () => {
  it('renders entries in order and highlights the current user row', async () => {
    render(<MedalLeaderboardModal medal={{ id: 1, name: 'Strongest Bench 1RM' }} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('bob')).toBeInTheDocument());
    const rows = screen.getAllByTestId('leaderboard-row');
    expect(rows.map((r) => r.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('bob'), expect.stringContaining('alice')]),
    );
    expect(rows[0].textContent).toContain('bob');
    expect(rows[1].textContent).toContain('alice');
    // Current-user row gets the marker class.
    expect(rows[1].getAttribute('data-current-user')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `cd frontend && npm test -- --run MedalLeaderboardModal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/MedalLeaderboardModal.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { getMedalLeaderboard } from '../api/client';
import { formatValue, displayUnit } from '../utils/medalFormat';
import MedalBadge from './MedalBadge';
import LoadingSpinner from './LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

export default function MedalLeaderboardModal({ medal, onClose }) {
  const t = useT();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!medal?.id) return;
    let cancelled = false;
    getMedalLeaderboard(medal.id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'Failed to load leaderboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [medal?.id]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!medal) return null;

  const entries = data?.entries || [];
  const m = data?.medal || medal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg sm:rounded-2xl bg-surface text-text border border-surface-lighter shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 p-4 border-b border-surface-lighter">
          <MedalBadge icon={m.icon} category={m.category} size={56} title={m.name} />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted">{m.category}</p>
            <h3 className="font-semibold text-base sm:text-lg leading-tight">{m.name}</h3>
            <p className="text-xs text-text-muted mt-1">{t('medals.leaderboard.title') || 'Leaderboard'}</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl leading-none px-2 -mr-2 touch-manipulation"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="overflow-y-auto p-4 flex-1">
          {loading && <LoadingSpinner />}
          {err && <p className="text-sm text-danger">{err}</p>}
          {!loading && !err && entries.length === 0 && (
            <p className="text-sm text-text-muted">
              {t('medals.leaderboard.empty') || 'No records yet.'}
            </p>
          )}
          {!loading && !err && entries.length > 0 && (
            <ul className="space-y-1">
              {entries.map((e) => {
                const isMe = user && e.user_id === user.id;
                return (
                  <li
                    key={e.user_id}
                    data-testid="leaderboard-row"
                    data-current-user={isMe ? 'true' : 'false'}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                      isMe
                        ? 'border-accent/40 bg-accent/5'
                        : 'border-surface-lighter bg-surface-light'
                    }`}
                  >
                    <span className="text-sm font-medium truncate">{e.username}</span>
                    <span className="text-sm font-mono tabular-nums">
                      {formatValue(e.value, m.unit, m.higher_is_better)}
                      {m.unit && <span className="text-text-muted ml-1">{displayUnit(m.unit)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd frontend && npm test -- --run MedalLeaderboardModal`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MedalLeaderboardModal.jsx frontend/src/components/__tests__/MedalLeaderboardModal.test.jsx
git commit -m "feat(frontend): MedalLeaderboardModal component"
```

---

## Task 12: Wire trigger into Medals.jsx

**Files:**
- Modify: `frontend/src/pages/Medals.jsx`

- [ ] **Step 1: Import the modal**

Near the top of `frontend/src/pages/Medals.jsx`, add:

```javascript
import MedalLeaderboardModal from '../components/MedalLeaderboardModal';
```

- [ ] **Step 2: Add `openMedal` state in the `Medals` component**

In the main `Medals` component (around the existing `useState` calls), add:

```javascript
const [openMedal, setOpenMedal] = useState(null);
```

And at the bottom of the returned JSX (right before the closing `</div>`), render:

```jsx
{openMedal && (
  <MedalLeaderboardModal medal={openMedal} onClose={() => setOpenMedal(null)} />
)}
```

- [ ] **Step 3: Make `MedalCard` clickable**

Modify the existing `MedalCard` component in the same file. Change its outermost element to be a focusable button-like div, and accept an `onClick` prop. Pseudocode change:

```jsx
// Before
<div className="rounded-xl p-4 border ...">

// After
<button
  type="button"
  onClick={onClick}
  className="rounded-xl p-4 border transition-colors flex flex-col items-center gap-2 text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50 ..."
>
```

(Preserve the existing conditional border/bg classes — `owned ? '...' : '...'`. Just change the wrapper element.)

Update the call site in the grid:

```jsx
{visible.map((m) => (
  <MedalCard
    key={m.id}
    medal={m}
    owned={mineSet.has(m.id)}
    currentUsername={user?.username}
    onClick={() => setOpenMedal(m)}
  />
))}
```

And the trophy-case tiles — wrap each in a `<button>` that calls `setOpenMedal(m)`:

```jsx
{myMedals.map((m) => (
  <button
    type="button"
    key={`tc-${m.id}`}
    onClick={() => setOpenMedal(m)}
    className="flex flex-col items-center gap-1 focus:outline-none focus:ring-2 focus:ring-accent/50 rounded"
  >
    <MedalBadge icon={m.icon} category={m.category} size={64} title={m.name} />
    <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted text-center leading-tight">
      {m.name.replace('Strongest ', '').replace('Biggest ', '').replace('Fastest ', '').replace(' 30d', '').replace(' All-Time', '')}
    </span>
  </button>
))}
```

- [ ] **Step 4: Manual smoke test**

Run: `cd frontend && npm run dev`

In the browser:
- Open Medals page → click any medal card → modal opens with leaderboard.
- Verify your own row is highlighted (border-accent/40 bg-accent/5).
- Click outside the modal → it closes.
- Press Esc → it closes.
- Open a trophy-case tile → same modal opens.
- Verify mobile viewport (DevTools narrow): modal becomes a bottom sheet.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Medals.jsx
git commit -m "feat(frontend): wire leaderboard modal into Medals page"
```

---

## Task 13: Final sweep

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && pytest -q`
Expected: no new failures vs. baseline (pre-existing `test_log_bulk_relog_replaces` failure may still appear per CLAUDE.md).

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && npm test -- --run`
Expected: all PASS.

- [ ] **Step 3: Type-check / build sanity**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Update CLAUDE.md**

Add a short section under the existing "Medal awarding" subsection of `gym tracker/CLAUDE.md`:

```markdown
## Medal leaderboards (2026-05-11)
`GET /api/medals/{id}/leaderboard` returns every user's current value for the
medal's metric, sorted. Backed by `backend/app/medal_leaderboards.py` — a single
dispatch module that reuses the medal engine's categorization rules so the top
of the leaderboard always matches `MedalCurrentHolder`.

The `consistency_longest_streak` medal is never awarded by the engine today, so
its leaderboard may have entries while `MedalCurrentHolder` is empty — accepted.

UI: clicking any `MedalCard` on the Medals page opens
`MedalLeaderboardModal`. Trophy-case tiles open the same modal.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note medal leaderboard endpoint + UI in CLAUDE.md"
```

---

## Self-review notes

Spec coverage: every section of the design spec maps to a task in this plan.

| Spec section | Task(s) |
|---|---|
| API contract | Task 8 |
| Strength single-lift values | Task 2 |
| Strength derivatives | Task 3 |
| Cardio | Task 4 |
| Consistency (sessions/volume/perfect) | Task 5 |
| Consistency (longest_streak) | Task 6 |
| Performance | Task 7 |
| Cross-cutting rules (preset excluded, omit no-value) | Tasks 2-7 (each handler) |
| Modal component + i18n | Tasks 10, 11 |
| Formatter extraction | Task 9 |
| Wire-up | Task 12 |
| Tests #1-6 from spec | Mapped: ordering (Task 2), manual first-class (Task 2), cardio time-based (Task 4), derivative gating (Task 3), 404 (Task 8), leader == holder (Task 8) |

Placeholder scan: no TBD / TODO / "implement appropriate" found.

Type consistency: `Entry` dataclass defined in Task 1 and used in Tasks 2-7 with the same field names (`user_id`, `username`, `value`, `achieved_at`). API endpoint in Task 8 maps these to JSON keys exactly. Component prop names (`medal`, `onClose`) consistent across Tasks 11 and 12.
