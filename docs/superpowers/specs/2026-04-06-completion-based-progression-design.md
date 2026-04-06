# Completion-Based Progression & Week Streak

## Problem

The tracker uses calendar-based week progression. `_compute_current_week()` calculates the week from elapsed days since `program.start_date`, so if Daniel takes time off, past-week sessions are auto-marked "missed" and the next workout skips ahead. The streak system counts consecutive individual sessions rather than complete training weeks.

## Goals

1. **Never auto-skip workouts.** The system waits for the user to complete (or explicitly skip) every session before advancing to the next week.
2. **Week-based streaks.** Count consecutive calendar weeks where all prescribed sessions were completed.
3. **Vacation support.** Allow the user to mark vacation periods so streaks aren't broken when training isn't possible.

---

## Design

### 1. Completion-Based Week Progression

**Replace** `_compute_current_week(program, today)` with a completion-based function:

```python
def _compute_current_week(sessions_by_week, logs_map, total_weeks):
    """Current week = first week with any uncompleted session."""
    for week_num in range(1, total_weeks + 1):
        for sess in sessions_by_week.get(week_num, []):
            key = (week_num, sess["session_name"])
            log = logs_map.get(key)
            if not log or log.status not in ("completed", "skipped"):
                return week_num
    return total_weeks  # all done
```

**Key behavior changes:**
- No session is ever auto-marked `"missed"`. Unlogged sessions are always `"pending"`.
- The `missed` count in tracker responses becomes 0 (field kept for backward compat).
- `next_session` and `get_workout_today()` scan from week 1 (or the completion-based current week, which is equivalent).
- Week detail endpoint (`get_week_detail`) uses the same logic — no `"missed"` status for unlogged sessions.

**Call sites to update (all in `tracker.py`):**

| Line | Function | Change |
|------|----------|--------|
| 170 | `get_tracker()` | New signature — already has `sessions_by_week`, `logs_map` |
| 295 | `get_week_detail()` | Build `sessions_by_week` or pass through |
| 582 | `get_adherence()` | New signature — already has `sessions_by_week`, `logs_map` |
| 664 | `get_workout_today()` | New signature — already has `sessions_by_week`, `logs_map` |

**Remove "missed" auto-assignment at:**
- Line 205: `get_tracker()` — change to always `"pending"` when no log
- Line 326-327: `get_week_detail()` — same
- Line 608: `get_adherence()` — remove missed counting (or count 0)
- Line 139-140: `_compute_streaks()` — remove missed append

**Adherence recalculation:**
- `expected` = sessions in weeks 1 through completion-based `current_week` (same formula, different week number)
- `adherence_pct` = completed / expected (unchanged formula)

### 2. Calendar-Week Streak

**Replace** the current session-based `_compute_streaks()` with a week-based version:

```python
def _compute_streaks(logs_map, frequency, vacation_periods):
    """
    Count consecutive calendar weeks (ISO Mon-Sun) where the user
    completed >= frequency sessions. Vacation weeks are transparent.
    Returns (current_streak, longest_streak).
    """
```

**Algorithm:**
1. Group all `SessionLog` entries by ISO calendar week (from `log.date`).
2. Build a sorted list of all calendar weeks from the earliest log to today.
3. For each calendar week:
   - If the week overlaps a vacation period: skip (transparent, doesn't break or extend streak).
   - If completed sessions >= `program.frequency`: week counts, streak += 1.
   - Otherwise: streak resets to 0.
4. `current_streak` = trailing run of counting weeks (ignoring vacation gaps).
5. `longest_streak` = max streak seen.

**Edge cases:**
- Weeks before the first logged session don't count against the streak.
- A partial vacation week (vacation starts mid-week) counts as a vacation week (benefit of the doubt).
- If no sessions logged yet, both streaks = 0.

### 3. Vacation Periods

**New model** in `models.py`:

```python
class VacationPeriod(Base):
    __tablename__ = "vacation_periods"

    id: int (PK)
    user_id: int (FK -> users.id)
    start_date: date
    end_date: date | None      # NULL = currently on vacation
    reason: str | None          # optional label
    created_at: datetime
```

**New API endpoints** (new router `routers/vacation.py`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/vacation` | List all vacation periods for the user |
| POST | `/api/vacation` | Start a vacation (body: `{start_date, end_date?, reason?}`) |
| PUT | `/api/vacation/{id}` | End or update a vacation (body: `{end_date?, reason?}`) |
| DELETE | `/api/vacation/{id}` | Delete a vacation period |

**Vacation query helper** for streak calculation:

```python
def _get_vacation_periods(db, user_id):
    return db.query(VacationPeriod).filter(
        VacationPeriod.user_id == user_id
    ).order_by(VacationPeriod.start_date).all()

def _is_vacation_week(week_start, week_end, vacation_periods):
    """True if any vacation period overlaps this calendar week."""
    for vp in vacation_periods:
        vp_end = vp.end_date or date.max
        if vp.start_date <= week_end and vp_end >= week_start:
            return True
    return False
```

### 4. Frontend Changes

**Settings.jsx** — new "Vacation Mode" card (after Rest Timer section):
- Toggle button: "Start Vacation" / "End Vacation"
- When active: shows start date, optional reason input, "End Vacation" button
- When inactive: "Start Vacation" button
- Uses `POST /api/vacation` and `PUT /api/vacation/{id}` calls

**Dashboard.jsx**:
- Streak label: "Week Streak" (was "Streak")
- Torch icon treatment unchanged
- When on vacation: show a small "On Vacation" badge near the streak

**Tracker.jsx**:
- Remove `missed` from STATUS_ICONS or keep it but it will never appear from the API
- Vacation weeks rendered with a distinct muted style on the heatmap (e.g., hatched or dimmed)
- Adherence stats: `total_missed` will be 0; could remove the field or keep for future manual-skip tracking

**Logger / useLoggerSession.js**:
- No changes needed — it already uses `tracker.next_session` which will now point to the correct uncompleted session

**client.js** — new API functions:
```javascript
export const getVacations = () => request('/vacation');
export const startVacation = (data) => request('/vacation', { method: 'POST', body: data });
export const endVacation = (id, data) => request(`/vacation/${id}`, { method: 'PUT', body: data });
export const deleteVacation = (id) => request(`/vacation/${id}`, { method: 'DELETE' });
```

---

## Files Changed

### Backend
| File | Change |
|------|--------|
| `models.py` | Add `VacationPeriod` model |
| `routers/tracker.py` | Rewrite `_compute_current_week()`, `_compute_streaks()`, remove auto-missed logic |
| `routers/vacation.py` | New router — CRUD for vacation periods |
| `main.py` | Register vacation router |

### Frontend
| File | Change |
|------|--------|
| `api/client.js` | Add vacation API functions |
| `pages/Settings.jsx` | Add Vacation Mode card |
| `pages/Dashboard.jsx` | Rename streak label, vacation badge |
| `pages/Tracker.jsx` | Vacation week styling on heatmap, remove missed status handling |

### Database
- New table: `vacation_periods` (auto-created by SQLAlchemy on startup)

---

## What Does NOT Change
- Logger flow, set logging, exercise swap — untouched
- Program import/parser — untouched
- Analytics, Progress, Recovery, Achievements — untouched
- ProgramProgress model — still updated by logging router but `current_week` field there becomes less important (tracker computes it live)
- Session statuses `"completed"`, `"partial"`, `"skipped"` — unchanged
- The user can still explicitly skip sessions via the existing skip action
