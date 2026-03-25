# Architecture Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Gym Tracker backend and frontend against the reliability, performance, and maintainability issues identified in the architecture review.

**Architecture:** Two phases — backend first (database indexes, proper migrations, tests, validation), then frontend (split Logger mega-component, add error boundaries, toast system, centralize unit conversion). Each task produces a working, independently deployable change.

**Tech Stack:** Python 3.11+ / FastAPI / SQLAlchemy / Alembic / pytest / React 19 / Vite / Vitest / Tailwind CSS 4

---

## Phase 1: Backend Hardening

### Task 1: Add Database Indexes

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py` (add index migration to `_run_migrations`)

- [ ] **Step 1: Add `index=True` to frequently-queried columns in models.py**

```python
# In WorkoutLog class (models.py ~line 129-135):
user_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("users.id"), nullable=False, index=True
)
# ...
date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

# In ProgramExercise class (find exercise_name_canonical):
exercise_name_canonical: Mapped[str] = mapped_column(String, nullable=False, index=True)

# In SessionLog class (~line 162-168):
program_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("programs.id"), nullable=False, index=True
)
```

- [ ] **Step 2: Add index creation to `_run_migrations` in main.py for production DB**

After the existing `_ensure_column` calls, add:

```python
# Create indexes on existing tables (idempotent — Postgres ignores IF NOT EXISTS)
if not is_sqlite:
    for stmt in [
        "CREATE INDEX IF NOT EXISTS ix_workout_logs_user_id ON workout_logs (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_workout_logs_date ON workout_logs (date)",
        "CREATE INDEX IF NOT EXISTS ix_program_exercises_canonical ON program_exercises (exercise_name_canonical)",
        "CREATE INDEX IF NOT EXISTS ix_session_logs_program_id ON session_logs (program_id)",
    ]:
        db.execute(text(stmt))
    db.commit()
```

- [ ] **Step 3: Verify backend compiles**

Run: `python3 -c "import py_compile; py_compile.compile('backend/app/models.py', doraise=True); py_compile.compile('backend/app/main.py', doraise=True)"`
Expected: No output (success)

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py backend/app/main.py
git commit -m "perf: add database indexes on WorkoutLog, ProgramExercise, SessionLog"
```

---

### Task 2: Add Pydantic Validation

**Files:**
- Modify: `backend/app/routers/logging.py` (Pydantic schemas ~lines 32-83)

- [ ] **Step 1: Add Field validators to SetLogRequest and BulkSetItem**

```python
from pydantic import BaseModel, Field

class SetLogRequest(BaseModel):
    program_exercise_id: int
    date: date
    set_number: int = Field(..., ge=1)
    load_kg: float = Field(..., ge=0)
    reps_completed: int = Field(..., ge=1, le=200)
    rpe_actual: Optional[float] = Field(None, ge=1, le=10)
    notes: Optional[str] = None
    is_bodyweight: bool = False
    is_dropset: bool = False
    dropset_load_kg: Optional[float] = Field(None, ge=0)


class BulkSetItem(BaseModel):
    program_exercise_id: int
    set_number: int = Field(..., ge=1)
    load_kg: float = Field(..., ge=0)
    reps_completed: int = Field(..., ge=1, le=200)
    rpe_actual: Optional[float] = Field(None, ge=1, le=10)
    is_bodyweight: bool = False
    is_dropset: bool = False
    dropset_load_kg: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class BodyMetricRequest(BaseModel):
    date: date
    bodyweight_kg: float = Field(..., gt=0, le=500)
    body_fat_pct: Optional[float] = Field(None, ge=1, le=60)
    sleep_hours: Optional[float] = Field(None, ge=0, le=24)
    stress_level: Optional[int] = Field(None, ge=1, le=10)
    soreness_level: Optional[int] = Field(None, ge=1, le=10)
```

- [ ] **Step 2: Verify backend compiles**

Run: `python3 -c "import py_compile; py_compile.compile('backend/app/routers/logging.py', doraise=True)"`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/logging.py
git commit -m "fix: add Pydantic validation — enforce positive weights, valid RPE range, rep limits"
```

---

### Task 3: Set Up pytest Infrastructure

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/pytest.ini`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add pytest to requirements.txt**

Append to `backend/requirements.txt`:
```
pytest>=8.0.0
httpx>=0.27.0
```

- [ ] **Step 2: Create pytest.ini**

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*
```

- [ ] **Step 3: Create conftest.py with in-memory SQLite fixtures**

```python
"""Shared test fixtures — in-memory SQLite database, test client, seeded user."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import User


@pytest.fixture()
def db():
    """Yield a fresh in-memory SQLite session for each test."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed a default user
    user = User(username="testuser")
    session.add(user)
    session.commit()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    """FastAPI TestClient with DB dependency overridden to use test DB."""
    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 4: Create empty `__init__.py`**

Create `backend/tests/__init__.py` as an empty file.

- [ ] **Step 5: Install deps and verify pytest runs**

Run: `cd backend && pip install -r requirements.txt && python -m pytest --co -q`
Expected: `no tests ran` (collected 0 items — infrastructure works)

- [ ] **Step 6: Commit**

```bash
git add backend/tests/ backend/pytest.ini backend/requirements.txt
git commit -m "chore: set up pytest infrastructure with in-memory SQLite fixtures"
```

---

### Task 4: Add Core Backend Tests

**Files:**
- Create: `backend/tests/test_logging_api.py`
- Create: `backend/tests/test_analytics.py`

- [ ] **Step 1: Write logging API tests**

```python
"""Tests for workout logging endpoints."""

from datetime import date


def _seed_program(db):
    """Insert a minimal program with exercises for testing."""
    from app.models import Program, ProgramExercise

    program = Program(
        user_id=1, name="Test Program", frequency=4,
        status="active", start_date=date(2026, 1, 1), total_weeks=4,
        source_file="test.xlsx",
    )
    db.add(program)
    db.flush()

    exercises = []
    for i, name in enumerate(["BENCH PRESS", "SQUAT", "DEADLIFT"], 1):
        pe = ProgramExercise(
            program_id=program.id, week=1, session_name="TEST",
            exercise_order=i, exercise_name_raw=name,
            exercise_name_canonical=name, working_sets=3,
            prescribed_reps="8-10", prescribed_rpe="8-9",
            session_order_in_week=1,
        )
        db.add(pe)
        exercises.append(pe)
    db.commit()
    return program, exercises


def test_log_bulk_session_success(client, db):
    program, exercises = _seed_program(db)

    payload = {
        "program_id": program.id,
        "week": 1,
        "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [
            {
                "program_exercise_id": exercises[0].id,
                "set_number": 1,
                "load_kg": 80.0,
                "reps_completed": 8,
            },
            {
                "program_exercise_id": exercises[1].id,
                "set_number": 1,
                "load_kg": 100.0,
                "reps_completed": 5,
            },
        ],
    }
    resp = client.post("/api/log/bulk", json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["sets_logged"] == 2
    assert body["exercises_covered"] == 2
    assert body["session_log_id"] > 0


def test_log_bulk_relog_replaces(client, db):
    """Re-logging the same session should replace, not duplicate."""
    program, exercises = _seed_program(db)

    payload = {
        "program_id": program.id,
        "week": 1,
        "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [
            {"program_exercise_id": exercises[0].id, "set_number": 1,
             "load_kg": 80.0, "reps_completed": 8},
        ],
    }
    resp1 = client.post("/api/log/bulk", json=payload)
    assert resp1.status_code == 201
    id1 = resp1.json()["session_log_id"]

    # Relog with different weight
    payload["sets"][0]["load_kg"] = 85.0
    resp2 = client.post("/api/log/bulk", json=payload)
    assert resp2.status_code == 201
    id2 = resp2.json()["session_log_id"]
    assert id2 != id1  # new session created


def test_log_invalid_exercise_id(client, db):
    _seed_program(db)
    payload = {
        "program_id": 1, "week": 1, "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [
            {"program_exercise_id": 9999, "set_number": 1,
             "load_kg": 50.0, "reps_completed": 8},
        ],
    }
    resp = client.post("/api/log/bulk", json=payload)
    assert resp.status_code == 404


def test_log_validation_rejects_negative_weight(client, db):
    program, exercises = _seed_program(db)
    payload = {
        "program_id": program.id, "week": 1, "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [
            {"program_exercise_id": exercises[0].id, "set_number": 1,
             "load_kg": -10.0, "reps_completed": 8},
        ],
    }
    resp = client.post("/api/log/bulk", json=payload)
    assert resp.status_code == 422  # Pydantic validation error


def test_undo_session(client, db):
    program, exercises = _seed_program(db)
    payload = {
        "program_id": program.id, "week": 1, "session_name": "TEST",
        "date": "2026-01-15",
        "sets": [
            {"program_exercise_id": exercises[0].id, "set_number": 1,
             "load_kg": 80.0, "reps_completed": 8},
        ],
    }
    resp = client.post("/api/log/bulk", json=payload)
    session_id = resp.json()["session_log_id"]

    resp2 = client.delete(f"/api/log/session/{session_id}")
    assert resp2.status_code == 200
    assert resp2.json()["undone"] is True
```

- [ ] **Step 2: Write analytics tests**

```python
"""Tests for analytics calculations."""

from datetime import date, timedelta

from app.analytics.overload import parse_range, _increase_load, _decrease_load


def test_parse_range_standard():
    assert parse_range("8-10") == (8.0, 10.0)


def test_parse_range_single():
    assert parse_range("10") == (10.0, 10.0)


def test_parse_range_with_annotation():
    assert parse_range("10-12 (dropset)") == (10.0, 12.0)


def test_parse_range_empty():
    assert parse_range("") == (0.0, 0.0)
    assert parse_range(None) == (0.0, 0.0)


def test_parse_range_comma():
    assert parse_range("10,8") == (8.0, 10.0)


def test_increase_load_compound():
    result = _increase_load(100.0, compound=True)
    assert result == 102.5  # 100 * 1.025 = 102.5, rounded to 2.5


def test_increase_load_isolation():
    result = _increase_load(20.0, compound=False)
    assert result == 22.5  # 20 + 2.5


def test_decrease_load_compound():
    result = _decrease_load(100.0, compound=True)
    assert result == 95.0  # 100 * 0.95


def test_decrease_load_isolation():
    result = _decrease_load(20.0, compound=False)
    assert result == 17.5  # 20 - 2.5


def test_decrease_load_floor():
    result = _decrease_load(2.0, compound=False)
    assert result == 0.0  # Can't go below 0
```

- [ ] **Step 3: Run tests**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All tests pass (6 logging + 10 analytics = 16 tests)

- [ ] **Step 4: Commit**

```bash
git add backend/tests/
git commit -m "test: add core logging API and analytics unit tests"
```

---

### Task 5: Remove Hardcoded `user_id=1` Defaults from Analytics

**Files:**
- Modify: `backend/app/analytics/progress.py` (~line 225)
- Modify: `backend/app/analytics/volume.py` (~line 78)
- Modify: `backend/app/analytics/strength.py` (~line 341)
- Modify: `backend/app/analytics/recovery.py`
- Modify: `backend/app/analytics/deload.py`

- [ ] **Step 1: Change all `user_id: int = 1` defaults to required params**

In every analytics function that has `user_id: int = 1`, change to `user_id: int` (no default). The calling code in `backend/app/routers/analytics.py` already passes `_default_user_id(db)`, so this is safe.

Files to change:
- `progress.py`: `get_exercise_progress(db, exercise_name, user_id: int)`
- `volume.py`: `get_weekly_volume(db, user_id: int, ...)`, `get_muscle_balance(db, user_id: int, ...)`, `get_tonnage(db, user_id: int, ...)`
- `strength.py`: `get_strength_standards(db, user_id: int)`
- `recovery.py`: `get_recovery_status(db, user_id: int)`
- `deload.py`: `get_deload_check(db, user_id: int, ...)`

- [ ] **Step 2: Verify no callers rely on the default**

Run: `grep -rn "user_id=1" backend/app/` — should only find the migration data fix in main.py, not any function calls.

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `cd backend && python -m pytest tests/ -v`

- [ ] **Step 4: Commit**

```bash
git add backend/app/analytics/
git commit -m "refactor: remove hardcoded user_id=1 defaults from all analytics functions"
```

---

### Task 6: Clean Up One-Time Data Fixes in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Remove the one-time data fixes that have already run**

The duplicate PUSH fix, date fix, and weight fix in `_run_migrations()` have already executed on production. Remove the three data-fix blocks (the UPDATE/DELETE statements for session_logs, workout_logs dates, and weight precision), keeping only the `_ensure_column` calls and the index creation from Task 1.

- [ ] **Step 2: Verify backend compiles**

Run: `python3 -c "import py_compile; py_compile.compile('backend/app/main.py', doraise=True)"`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "chore: remove one-time data migration fixes (already applied to production)"
```

---

## Phase 2: Frontend Hardening

### Task 7: Centralize Unit Conversion

**Files:**
- Create: `frontend/src/utils/units.js`
- Modify: `frontend/src/context/AppContext.jsx`
- Modify: `frontend/src/pages/Logger.jsx` (~lines 162-164, 178-180, 244-251)
- Modify: `frontend/src/pages/Settings.jsx` (~lines 42-43, 53, 76)

- [ ] **Step 1: Create `units.js` utility**

```javascript
const LBS_PER_KG = 2.20462;

/** Convert kg to display units. */
export function kgToDisplay(kg, units) {
  if (units === 'lbs') return +(kg * LBS_PER_KG).toFixed(1);
  return +kg;
}

/** Convert display units to kg for storage. */
export function displayToKg(value, units) {
  if (units === 'lbs') return +(value / LBS_PER_KG).toFixed(2);
  return +value;
}

/** Unit label string. */
export function getUnitLabel(units) {
  return units === 'lbs' ? 'lbs' : 'kg';
}
```

- [ ] **Step 2: Update AppContext.jsx to use the utility**

Replace the inline `convert` function with `kgToDisplay`:

```javascript
import { kgToDisplay, getUnitLabel } from '../utils/units';

// In the provider value, replace the convert lambda:
const convert = (kg) => kgToDisplay(kg, units);
const unitLabel = getUnitLabel(units);
```

- [ ] **Step 3: Update Logger.jsx handleSave to use `displayToKg`**

```javascript
import { displayToKg } from '../utils/units';

// In handleSave payload mapping (~line 244):
load_kg: displayToKg(s.load_kg, units),
// ...
dropset_load_kg: s.is_dropset && s.dropset_load_kg
  ? displayToKg(s.dropset_load_kg, units)
  : null,
```

Also update the set initialization display conversion (~lines 162-164, 178-180) to use `kgToDisplay`.

- [ ] **Step 4: Update Settings.jsx manual 1RM conversions similarly**

Replace all inline `/ 2.20462` and `* 2.20462` with `displayToKg` and `kgToDisplay`.

- [ ] **Step 5: Verify frontend builds**

Run: `cd frontend && npx vite build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/units.js frontend/src/context/AppContext.jsx frontend/src/pages/Logger.jsx frontend/src/pages/Settings.jsx
git commit -m "refactor: centralize unit conversion into utils/units.js"
```

---

### Task 8: Add Error Boundary Component

**Files:**
- Create: `frontend/src/components/ErrorBoundary.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create ErrorBoundary component**

```jsx
import { Component } from 'react';
import Card from './Card';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-lg mx-auto mt-12">
          <Card>
            <h2 className="text-lg font-semibold text-error mb-2">Something went wrong</h2>
            <p className="text-sm text-text-muted mb-4">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 rounded-lg bg-accent text-surface-dark text-sm font-medium"
            >
              Reload
            </button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap the app in ErrorBoundary**

In `App.jsx`, wrap the `<BrowserRouter>` content:

```jsx
import ErrorBoundary from './components/ErrorBoundary';

// Inside the return:
<ErrorBoundary>
  <BrowserRouter>
    {/* existing routes */}
  </BrowserRouter>
</ErrorBoundary>
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ErrorBoundary.jsx frontend/src/App.jsx
git commit -m "feat: add ErrorBoundary — catch render crashes with reload option"
```

---

### Task 9: Add Toast Notification System

**Files:**
- Create: `frontend/src/components/Toast.jsx`
- Create: `frontend/src/context/ToastContext.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/Logger.jsx` (replace `alert()` calls)
- Modify: `frontend/src/pages/History.jsx` (replace `alert()` calls)
- Modify: `frontend/src/pages/Settings.jsx` (replace `alert()` calls)

- [ ] **Step 1: Create ToastContext**

```jsx
import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
```

- [ ] **Step 2: Create Toast display component**

```jsx
import { useToast } from '../context/ToastContext';

const STYLES = {
  info: 'bg-surface-lighter border-accent/30 text-text',
  success: 'bg-success/10 border-success/30 text-success',
  error: 'bg-error/10 border-error/30 text-error',
};

export default function ToastContainer() {
  const { toasts } = useToast();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg border text-sm shadow-lg animate-in slide-in-from-right ${STYLES[t.type] || STYLES.info}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire into App.jsx**

```jsx
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/Toast';

// Wrap in ToastProvider (inside ErrorBoundary, outside BrowserRouter):
<ErrorBoundary>
  <ToastProvider>
    <BrowserRouter>
      {/* routes */}
    </BrowserRouter>
    <ToastContainer />
  </ToastProvider>
</ErrorBoundary>
```

- [ ] **Step 4: Replace `alert()` calls in Logger.jsx**

```jsx
import { useToast } from '../context/ToastContext';

// Inside Logger component:
const { addToast } = useToast();

// Replace: alert(err.message);
// With:    addToast(err.message, 'error');
```

Apply same pattern in `History.jsx` and `Settings.jsx`.

- [ ] **Step 5: Verify frontend builds**

Run: `cd frontend && npx vite build`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Toast.jsx frontend/src/context/ToastContext.jsx frontend/src/App.jsx frontend/src/pages/Logger.jsx frontend/src/pages/History.jsx frontend/src/pages/Settings.jsx
git commit -m "feat: add toast notification system, replace all alert() calls"
```

---

### Task 10: Split Logger.jsx — Extract Custom Hooks

**Files:**
- Create: `frontend/src/hooks/useLoggerSession.js`
- Create: `frontend/src/hooks/useExerciseSwap.js`
- Modify: `frontend/src/pages/Logger.jsx`

- [ ] **Step 1: Extract session loading/navigation into `useLoggerSession`**

Move the following state and effects from Logger.jsx into a custom hook:
- `sessions`, `currentWeek`, `selectedSession`, `scheduleData`, `loading`, `overload`
- The three useEffects: load schedule, load overload, initialize sets
- `pendingRestore`, `setPendingRestore`
- Week navigation logic

```javascript
// frontend/src/hooks/useLoggerSession.js
import { useEffect, useRef, useState } from 'react';
import { getSchedule, getOverloadPlan, getTracker } from '../api/client';

function flattenScheduleForWeek(scheduleResponse, week) {
  const schedule = scheduleResponse?.schedule || {};
  const weekData = schedule[week] || schedule[String(week)] || {};
  return Object.entries(weekData).map(([sessionName, exercises]) => ({
    session_name: sessionName,
    exercises,
  }));
}

export default function useLoggerSession(activeProgram, units) {
  const [sessions, setSessions] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [selectedSession, setSelectedSession] = useState(null);
  const [overload, setOverload] = useState(null);
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingRestore, setPendingRestore] = useState(null);

  const skipSetsInit = useRef(false);
  const swapInProgress = useRef(false);

  useEffect(() => {
    if (!activeProgram) { setLoading(false); return; }
    const load = async () => {
      try {
        const [scheduleRes, trackerRes] = await Promise.all([
          getSchedule(activeProgram.id),
          getTracker(activeProgram.id).catch(() => null),
        ]);
        setScheduleData(scheduleRes);
        const week = trackerRes?.current_week || 1;
        const nextWeek = trackerRes?.next_session?.week || week;
        setCurrentWeek(nextWeek);

        const flatSessions = flattenScheduleForWeek(scheduleRes, nextWeek);
        setSessions(flatSessions);

        const nextSessionName = trackerRes?.next_session?.session_name;
        const match = flatSessions.find((s) => s.session_name === nextSessionName);
        if (match) setSelectedSession(match);
        else if (flatSessions.length) setSelectedSession(flatSessions[0]);
      } catch { /* empty state */ }
      finally { setLoading(false); }
    };
    load();
  }, [activeProgram]);

  useEffect(() => {
    if (!activeProgram || !selectedSession) return;
    const isSwap = swapInProgress.current;
    getOverloadPlan(activeProgram.id, currentWeek, selectedSession.session_name)
      .then((data) => {
        setOverload(data);
        if (isSwap) {
          skipSetsInit.current = true;
          swapInProgress.current = false;
        }
      })
      .catch(() => {
        setOverload(null);
        swapInProgress.current = false;
      });
  }, [activeProgram, selectedSession, currentWeek]);

  const changeWeek = (delta) => {
    if (!scheduleData) return;
    const newWeek = currentWeek + delta;
    if (newWeek < 1) return;
    setCurrentWeek(newWeek);
    const flatSessions = flattenScheduleForWeek(scheduleData, newWeek);
    setSessions(flatSessions);
    if (flatSessions.length) setSelectedSession(flatSessions[0]);
    else setSelectedSession(null);
  };

  return {
    sessions, currentWeek, selectedSession, setSelectedSession,
    overload, scheduleData, loading, pendingRestore, setPendingRestore,
    changeWeek, skipSetsInit, swapInProgress,
  };
}
```

- [ ] **Step 2: Extract exercise swap into `useExerciseSwap`**

Move swap-related state from Logger.jsx:
- `swapTarget`, `swapCatalog`, `swapSearch`, `swapLoading`, `swapMuscleGroup`, `showAllMuscleGroups`
- The swap handler functions

```javascript
// frontend/src/hooks/useExerciseSwap.js
import { useState } from 'react';
import { swapExercise, getExerciseCatalog } from '../api/client';

export default function useExerciseSwap(activeProgram, swapInProgress) {
  const [swapTarget, setSwapTarget] = useState(null);
  const [swapCatalog, setSwapCatalog] = useState([]);
  const [swapSearch, setSwapSearch] = useState('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapMuscleGroup, setSwapMuscleGroup] = useState(null);
  const [showAllMuscleGroups, setShowAllMuscleGroups] = useState(false);

  const openSwap = async (exerciseName, muscleGroup) => {
    setSwapTarget(exerciseName);
    setSwapMuscleGroup(muscleGroup);
    setSwapSearch('');
    setShowAllMuscleGroups(false);
    if (swapCatalog.length === 0) {
      try {
        const res = await getExerciseCatalog();
        setSwapCatalog(Array.isArray(res) ? res : res.exercises || []);
      } catch { /* ignore */ }
    }
  };

  const confirmSwap = async (newName, setSelectedSession, selectedSession) => {
    if (!activeProgram || !swapTarget) return;
    setSwapLoading(true);
    try {
      await swapExercise(activeProgram.id, swapTarget, newName);
      swapInProgress.current = true;
      // Trigger re-fetch by updating session reference
      setSelectedSession({ ...selectedSession });
      setSwapTarget(null);
    } catch { /* ignore */ }
    finally { setSwapLoading(false); }
  };

  const closeSwap = () => setSwapTarget(null);

  return {
    swapTarget, swapCatalog, swapSearch, setSwapSearch,
    swapLoading, swapMuscleGroup, showAllMuscleGroups, setShowAllMuscleGroups,
    openSwap, confirmSwap, closeSwap,
  };
}
```

- [ ] **Step 3: Refactor Logger.jsx to use the hooks**

Replace the 21 useState declarations and 7 useEffects with:

```jsx
import useLoggerSession from '../hooks/useLoggerSession';
import useExerciseSwap from '../hooks/useExerciseSwap';

export default function Logger() {
  const { activeProgram, unitLabel, units, convert, defaultRestSeconds } = useApp();
  const session = useLoggerSession(activeProgram, units);
  const swap = useExerciseSwap(activeProgram, session.swapInProgress);

  // Remaining local state (UI-only):
  const [sets, setSets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('workout');
  const [prList, setPrList] = useState([]);
  const [restTimerTriggers, setRestTimerTriggers] = useState({});
  const [plateCalcWeight, setPlateCalcWeight] = useState(null);
  const [undoInfo, setUndoInfo] = useState(null);
  const undoTimerRef = useRef(null);
  const [metrics, setMetrics] = useState({
    bodyweight_kg: '', body_fat_pct: '', sleep_hours: '',
    stress_level: '', soreness_level: '',
  });
  const [metricsSaved, setMetricsSaved] = useState(false);

  // ... rest of component uses session.currentWeek, session.selectedSession, etc.
}
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npx vite build`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/ frontend/src/pages/Logger.jsx
git commit -m "refactor: split Logger.jsx — extract useLoggerSession and useExerciseSwap hooks"
```

---

### Task 11: Set Up Vitest for Frontend

**Files:**
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/utils/__tests__/units.test.js`
- Modify: `frontend/package.json` (add test script + vitest dep)

- [ ] **Step 1: Install vitest**

Run: `cd frontend && npm install -D vitest`

- [ ] **Step 2: Create vitest config**

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 3: Add test script to package.json**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Write unit conversion tests**

```javascript
import { describe, it, expect } from 'vitest';
import { kgToDisplay, displayToKg } from '../units';

describe('kgToDisplay', () => {
  it('converts kg to lbs', () => {
    expect(kgToDisplay(100, 'lbs')).toBeCloseTo(220.5, 0);
  });

  it('returns kg unchanged', () => {
    expect(kgToDisplay(100, 'kg')).toBe(100);
  });
});

describe('displayToKg', () => {
  it('converts lbs to kg with .toFixed(2) precision', () => {
    const result = displayToKg(260, 'lbs');
    expect(result).toBeCloseTo(117.93, 1);
    // Round-trip: should come back to ~260
    expect(kgToDisplay(result, 'lbs')).toBeCloseTo(260, 0);
  });

  it('returns kg unchanged', () => {
    expect(displayToKg(100, 'kg')).toBe(100);
  });

  it('handles round weights without precision loss', () => {
    // 135 lbs = 61.23 kg → back to 135.0 lbs
    const kg = displayToKg(135, 'lbs');
    expect(kgToDisplay(kg, 'lbs')).toBeCloseTo(135, 0);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npm test`
Expected: All 6 tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/vitest.config.js frontend/package.json frontend/src/utils/__tests__/
git commit -m "test: add vitest + unit conversion tests"
```

---

### Task 12: Final Push and Deploy Verification

- [ ] **Step 1: Run full test suite**

```bash
cd backend && python -m pytest tests/ -v
cd ../frontend && npm test
cd ../frontend && npx vite build
```

All must pass.

- [ ] **Step 2: Push to origin**

```bash
git push origin master
```

- [ ] **Step 3: Verify deployment**

Wait 4-5 minutes, then:
```bash
# Backend health
curl -s "https://gym-tracker-09w0.onrender.com/api/programs" | head -c 100

# Frontend loads
curl -s "https://gym-tracker-six-virid.vercel.app" | grep -o '<title>[^<]*'
```

- [ ] **Step 4: Test logging still works end-to-end**

```bash
curl -s -w "\nHTTP %{http_code}" -X POST "https://gym-tracker-09w0.onrender.com/api/log/bulk" \
  -H "Content-Type: application/json" \
  -d '{"program_id":1,"week":12,"session_name":"DEPLOY_TEST","date":"2026-03-25","sets":[{"program_exercise_id":19,"set_number":1,"load_kg":50,"reps_completed":8}]}'
# Expected: HTTP 201

# Clean up
curl -s -X DELETE "https://gym-tracker-09w0.onrender.com/api/log/session/<session_log_id>"
```
