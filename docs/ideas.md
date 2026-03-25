# Feature Ideas

Brainstormed 2026-03-24. Ordered roughly by impact and feasibility.

---

## Workout Experience

### Workout Timer & Duration Tracking
Track total session duration automatically (start when first set logged, end on save). Show avg session length trends in Analytics.

### Plate Calculator
Enter target weight → shows which plates to load per side. Accounts for bar weight (45 lbs / 20 kg). Useful mid-set when changing weights quickly.

### Warm-Up Set Generator
Based on working weight, auto-generate a warm-up pyramid (e.g. bar × 10, 50% × 5, 70% × 3, 85% × 1). The program already has `warm_up_sets` field — surface it in the Logger UI.

### Set Auto-Fill from Last Session
Pre-populate load/reps from the previous week's logged data for the same exercise + set number. One tap to match or beat last week.

### RPE-Based Auto-Regulation
If logged RPE exceeds prescribed RPE by 1+, suggest reducing load next set. If under, suggest increasing. Real-time feedback during the session.

### Superset Timer
Rest timer that alternates between superset exercises (e.g. "Now: Bicep Curls → Next: Tricep Pushdowns") with shorter inter-exercise rest.

---

## Analytics & Insights

### Training Frequency Heatmap
GitHub-style contribution heatmap showing training days over months. Quick visual of consistency patterns, rest days, and gaps.

### Estimated 1RM Leaderboard / Timeline
Timeline view showing when each PR was set. "X days since last PR" motivation counter. Historical 1RM progression across all lifts on one chart.

### Muscle Recovery Heatmap (Body Map)
Visual body outline with color-coded muscle groups (green = recovered, yellow = moderate, red = fatigued). More intuitive than the current table.

### Volume Periodization Tracking
Show actual volume vs programmed volume per muscle group per mesocycle. Detect if you're consistently under/over-shooting prescribed volume.

### Fatigue-to-Fitness Ratio (Banister Model)
Simple impulse-response model: fitness builds slowly, fatigue builds fast. Show predicted performance readiness over time based on training load.

### Session Quality Score
Rate each session 1-100 based on: % of prescribed sets completed, RPE accuracy (close to target), load progression vs previous week, session RPE.

### Exercise Difficulty Curve
Show how your RPE trends for each exercise over weeks. Rising RPE at same load = accumulating fatigue. Flat RPE with rising load = good adaptation.

---

## Social & Motivation

### Workout Sharing
Generate a shareable session summary card (image) — exercises, PRs, total volume. Share to Instagram stories or save to camera roll.

### PR Wall / Trophy Case
Dedicated page showing all-time PRs per exercise with dates, badges for milestones (1 plate bench, 2 plate squat, etc.).

### Streak Badges & Achievements
Unlock badges: "Iron Week" (4 sessions), "Month of Iron" (16 sessions), "Century Club" (100 sessions), "PR Machine" (5 PRs in a week).

---

## Program Management

### Multi-Program Support
Run two programs simultaneously (e.g. strength program + accessory program). Switch between them in the Logger.

### Custom Program Builder
Build a program from scratch in-app instead of requiring Excel upload. Drag-and-drop exercises into weeks/sessions.

### Deload Week Auto-Generator
When deload is recommended, auto-generate a deload week: same exercises at 60% load, 50% volume. One-tap to insert into schedule.

### Program Templates Library
Pre-built popular programs (5/3/1, GZCLP, PPL, Upper/Lower) that can be imported without an Excel file.

---

## Body & Health

### Body Composition Tracking
Track measurements: waist, chest, arms, legs. Progress photos with date overlay. Body fat % trend with visual comparison.

### Nutrition Integration
Simple macro logger (protein/carbs/fat) or integration with MyFitnessPal API. Correlate protein intake with recovery score and strength gains.

### Sleep Quality Correlation
Plot sleep hours vs next-day RPE or recovery score. Show which sleep range produces best training performance.

### Bodyweight vs Strength Scatter
Plot bodyweight against e1RM over time. See if strength is outpacing weight gain (good) or vice versa.

---

## UX & Quality of Life

### Offline Mode Improvements
Queue sets locally when offline, sync when connection returns. Show pending sync indicator. Currently PWA caches pages but not POST requests.

### Dark/Light Theme Toggle
Add theme preference to Settings. Currently dark-only.

### Exercise Notes & Form Cues
Per-exercise notes that persist across sessions (e.g. "wide grip", "pause at bottom", "left knee clicks if too deep").

### Quick Log Mode
Minimal UI: just exercise name + load + reps. For experienced users who don't need the full session flow. Fast rep logging between sets.

### Undo Last Save
"Undo" button after saving a session, in case of accidental save with wrong data. Currently requires manual DB edit to fix.

### Export Full Training History
Export all workout data as JSON/CSV for backup or migration. Include programs, logs, metrics, PRs.

---

## Advanced / Long-term

### AI Coach Suggestions
Use training history to suggest: exercise swaps for weak points, volume adjustments, when to push vs back off. Based on recovery, stagnation, and volume data already tracked.

### Velocity-Based Training (VBT) Integration
If user has a bar speed sensor (e.g. Repone, GymAware), import velocity data to auto-regulate load based on bar speed thresholds.

### Training Block Periodization
Define mesocycles (accumulation → intensification → peaking → deload) with auto-adjusted volume/intensity targets per block.

### Gym Partner Mode
Two users share a session, alternating sets. Shared rest timer, individual logging. For training partners who share a rack.
