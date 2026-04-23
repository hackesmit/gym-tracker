# Feature Ideas

Brainstormed 2026-03-24. Ordered roughly by impact and feasibility.
Last re-tagged 2026-04-21 with implementation status. ✅ = shipped, 🚧 = partial.

---

## Workout Experience

### Workout Timer & Duration Tracking
Track total session duration automatically (start when first set logged, end on save). Show avg session length trends in Analytics.

### Plate Calculator ✅
Enter target weight → shows which plates to load per side. Accounts for bar weight (45 lbs / 20 kg). Useful mid-set when changing weights quickly. **Shipped in `components/PlateCalculator.jsx`.**

### Warm-Up Set Generator ✅
Based on working weight, auto-generate a warm-up pyramid (e.g. bar × 10, 50% × 5, 70% × 3, 85% × 1). The program already has `warm_up_sets` field — surface it in the Logger UI. **Shipped in `components/WarmUpPyramid.jsx`.**

### Set Auto-Fill from Last Session ✅
Pre-populate load/reps from the previous week's logged data for the same exercise + set number. One tap to match or beat last week. **Shipped — Logger auto-fills across all prior weeks (newest first).**

### RPE-Based Auto-Regulation
If logged RPE exceeds prescribed RPE by 1+, suggest reducing load next set. If under, suggest increasing. Real-time feedback during the session.

### Superset Timer
Rest timer that alternates between superset exercises (e.g. "Now: Bicep Curls → Next: Tricep Pushdowns") with shorter inter-exercise rest.

---

## Analytics & Insights

### Training Frequency Heatmap ✅
GitHub-style contribution heatmap showing training days over months. Quick visual of consistency patterns, rest days, and gaps. **Shipped in `components/TrainingHeatmap.jsx`, rendered on Tracker.**

### Estimated 1RM Leaderboard / Timeline 🚧
Timeline view showing when each PR was set. "X days since last PR" motivation counter. Historical 1RM progression across all lifts on one chart. **Partial — Progress page has per-exercise e1RM charts and PR badges; cross-lift unified timeline not yet built.**

### Muscle Recovery Heatmap (Body Map) ✅
Visual body outline with color-coded muscle groups (green = recovered, yellow = moderate, red = fatigued). More intuitive than the current table. **Shipped — `components/BodyMap.jsx` on Recovery, Dashboard, and Profile pages; colors driven by muscle ranks / fatigue.**

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
Generate a shareable session summary card (image) — exercises, PRs, total volume. Share to Instagram stories or save to camera roll. **Still open — SessionSummary card exists in-app but no image export yet.**

### Program Sharing ✅
Share a training program with another user via 8-char code. Owner clicks Share → code is generated → recipient pastes code → preview → import as private deep-copy. Shipped 2026-04-21.

### PR Wall / Trophy Case ✅
Dedicated page showing all-time PRs per exercise with dates, badges for milestones (1 plate bench, 2 plate squat, etc.). **Shipped — Achievements / Hall of Heroes page.**

### Streak Badges & Achievements ✅
Unlock badges: "Iron Week" (4 sessions), "Month of Iron" (16 sessions), "Century Club" (100 sessions), "PR Machine" (5 PRs in a week). **Shipped — Achievements page + `AchievementToast` component; achievements table in DB with tiered badges.**

### Friends & Compare ✅ (new since original brainstorm)
Friend requests, accept/decline, friend profiles, side-by-side compare with muscle-rank + medal overlay.

### Medals & Leaderboards ✅ (new)
Automatic medal awarding for strongest lift, longest streak, longest cardio, etc. Current holder persisted per medal.

### Muscle Ranks ✅ (new, rewritten 2026-04-21)
8-tier rank per muscle group (Copper→Champion) with fixed global thresholds so ranks are comparable across users.

### Global Chat ✅ (polling)
Simple global chat room with system messages for medal events. Rooms/WebSocket upgrade is still open (see `docs/known-bugs.md` O5).

---

## Program Management

### Multi-Program Support
Run two programs simultaneously (e.g. strength program + accessory program). Switch between them in the Logger. **Open — current model enforces single active program per user (imports auto-pause others).**

### Custom Program Builder ✅
Build a program from scratch in-app instead of requiring Excel upload. Drag-and-drop exercises into weeks/sessions. **Shipped in `components/ProgramBuilder.jsx` + `POST /api/programs/custom`.**

### Deload Week Auto-Generator
When deload is recommended, auto-generate a deload week: same exercises at 60% load, 50% volume. One-tap to insert into schedule.

### Program Templates Library 🚧
Pre-built popular programs (5/3/1, GZCLP, PPL, Upper/Lower) that can be imported without an Excel file. **Partial — Nippard "The Essentials" ships as 4 presets (NIPPARD2/3/4/5 share codes, 2×/3×/4×/5× frequency) seeded on startup and importable from Dashboard or Program page. Other programs still open.**

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

### Dark/Light Theme Toggle ✅
Add theme preference to Settings. Currently dark-only. **Shipped — neutral/LOTR mode toggle + 5 LOTR realm palettes; persists via localStorage `gym-theme-mode` and `gym-realm`.**

### Exercise Notes & Form Cues
Per-exercise notes that persist across sessions (e.g. "wide grip", "pause at bottom", "left knee clicks if too deep").

### Quick Log Mode
Minimal UI: just exercise name + load + reps. For experienced users who don't need the full session flow. Fast rep logging between sets.

### Undo Last Save ✅
"Undo" button after saving a session, in case of accidental save with wrong data. Currently requires manual DB edit to fix. **Shipped — `DELETE /api/log/session/{id}` deletes a session and cascades to workout logs.**

### Export Full Training History ✅
Export all workout data as JSON/CSV for backup or migration. Include programs, logs, metrics, PRs. **Shipped — Settings page exposes export via `/api/logs` (CSV/JSON).**

### Internationalization ✅ (new)
Full English + Spanish string table (`frontend/src/i18n.js`). Switchable per user via Settings, persists in localStorage, sets `<html lang>` for screen readers.

### Vacation Mode ✅ (new)
Users can mark vacation periods so streaks don't break. `vacation_periods` table + CRUD + streak integration.

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
