# Codex Prompt: Local Gym Progress & Analytics App

## Overview

Build a local web application (Python backend + React frontend) that ingests workout program data from Jeff Nippard's "The Essentials" spreadsheet format, lets the user log actual performance, and provides intelligent analytics: progress extrapolation, recovery recommendations, progressive overload guidance, strength standard comparisons, and evidence-based training insights.

---

## 1. Data Layer

### 1.1 Spreadsheet Parser

The input is an `.xlsx` file with 4 sheets: `2x Week`, `3x Week`, `4x Week`, `5x Week`. Each sheet represents a training frequency variant of the same 12-week program.

**Sheet structure (columns A–K, 0-indexed):**

| Col Index | Field | Notes |
|-----------|-------|-------|
| 0 | Week number / Session label | e.g. "WEEK 1", "UPPER BODY", "FULL BODY A", "PUSH", "PULL", "LEGS" |
| 1 | Exercise name | e.g. "FLAT DB PRESS (HEAVY)" |
| 2 | Warm-up sets | e.g. "2-3", "1", "0" |
| 3 | Working sets | integer |
| 4 | Reps | e.g. "4-6", "8-10", "12-15 (dropset)", "8-10 per leg", "10(myorep match)" |
| 5 | Load | **IGNORE THIS COLUMN.** It contains reference weights from the user's current run of the program — NOT logged workout data. Do not import these as historical logs. All actual workout logging happens through the app's own logger. The column may contain numbers, "BW", "110/55" notation, dates (entry errors), or blanks — none of it should be stored as workout history. |
| 6 | RPE | e.g. "8-9", "9-10", "10" |
| 7 | Rest | e.g. "~3 MINS", "~2 MINS", "~1.5MINS", "0 MINS" |
| 8 | Substitution Option 1 | alternative exercise |
| 9 | Substitution Option 2 | alternative exercise |
| 10 | Notes | coaching cues and technique notes |

**Structural patterns to parse:**
- Row with column 0 containing "WEEK N" = week header. The next row's column 0 contains the session type (UPPER BODY, LOWER BODY, FULL BODY, PUSH, PULL, LEGS).
- Exercise rows follow: column 0 is NaN, column 1 has the exercise name.
- Supersets are prefixed with "A1:", "A2:", "B1:", "B2:" in the exercise name.
- Rows containing "SUGGESTED" in column 0 = rest day markers (boundaries between training blocks).
- Header rows (column 1 == "EXERCISE") repeat before each session block.

**CRITICAL — Exercise name normalization:**
The spreadsheet contains typos and inconsistencies that MUST be normalized:
- "HAVK SQUAT" → "HACK SQUAT"
- "MACHINECRUNCH" → "MACHINE CRUNCH"
- "INCLINE DUMBBEL PRESS" / "INCLINE DUMBELL PRESS" → "INCLINE DUMBBELL PRESS"
- "MACHINE LATTERAL RAISES" → "MACHINE LATERAL RAISE"
- "LEG PRESS(HEAVY)" → "LEG PRESS (HEAVY)"
- "LYING LEG CURLS" → "LYING LEG CURL"
- Strip "A1:", "A2:", "B1:", "B2:" prefixes for canonical name, but preserve superset grouping metadata.
- Use fuzzy matching (e.g. Levenshtein distance) or a manual alias map to unify duplicates.

**Load column (column 5) — SKIP ENTIRELY during import:**
The LOAD column in the spreadsheet is the user's scratch notes for their current program run. It is NOT historical workout data. Do not parse, store, or display these values. All workout performance data comes exclusively from the app's own logging interface.

### 1.2 Database Schema (SQLite)

```
users
  id, name, bodyweight_kg, height_cm, sex, birth_date, training_age_months,
  preferred_units (kg/lbs), created_at

programs
  id, user_id, name, frequency (2/3/4/5), start_date, end_date (nullable),
  status (active/completed/paused/abandoned), total_weeks, source_file, created_at

program_exercises
  id, program_id, week, session_name, session_order_in_week, exercise_order,
  exercise_name_canonical, exercise_name_raw, warm_up_sets, working_sets,
  prescribed_reps, prescribed_rpe, rest_period, substitution_1, substitution_2,
  notes, is_superset, superset_group

exercise_catalog
  id, canonical_name, muscle_group_primary, muscle_groups_secondary (JSON array),
  movement_pattern (push/pull/hinge/squat/isolation), equipment,
  is_compound, is_unilateral, difficulty_level

workout_logs
  id, user_id, program_exercise_id, date, set_number,
  load_kg, reps_completed, rpe_actual, notes,
  is_bodyweight, is_dropset, dropset_load_kg

session_logs
  id, user_id, program_id, week, session_name, date,
  status (completed/partial/skipped), duration_minutes (nullable),
  session_rpe (nullable, 1-10 overall session difficulty), notes

program_progress
  id, program_id, current_week, current_session_index,
  total_sessions_completed, total_sessions_skipped,
  last_session_date, next_session_due, updated_at

body_metrics
  id, user_id, date, bodyweight_kg, body_fat_pct (nullable),
  sleep_hours, stress_level (1-5), soreness_level (1-5)
```

### 1.3 Exercise Catalog Seed Data

Pre-populate `exercise_catalog` with all ~142 exercises from the spreadsheet. Map each to:
- **Primary muscle group**: chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, abs, forearms
- **Movement pattern**: horizontal push, vertical push, horizontal pull, vertical pull, hip hinge, squat, lunge, isolation upper, isolation lower, core
- **Equipment**: dumbbell, barbell, cable, machine, smith machine, bodyweight

Use a hardcoded mapping dictionary. Here are the key groupings to get started:

```
CHEST: Flat DB Press, Incline DB Press, Incline Smith Machine Press, Machine Chest Press, Cable Chest Fly, Machine Chest Fly, Pec Deck, Weighted Dip, Cable Chest Press
BACK: 2-Grip Lat Pulldown, T-Bar Row, Seated Cable Row, Helms DB Row, Pendlay Row, Machine Pulldown, Meadows Row, Single-Arm DB Row, Weighted Pullup, Incline Chest-Supported DB Row
SHOULDERS: DB Lateral Raise, Cable Lateral Raise, Machine Lateral Raise, Seated DB Shoulder Press, Reverse Cable Fly, Reverse Pec Deck, Rope Facepull, Cable Shoulder Press, Standing DB Arnold Press, Bent-Over Reverse DB Flye
QUADS: Hack Squat, Machine Squat, Leg Press, Leg Extension, Smith Machine Squat, Goblet Squat, Close Stance Hack Squat, DB Bulgarian Split Squat, DB Walking Lunge, Narrow Stance Smith Squat
HAMSTRINGS: Romanian Deadlift, DB Romanian Deadlift, Seated Hamstring Curl, Lying Leg Curl, Nordic Ham Curl, Glute-Ham Raise, 45° Back Extension
BICEPS: DB Bicep Curl, EZ Bar Curl, Spider Curl, Machine Bicep Curl, Bayesian Cable Curl, Inverse Zottman Curl, EZ Bar Preacher Curl, DB Incline Curl
TRICEPS: DB Skull Crusher, EZ Bar Skull Crusher, Overhead Cable Triceps Extensions, Cable Triceps Kickback, DB Triceps Kickback, Triceps Pressdown, Smith Machine JM Press, DB French Press, Machine Triceps Extension
CALVES: Seated Calf Raise, Standing Calf Raise, Leg Press Toe Press
ABS/CORE: Cable Crunch, Machine Crunch, Hanging Leg Raise, Roman Chair Crunch, Plate-Weighted Crunch, Dead Bug
```

---

## 2. Backend (Python — FastAPI or Flask)

### 2.1 API Endpoints

```
POST   /api/import-program          — Upload .xlsx, parse it, store program + exercises
GET    /api/programs                 — List user's programs
GET    /api/program/{id}/schedule    — Get full weekly schedule for a program
GET    /api/workout/today            — Get today's prescribed workout based on program schedule
PATCH  /api/program/{id}/status      — Update program status (pause/resume/complete/abandon)

# --- Program Tracker ---
GET    /api/tracker/{program_id}              — Full tracker state: current week, sessions done/remaining, % complete
GET    /api/tracker/{program_id}/week/{n}     — Detailed view of week N: each session's status, logged data
POST   /api/tracker/{program_id}/session      — Mark a session as completed, partial, or skipped
PATCH  /api/tracker/{program_id}/advance      — Manually advance to next session/week
GET    /api/tracker/{program_id}/calendar      — Calendar view: dates mapped to sessions (completed, upcoming, missed)
GET    /api/tracker/{program_id}/adherence    — Adherence stats: completion rate, skips, streak, etc.

# --- Logging ---
POST   /api/log                      — Log a single set (exercise, load, reps, RPE)
POST   /api/log/bulk                 — Log an entire session at once
GET    /api/logs?exercise=&from=&to= — Query logged data

POST   /api/body-metrics             — Log bodyweight, sleep, soreness, stress
GET    /api/body-metrics/history     — Get body metrics over time

# --- Analytics ---
GET    /api/analytics/progress/{exercise}    — Progress curve + projections for an exercise
GET    /api/analytics/volume                 — Weekly volume per muscle group over time
GET    /api/analytics/strength-standards     — Compare lifts to population percentiles
GET    /api/analytics/recovery              — Recovery status (internal use; not exposed in UI)
GET    /api/analytics/overload-plan         — Next session's suggested loads/reps
GET    /api/analytics/summary               — Dashboard summary stats
```

### 2.2 Analytics Engine

#### 2.2.1 Progress Extrapolation

For each exercise with ≥4 data points:
- Calculate **estimated 1RM** per session using the Epley formula: `1RM = weight × (1 + reps/30)`
- Fit a **linear regression** on (date, e1RM) to get rate of strength gain (kg/week).
- Fit a **logarithmic curve** as an alternative model (strength gains decelerate over time): `e1RM = a × ln(weeks) + b`
- Choose model with better R² fit.
- Project forward 4, 8, and 12 weeks.
- Flag if projected rate is unrealistically high (>2% per week after beginner phase) or if progress has stalled (<0.5% gain over last 4 weeks).

#### 2.2.2 Progressive Overload Recommendations

Based on the program's RPE targets and the user's logged performance:

```python
def suggest_next_session(exercise, recent_logs, prescribed_rpe_range):
    last_load = recent_logs[-1].load
    last_reps = recent_logs[-1].reps
    last_rpe = recent_logs[-1].rpe_actual
    target_rpe_low, target_rpe_high = prescribed_rpe_range

    reps_in_reserve = 10 - last_rpe  # simplified RIR

    if last_rpe < target_rpe_low:
        # Under-shooting — increase load
        suggestion = "increase_load"
        # Micro-load: +2.5% for compounds, +1 rep for isolations
        if is_compound(exercise):
            new_load = round_to_nearest(last_load * 1.025, 2.5)
        else:
            new_load = last_load  # keep load, add 1-2 reps
    elif last_rpe > target_rpe_high:
        # Overshooting — reduce load or maintain
        suggestion = "reduce_load_or_maintain"
    else:
        # In the zone — try to add 1 rep or micro-load next session
        suggestion = "add_rep_or_microload"
```

Apply **double progression**: within a rep range (e.g. 8-10), increase reps until top of range is hit at target RPE, then increase load and drop back to bottom of range.

#### 2.2.3 Volume Analytics

Per muscle group per week, calculate:
- **Total sets** (working sets only, not warm-ups)
- **Relative volume load** = Σ(sets × reps × load) as a proxy for total work
- Compare to evidence-based volume landmarks:
  - **MEV (Minimum Effective Volume)**: ~6-8 sets/muscle/week for maintenance
  - **MAV (Maximum Adaptive Volume)**: ~12-20 sets/muscle/week (where most growth happens)
  - **MRV (Maximum Recoverable Volume)**: ~20-25+ sets/muscle/week (diminishing returns, fatigue risk)
- Source: Israetel, Hoffmann, & Smith (2021), "Scientific Principles of Hypertrophy Training"; Schoenfeld et al. (2017) meta-analysis on weekly set volume.

Flag muscles that are below MEV or above MRV.

#### 2.2.4 Strength Standards Comparison

Compare the user's estimated 1RM on key compound lifts to population-based strength standards. Use percentile tables segmented by **sex** and **bodyweight class**.

Reference data sources (hardcode reasonable approximations from):
- Symmetric Strength percentile data
- StrengthLevel.com classification tiers
- ExRx.net strength standards

**Classification tiers** (as percentage of bodyweight for males, adjust ratios for females):

| Lift | Beginner | Novice | Intermediate | Advanced | Elite |
|------|----------|--------|-------------|----------|-------|
| Squat (Hack Squat proxy) | 0.75x BW | 1.25x BW | 1.5x BW | 2.0x BW | 2.5x BW |
| Deadlift (RDL proxy) | 1.0x BW | 1.5x BW | 1.75x BW | 2.25x BW | 3.0x BW |
| Bench (DB Press proxy*) | 0.5x BW | 0.75x BW | 1.0x BW | 1.25x BW | 1.5x BW |
| OHP (Shoulder Press proxy) | 0.35x BW | 0.5x BW | 0.65x BW | 0.85x BW | 1.0x BW |
| Row | 0.5x BW | 0.75x BW | 1.0x BW | 1.25x BW | 1.5x BW |

*Note: for DB press, the user logs per-dumbbell weight. Multiply by 2 and apply a ~0.83 conversion factor to approximate barbell equivalent, since DB pressing is harder due to stabilization demands. Make this conversion factor configurable.*

Display as a radar chart and as percentile estimates.

#### 2.2.5 Recovery & Readiness

> ~~_Recovery UI removed 2026-04-22 (nav consolidation). `recovery_score()` still lives in `backend/app/analytics/recovery.py` and is consumed internally by deload recommendations + the leaderboard summary, but is no longer surfaced as its own page or endpoint. Algorithm retained below for reference._~~

Use logged body metrics to generate a simple recovery score:

```python
def recovery_score(sleep_hours, soreness, stress, days_since_last_session_for_muscle_group):
    sleep_score = min(sleep_hours / 8.0, 1.0) * 30          # 0-30 points
    soreness_score = (5 - soreness) / 4 * 25                 # 0-25 points
    stress_score = (5 - stress) / 4 * 20                     # 0-20 points
    rest_score = min(days_since_last / 3, 1.0) * 25          # 0-25 points
    total = sleep_score + soreness_score + stress_score + rest_score
    return total  # 0-100
```

Recommendations based on score:
- **80-100**: Fully recovered. Go hard — attempt PRs or top-end RPE targets.
- **60-79**: Adequately recovered. Train normally, stick to prescribed RPE.
- **40-59**: Partially recovered. Consider reducing volume by 1 set per exercise or dropping RPE by 1.
- **<40**: Under-recovered. Consider an active recovery day or deload-intensity session.

Also track per-muscle-group fatigue by counting sets in the last 7 days and comparing to MRV thresholds.

#### 2.2.6 Additional Useful Metrics

- **Training consistency**: % of prescribed sessions actually completed per week/month
- **PR tracking**: Automatic detection of all-time and recent (last 4 weeks) personal records per exercise
- **Workout duration estimate**: Sum of (sets × estimated set duration + rest periods) per session
- **Estimated weekly tonnage**: Total weight × reps across all exercises, tracked over time
- **Muscle group balance ratios**: Push:Pull ratio (target ~1:1), Quad:Hamstring ratio (target ~1:0.6-0.8), anterior:posterior shoulder work
- **Deload detection/suggestion**: If 3+ consecutive weeks of stagnation or regression, suggest a programmed deload (50-60% volume for 1 week)
- **Wilks/DOTS score** (if user provides squat/bench/deadlift maxes): Bodyweight-normalized strength score
- **Relative strength progression**: Track e1RM as a ratio of bodyweight over time (are you getting stronger relative to your size?)
- **Session RPE trend**: Average RPE per session over time — are sessions getting harder? (Could indicate fatigue accumulation or insufficient recovery)

---

## 3. Frontend (React + Tailwind + Recharts)

### 3.1 Pages / Views

#### Dashboard (`/`)
- Today's workout at a glance (exercises, prescribed sets/reps/RPE, suggested loads based on last session)
- Program progress bar (Week X of 12, Y% complete)
- Quick-log button for body metrics
- Recent PRs
- Training streak / consistency bar
- Next scheduled session with countdown

#### Program Tracker (`/tracker`) — NEW
This is the central hub for tracking where the user is in their program.

**Overview panel:**
- Large progress bar: "Week 7 of 12 — 58% complete"
- Sessions completed / total (e.g. "38 of 64 sessions")
- Current streak (consecutive sessions without a skip)
- Longest streak
- Overall adherence rate (% sessions completed vs prescribed)
- Program status badge (Active / Paused / Completed)

**Week-by-week grid:**
- 12 columns (one per week), each containing the session slots for that week
- Each session slot is a card showing:
  - Session name (e.g. "Upper Body", "Push", "Legs")
  - Status indicator: ✅ Completed (green), ⏭️ Skipped (yellow), 🔲 Upcoming (gray), ❌ Missed (red, past due date)
  - Date completed (if done)
  - Quick stats: total sets logged, session RPE
- Current week is highlighted/expanded
- Clicking a session opens its detail view (exercises logged, performance vs prescribed)

**Calendar view (toggle):**
- Month calendar with sessions plotted on their actual dates
- Color-coded by session type (upper/lower/push/pull/legs/full body)
- Rest days visible
- Missed sessions highlighted

**Session detail (drill-down from tracker grid):**
- For completed sessions: every exercise with logged load/reps/RPE vs what was prescribed
- For upcoming sessions: prescribed workout with suggested loads from overload algorithm
- For skipped sessions: option to retroactively log or confirm skip with a reason

**Tracker logic:**
```python
def get_tracker_state(program_id):
    program = get_program(program_id)
    all_sessions = get_all_sessions_for_program(program_id)  # ordered by week, session_order
    completed = [s for s in session_logs if s.status == 'completed']
    skipped = [s for s in session_logs if s.status == 'skipped']

    # Determine current position
    # Option A: Sequential — user must complete sessions in order
    # Option B: Flexible — user can do any upcoming session (PREFERRED)
    # Use Option B: find the next session that hasn't been logged yet

    total_sessions = len(all_sessions)
    completed_count = len(completed)
    current_week = determine_current_week(program.start_date, today)

    # A session is "missed" if its week has passed and it wasn't logged or skipped
    missed = [s for s in all_sessions
              if s.week < current_week
              and s.id not in logged_session_ids
              and s.id not in skipped_session_ids]

    return {
        "program_name": program.name,
        "frequency": program.frequency,
        "status": program.status,
        "total_weeks": 12,
        "current_week": current_week,
        "total_sessions": total_sessions,
        "completed": completed_count,
        "skipped": len(skipped),
        "missed": len(missed),
        "adherence_pct": completed_count / max(expected_by_now, 1) * 100,
        "current_streak": calculate_streak(completed),
        "longest_streak": calculate_longest_streak(completed),
        "next_session": get_next_unlogged_session(all_sessions, completed, skipped),
        "weeks": build_week_grid(all_sessions, session_logs)
    }
```

**Program lifecycle:**
- **Start**: User imports .xlsx + picks frequency → program created with status "active", start_date = today
- **Pause**: User can pause (e.g. vacation, illness). Pausing freezes the "current week" calculation so missed sessions don't pile up. Resume picks up where they left off.
- **Complete**: Automatically set when all 12 weeks of sessions are logged, or manually by user.
- **Abandon**: User quits the program. Data is preserved for analytics but program is marked inactive.
- **Restart**: User can re-import the same program to start fresh (new program_id, clean slate).

#### Workout Logger (`/log`)
- Shows today's prescribed exercises in order
- For each exercise: pre-filled suggested load (from overload algorithm), input fields for actual load, reps, RPE per set
- Timer for rest periods (pre-filled from program data)
- "Complete Session" button that bulk-submits all sets AND marks the session as completed in the tracker
- Superset exercises grouped visually
- Option to log a partial session (some exercises done, others skipped)
- After completing: show session summary with highlights (PRs hit, volume comparison to last time)

#### Progress (`/progress`)
- Exercise selector dropdown (grouped by muscle)
- Line chart: estimated 1RM over time with trend line and projection
- Table: all logged sets for that exercise (date, load, reps, RPE, e1RM)
- PR badges

#### Analytics (`/analytics`)
- **Volume dashboard**: Stacked bar chart of weekly sets per muscle group, with MEV/MAV/MRV reference lines
- **Strength standards radar chart**: Current lifts plotted against percentile tiers
- **Tonnage chart**: Total weekly tonnage over time
- **Muscle balance**: Push:Pull and Quad:Ham ratios displayed as gauges
- **Body composition**: Bodyweight over time (line chart), overlaid with strength trends

#### Program View (`/program`)
- Full program laid out week by week
- Exercise details, notes, substitution options
- Ability to mark which frequency variant (2x-5x) the user is following
- Highlight current week
- Integrated with tracker: completed sessions show logged data inline

### 3.2 UI/UX Notes

- Mobile-first responsive design (most people log at the gym on their phone)
- Dark mode by default (gym-friendly)
- Large touch targets for logging inputs
- Swipe between exercises during logging
- Units: support both kg and lbs with a global toggle (store in kg internally, convert for display)
- All charts should be interactive (hover for values, zoom on time axis)

---

## 4. Tech Stack

```
Backend:
  - Python 3.11+
  - FastAPI (async, auto-docs at /docs)
  - SQLite via SQLAlchemy (simple, no setup, portable)
  - pandas + numpy + scipy for analytics (regression, curve fitting)
  - openpyxl for spreadsheet parsing

Frontend:
  - React 18 (Vite)
  - Tailwind CSS
  - Recharts (charts)
  - React Router
  - Lucide React (icons)

Dev:
  - Single repo, monorepo structure:
    /backend    — FastAPI app
    /frontend   — React app
    /data       — SQLite db + uploaded spreadsheets
  - Docker Compose for easy local setup (optional)
  - No external services required — fully offline-capable
```

---

## 5. Implementation Order

**Phase 1 — Core data (do this first):**
1. Spreadsheet parser (with all the edge cases documented above — IGNORE the Load column entirely)
2. Database schema + seed exercise catalog
3. Import endpoint that parses .xlsx → populates DB
4. Basic CRUD: log sets, log body metrics, query logs
5. Program tracker state management (session_logs, program_progress tables, lifecycle logic)

**Phase 2 — Analytics engine:**
6. e1RM calculation + progress tracking
7. Progressive overload suggestion algorithm
8. Volume per muscle group calculator
9. Strength standards comparison
10. Recovery score calculator (internal; drives deload recommendations)

**Phase 3 — Frontend:**
11. Program Tracker view (the week grid, calendar, adherence stats) — build this early, it's the spine of the app
12. Workout Logger (integrated with tracker — completing a session updates tracker state)
13. Dashboard
14. Progress charts
15. Analytics dashboard
16. ~~Recovery view~~ (removed — recovery logic kept internal for deload; no user-facing page)
17. Program viewer

**Phase 4 — Polish:**
18. Unit conversion (kg/lbs toggle)
19. PR detection + notifications
20. Deload suggestions
21. Export data (CSV)
22. Mobile responsiveness pass
23. Program pause/resume/restart flows

---

## 6. Key Research References to Inform Logic

These should guide the training intelligence built into the app:

- **Progressive overload**: Double progression (reps then load) is the most practical method for non-periodized intermediate training. Source: NSCA guidelines, Helms et al. (2014) "Recommendations for Natural Bodybuilding Contest Preparation."
- **Volume landmarks (MEV/MAV/MRV)**: Israetel's Renaissance Periodization framework. Typical MAV is 10-20 sets/muscle/week for hypertrophy. Source: Schoenfeld et al. (2017) "Dose-response relationship between weekly resistance training volume and increases in muscle mass."
- **RPE/RIR**: Helms et al. (2016) validated RPE as a practical autoregulation tool. RPE 8-9 = 1-2 RIR is the productive training zone for most working sets.
- **1RM estimation**: Epley formula is most widely used. Brzycki formula as alternative. Both lose accuracy above 10 reps. Source: LeSuer et al. (1997).
- **Strength standards**: Symmetric Strength uses a large dataset. Note: machine-based exercises (hack squat, etc.) don't have clean population norms — apply conversion factors with appropriate disclaimers.
- **Recovery**: Sleep of 7-9 hours is associated with better training outcomes. Source: Dattilo et al. (2011). Muscle protein synthesis elevated for ~48-72 hours post-training. Source: MacDougall et al. (1995).
- **Deload timing**: Typically every 4-6 weeks or when performance stalls. Source: Pritchard et al. (2015).
- **Muscle group frequency**: Training each muscle 2x/week appears superior to 1x/week for hypertrophy at equated volume. Source: Schoenfeld et al. (2016) meta-analysis.

---

## 7. Sample Parsed Data Structure

For reference, here's what the parser output should look like for a single exercise row:

```json
{
  "week": 1,
  "session": "UPPER BODY",
  "exercise_order": 1,
  "exercise_name_raw": "FLAT DB PRESS (HEAVY)",
  "exercise_name_canonical": "FLAT DB PRESS (HEAVY)",
  "warm_up_sets": "2-3",
  "working_sets": 2,
  "prescribed_reps": "6",
  "prescribed_rpe": "8-9",
  "rest_period": "~3 MINS",
  "substitution_1": "MACHINE CHEST PRESS",
  "substitution_2": "WEIGHTED DIP",
  "notes": "Focus on strength here. Each week add weight or reps. Keep form consistent.",
  "is_superset": false,
  "superset_group": null
}
```

And for a dropset/superset:

```json
{
  "exercise_name_raw": "A1: EZ BAR SKULL CRUSHER",
  "exercise_name_canonical": "EZ BAR SKULL CRUSHER",
  "is_superset": true,
  "superset_group": "A",
  "superset_position": 1,
  "prescribed_reps": "10",
  "rest_period": "0 MINS"
}
```

---

## 8. Important Edge Cases

1. **Reps field parsing**: Handle "12-15 (dropset)", "8-10 per leg", "10(myorep match)", "10 (drop set)", "13 (myorep match set)". Extract the base rep range and the set modifier (dropset, myorep, per leg) as separate fields.
2. **Load column ignored on import**: The spreadsheet's LOAD column (column 5) contains the user's reference notes, NOT historical data. Skip it entirely during parsing. All load data enters the system only through the app's workout logger. When logging bodyweight exercises ("BW" in the exercise catalog), the logger should prompt for additional load (e.g. weight vest or dip belt) and add it to the user's bodyweight from their profile.
3. **Superset rest**: The first exercise in a superset ("A1") has rest "0 MINS" — go immediately to A2. Rest is taken after A2. Reflect this in the logger UI.
4. **Week-to-week variation**: The program changes exercises, rep ranges, and volume across weeks. Week 12 is likely a deload. The app should detect if a week has lower prescribed volume/intensity and label it as a deload week.
5. **Multiple frequency variants**: User picks one (2x, 3x, 4x, or 5x). Only that variant's sheet is active. But allow switching mid-program if they want to change frequency.
6. **Program tracker — week calculation**: Current week is derived from `(today - program.start_date).days // 7 + 1`, capped at total_weeks. When a program is paused, store the pause date and subtract paused duration from the elapsed time when calculating current week after resume. This prevents a 1-week vacation from marking 5-10 sessions as "missed."
7. **Program tracker — session ordering**: Within a week, sessions have a defined order (e.g. Upper→Lower→Upper→Lower for 4x). The tracker should suggest the next session in sequence but allow the user to do them in any order. Don't block progress if someone swaps a Push and Pull day.
8. **Program tracker — re-doing sessions**: If a user wants to redo a session they already logged (e.g. felt it was a bad day), allow it. Store both entries. Analytics should use the latest log by default but preserve history.
9. **Partial session logging**: User might only complete 5 of 7 exercises before leaving the gym. The logger should allow saving a partial session (mark session as "partial" in tracker, log whatever was done). Unlogged exercises from that session should carry forward as suggestions but not count as skipped.