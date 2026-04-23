# LOTR Visual System Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate LOTR-themed PNG assets into the gym tracker as sidebar navigation icons, app branding, and an achievement journey system — in 3 phases.

**Architecture:** Phase 1 copies assets into the frontend public directory, replaces the app logo/favicon with the Ring image, and swaps 5 sidebar nav items to use PNG icons (keeping SVGs for the remaining 5). Phase 2 redesigns the Dashboard with a header bar showing rank/streak/volume and restructures panels. Phase 3 builds a visual journey progression on the Achievements page using the 7 badge PNGs, computed client-side from existing API data.

**Tech Stack:** React 18, Vite, Tailwind CSS, existing SVG icon system (LotrIcons.jsx), PNG assets at 32-40px display size.

---

## File Structure

### New Files
- `frontend/public/lotr/logo.jpg` — Ring/Elvish circle (app logo, from `LOTR icon 8.jpg`)
- `frontend/public/lotr/nav-eye.png` — Eye/torch sidebar icon
- `frontend/public/lotr/nav-horn.png` — Curved horn sidebar icon
- `frontend/public/lotr/nav-hand.png` — Open hand sidebar icon
- `frontend/public/lotr/nav-horn-blow.png` — Arm blowing horn sidebar icon
- `frontend/public/lotr/nav-axe.png` — Battle axe sidebar icon
- `frontend/public/lotr/badge-shire.png` — Hobbit hole badge
- `frontend/public/lotr/badge-rivendell.png` — Elvish gate badge
- `frontend/public/lotr/badge-mountains.png` — Mountain fortress badge
- `frontend/public/lotr/badge-crown.png` — Crown/helmet badge
- `frontend/public/lotr/badge-balrog.png` — Balrog badge
- `frontend/public/lotr/badge-gondor.png` — Gandalf/White City badge
- `frontend/public/lotr/badge-ring.png` — Ring ultimate badge (same as logo)
- `frontend/src/components/JourneyProgress.jsx` — Journey progression panel (Phase 3)

### Modified Files
- `frontend/src/components/Layout.jsx` — Replace 5 nav icons with PNGs, update logo
- `frontend/src/index.css` — Add nav icon hover styles, journey progression styles
- `frontend/public/manifest.json` — Update PWA icon references
- `frontend/index.html` — Update favicon link
- `frontend/src/pages/Dashboard.jsx` — Add header bar with rank/streak/volume (Phase 2)
- `frontend/src/pages/Achievements.jsx` — Add journey progression panel (Phase 3)

---

## Phase 1: Sidebar Navigation + Logo

### Task 1: Copy and organize assets

**Files:**
- Create: `frontend/public/lotr/` directory and all PNG files

- [ ] **Step 1: Create asset directory and copy sidebar icons**

```bash
mkdir -p "frontend/public/lotr"
cp "LOTR Sidebar/image-removebg-preview.png" "frontend/public/lotr/nav-eye.png"
cp "LOTR Sidebar/image-removebg-preview (1).png" "frontend/public/lotr/nav-horn.png"
cp "LOTR Sidebar/image-removebg-preview (2).png" "frontend/public/lotr/nav-hand.png"
cp "LOTR Sidebar/image-removebg-preview (3).png" "frontend/public/lotr/nav-horn-blow.png"
cp "LOTR Sidebar/image-removebg-preview (4).png" "frontend/public/lotr/nav-axe.png"
```

- [ ] **Step 2: Copy badge images**

```bash
cp "LOTR Badges/LOTR_icon_7-removebg-preview.png" "frontend/public/lotr/badge-shire.png"
cp "LOTR Badges/LOTR_icon_3-removebg-preview.png" "frontend/public/lotr/badge-rivendell.png"
cp "LOTR Badges/LOTR_icon_4-removebg-preview.png" "frontend/public/lotr/badge-mountains.png"
cp "LOTR Badges/LOTR_icon_5-removebg-preview.png" "frontend/public/lotr/badge-crown.png"
cp "LOTR Badges/LOTR_icon_2-removebg-preview.png" "frontend/public/lotr/badge-balrog.png"
cp "LOTR Badges/LOTR_icon_1-removebg-preview.png" "frontend/public/lotr/badge-gondor.png"
cp "LOTR Badges/LOTR icon 8.jpg" "frontend/public/lotr/logo.jpg"
```

- [ ] **Step 3: Verify all files copied correctly**

Run: `ls -la frontend/public/lotr/`
Expected: 12 files (5 nav + 6 badge + 1 logo)

- [ ] **Step 4: Commit**

```bash
git add frontend/public/lotr/
git commit -m "feat: add LOTR PNG assets for nav icons, badges, and logo"
```

### Task 2: Replace app logo and favicon

**Files:**
- Modify: `frontend/src/components/Layout.jsx:32-35` (AppLogo component)
- Modify: `frontend/index.html` (favicon link)
- Modify: `frontend/public/manifest.json`

- [ ] **Step 1: Update AppLogo component in Layout.jsx**

Replace the `AppLogo` function (lines 32-35) with:

```jsx
function AppLogo({ size = 'md' }) {
  const px = size === 'sm' ? 28 : 36;
  return (
    <img
      src="/lotr/logo.jpg"
      alt="Anabolic Analyzer"
      width={px}
      height={px}
      className="rounded-full object-cover"
    />
  );
}
```

The `rounded-full` class makes the square JPG display as a circle, which works well for the ring image since the content is already circular.

- [ ] **Step 2: Update favicon in index.html**

Find the existing favicon `<link>` tag in `frontend/index.html` and replace with:

```html
<link rel="icon" type="image/jpeg" href="/lotr/logo.jpg" />
```

If there are multiple icon links (e.g., apple-touch-icon), update those too to point to `/lotr/logo.jpg`.

- [ ] **Step 3: Update manifest.json**

Replace the icons array in `frontend/public/manifest.json`:

```json
{
  "name": "Anabolic Analyzer",
  "short_name": "AnabolicAnalyzer",
  "description": "Track workouts, progressive overload, and analytics",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f1119",
  "theme_color": "#1a1d2e",
  "icons": [
    {
      "src": "/lotr/logo.jpg",
      "sizes": "500x500",
      "type": "image/jpeg"
    },
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Keep old PWA icons as fallback; add the logo as first entry.

- [ ] **Step 4: Verify the logo renders in browser**

Run: `cd frontend && npm run dev`
Expected: Logo displays as a circular ring emblem in both desktop sidebar header and mobile header.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Layout.jsx frontend/index.html frontend/public/manifest.json
git commit -m "feat: replace app logo and favicon with LOTR ring emblem"
```

### Task 3: Replace 5 sidebar nav icons with PNGs

**Files:**
- Modify: `frontend/src/components/Layout.jsx:1-30` (imports and navItems array)
- Modify: `frontend/src/index.css` (add nav icon styles)

The 5 PNG sidebar icons map to these routes:

| PNG | Route | Label | Rationale |
|---|---|---|---|
| `nav-horn-blow.png` | `/log` | Log Workout | "Sound the horn" = call to action, start session |
| `nav-axe.png` | `/progress` | Progress | Axe = forging strength, PRs |
| `nav-eye.png` | `/analytics` | Analytics | All-seeing eye = data insight |
| `nav-horn.png` | `/program` | Program | Horn of Gondor = the plan/call |
| `nav-hand.png` | `/achievements` | Achievements | Raised hand = claim your honor |

The remaining 5 routes (Dashboard, Tracker, Recovery, Chronicle, Settings) keep their existing SVG icons.

- [ ] **Step 1: Create LotrNavIcon component and update navItems in Layout.jsx**

Replace lines 1-30 of `Layout.jsx` with:

```jsx
import { NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import {
  TodaysQuest, EyeOfSauron, Lembas,
  Chronicle as ChronicleIcon, SettingsGear, Ring,
} from './LotrIcons';
import { useApp } from '../context/AppContext';

const REALM_META = {
  gondor:    { label: 'Gondor',    icon: '🏰' },
  rohan:     { label: 'Rohan',     icon: '🐴' },
  rivendell: { label: 'Rivendell', icon: '🌿' },
  mordor:    { label: 'Mordor',    icon: '🔥' },
  shire:     { label: 'Shire',     icon: '🍺' },
};

/* PNG nav icon — renders an <img> at the given size */
function LotrNavIcon({ src, size = 18, className = '' }) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`lotr-nav-icon object-contain ${className}`}
      draggable={false}
    />
  );
}

/* Wrapper that unifies SVG components and PNG <img> into a single interface */
function makePngNav(src) {
  return function PngNavIcon({ size = 18, className = '' }) {
    return <LotrNavIcon src={src} size={size} className={className} />;
  };
}

const NavHornBlow = makePngNav('/lotr/nav-horn-blow.png');
const NavAxe      = makePngNav('/lotr/nav-axe.png');
const NavEye      = makePngNav('/lotr/nav-eye.png');
const NavHorn     = makePngNav('/lotr/nav-horn.png');
const NavHand     = makePngNav('/lotr/nav-hand.png');

const navItems = [
  { to: '/',              icon: TodaysQuest,   label: 'Dashboard' },
  { to: '/tracker',       icon: EyeOfSauron,   label: 'Tracker' },
  { to: '/log',           icon: NavHornBlow,   label: 'Log Workout' },
  { to: '/progress',      icon: NavAxe,        label: 'Progress' },
  { to: '/analytics',     icon: NavEye,        label: 'Analytics' },
  { to: '/recovery',      icon: Lembas,        label: 'Recovery' },
  { to: '/history',       icon: ChronicleIcon, label: 'Chronicle' },
  { to: '/program',       icon: NavHorn,       label: 'Program' },
  { to: '/achievements',  icon: NavHand,       label: 'Achievements' },
  { to: '/settings',      icon: SettingsGear,  label: 'Settings' },
];
```

Note: `Barbell`, `ArrowUp`, `Mountain`, `MapScroll`, `Trophy` imports are removed (no longer needed in this file). `EyeOfSauron` is kept for Tracker.

- [ ] **Step 2: Increase PNG icon size in nav rendering**

In the same `Layout.jsx`, find the two places where icons render at `size={18}` inside the `<nav>` sections (desktop sidebar line ~65 and mobile overlay line ~124).

Change both `<Icon size={18} />` to `<Icon size={22} />` so the PNGs render at 22px — slightly larger than the SVGs to compensate for their visual weight with detail.

Desktop (around line 65):
```jsx
<Icon size={22} />
```

Mobile (around line 124):
```jsx
<Icon size={22} />
```

- [ ] **Step 3: Add CSS for PNG nav icons**

Add to the end of `frontend/src/index.css`:

```css
/* ============================================================
   LOTR PNG NAV ICONS
   ============================================================ */

.lotr-nav-icon {
  opacity: 0.7;
  transition: opacity 0.2s ease, filter 0.2s ease;
  filter: grayscale(20%);
}

/* Brighten on hover (parent link handles hover) */
a:hover .lotr-nav-icon,
.nav-active .lotr-nav-icon {
  opacity: 1;
  filter: grayscale(0%) drop-shadow(0 0 4px color-mix(in srgb, var(--color-accent) 40%, transparent 60%));
}
```

This gives PNGs a subtle dimmed state that brightens on hover/active, creating visual parity with the SVG icons that use `text-text-muted` / `text-accent-light` color changes.

- [ ] **Step 4: Verify navigation renders correctly**

Run: `cd frontend && npm run dev`

Check:
- Desktop sidebar: 5 routes show PNG icons, 5 show SVG icons
- All PNG icons are visible and properly sized (~22px)
- Hover state brightens PNG icons
- Active state (current page) brightens PNG icons with subtle gold glow
- Mobile overlay nav: same behavior
- Logo displays correctly in both desktop and mobile headers

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Layout.jsx frontend/src/index.css
git commit -m "feat: replace 5 sidebar nav items with LOTR PNG icons"
```

---

## Phase 2: Dashboard Header Bar + Panel Restructure

### Task 4: Add header bar with rank, streak, and lifetime volume

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx:107-120` (page header section)
- Modify: `frontend/src/api/client.js` (if additional API data needed — verify first)

The header bar replaces the current simple "Dashboard / program name" header with a richer bar showing:
- App logo (small)
- Journey rank (computed from session count milestones)
- Training streak
- Lifetime volume (from summary data)

Journey rank mapping (client-side, from existing `getSummary()` and `getTracker()` data):

```
Sessions 0      → "The Shire"
Sessions 1-9    → "Bree"
Sessions 10-24  → "Rivendell"
Sessions 25-49  → "Misty Mountains"
Sessions 50-99  → "Lothlórien"
Sessions 100-199 → "Helm's Deep"
Sessions 200-499 → "Minas Tirith"
Sessions 500+   → "Bearer of the Ring"
```

These map approximately to the 7 badge images and correspond to existing milestone triggers (10, 25, 50, 100, 200, 500).

- [ ] **Step 1: Add rank computation helper to Dashboard.jsx**

Add this function above the `Dashboard` component (after imports, around line 58):

```jsx
/* ─── Journey rank from total sessions ─── */
const JOURNEY_RANKS = [
  { min: 500, label: 'Bearer of the Ring' },
  { min: 200, label: 'Minas Tirith' },
  { min: 100, label: "Helm's Deep" },
  { min: 50,  label: 'Lothlórien' },
  { min: 25,  label: 'Misty Mountains' },
  { min: 10,  label: 'Rivendell' },
  { min: 1,   label: 'Bree' },
  { min: 0,   label: 'The Shire' },
];

function getJourneyRank(sessionCount) {
  return JOURNEY_RANKS.find(r => sessionCount >= r.min) || JOURNEY_RANKS[JOURNEY_RANKS.length - 1];
}
```

- [ ] **Step 2: Replace the page header section**

Replace lines 109-120 (the `{/* Page header */}` section) with:

```jsx
      {/* ─── Header bar ─── */}
      <div className="heraldic-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src="/lotr/logo.jpg"
              alt=""
              width={48}
              height={48}
              className="rounded-full object-cover shrink-0 hidden sm:block"
            />
            <div className="min-w-0">
              <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-wide truncate">
                {activeProgram?.name || 'Dashboard'}
              </h2>
              <p className="text-xs text-accent font-display tracking-wider mt-0.5">
                Journey Rank: {getJourneyRank(tracker?.completed ?? 0).label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            <div className="text-center hidden sm:block">
              <div className="text-lg font-bold text-text">{tracker?.current_streak ?? 0}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider">Streak</div>
            </div>
            <div className="text-center hidden sm:block">
              <div className="text-lg font-bold text-text">
                {summary?.total_volume_kg != null
                  ? `${Math.round(convert(summary.total_volume_kg)).toLocaleString()}`
                  : '--'}
              </div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider">Volume ({unitLabel})</div>
            </div>
            <Link to="/log" className="flex items-center gap-2 px-4 py-2.5 btn-gold text-sm">
              <Dumbbell size={16} /> Log
            </Link>
          </div>
        </div>
      </div>
```

Note: `summary.total_volume_kg` might not exist yet in the API response. If it doesn't, check what `getSummary()` returns and use the available field. The `convert()` function from AppContext handles kg→lbs conversion.

- [ ] **Step 3: Verify header renders**

Run: `cd frontend && npm run dev`

Check:
- Header shows program name + journey rank
- Streak and volume display on desktop (hidden on mobile to save space)
- "Log" button is accessible
- Logo appears on desktop, hidden on mobile (mobile already has logo in nav header)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: add dashboard header bar with journey rank, streak, volume"
```

### Task 5: Add total volume to analytics summary API (if needed)

**Files:**
- Modify: `backend/app/routers/analytics.py` (summary endpoint)

**Pre-check:** First verify what `GET /api/analytics/summary` currently returns. Read `backend/app/routers/analytics.py` and find the summary endpoint. If it already returns total volume/tonnage, skip this task.

If it doesn't return total volume:

- [ ] **Step 1: Read the summary endpoint implementation**

Read `backend/app/routers/analytics.py` and find the `summary` function. Identify what it returns.

- [ ] **Step 2: Add total volume to summary response**

Add a query to sum all `WorkoutLog.load_kg * WorkoutLog.reps_completed` for the user. Add the result as `total_volume_kg` to the response dict.

```python
from sqlalchemy import func

# Inside the summary endpoint, add:
total_vol = db.query(
    func.sum(WorkoutLog.load_kg * WorkoutLog.reps_completed)
).filter(WorkoutLog.user_id == uid).scalar()

# Add to response:
result["total_volume_kg"] = round(total_vol or 0, 1)
```

- [ ] **Step 3: Test the endpoint**

Run: `cd backend && python -m pytest tests/ -v -k summary` (if tests exist)
Or manually: `curl http://localhost:8000/api/analytics/summary | python -m json.tool`

Expected: Response includes `"total_volume_kg": <number>`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/analytics.py
git commit -m "feat: add total_volume_kg to analytics summary endpoint"
```

---

## Phase 3: Achievement Journey System

### Task 6: Create JourneyProgress component

**Files:**
- Create: `frontend/src/components/JourneyProgress.jsx`

This component renders a horizontal progression of 7 badge images representing the user's training journey. Badges are unlocked based on total session count, matching the backend's existing milestone triggers.

Badge progression:

| Stage | Image | Unlock | Label |
|---|---|---|---|
| 1 | `badge-shire.png` | 0 sessions (always unlocked) | The Shire |
| 2 | `badge-rivendell.png` | 10 sessions | Rivendell |
| 3 | `badge-mountains.png` | 25 sessions | Misty Mountains |
| 4 | `badge-crown.png` | 50 sessions | Lothlórien |
| 5 | `badge-balrog.png` | 100 sessions | Moria |
| 6 | `badge-gondor.png` | 200 sessions | Minas Tirith |
| 7 | `badge-ring.png` | 500 sessions | Ring Bearer |

- [ ] **Step 1: Create JourneyProgress.jsx**

```jsx
const JOURNEY_STAGES = [
  { key: 'shire',     img: '/lotr/badge-shire.png',     label: 'The Shire',       unlock: 0 },
  { key: 'rivendell', img: '/lotr/badge-rivendell.png', label: 'Rivendell',        unlock: 10 },
  { key: 'mountains', img: '/lotr/badge-mountains.png', label: 'Misty Mountains',  unlock: 25 },
  { key: 'crown',     img: '/lotr/badge-crown.png',     label: 'Lothlórien',       unlock: 50 },
  { key: 'balrog',    img: '/lotr/badge-balrog.png',     label: 'Moria',            unlock: 100 },
  { key: 'gondor',    img: '/lotr/badge-gondor.png',     label: 'Minas Tirith',     unlock: 200 },
  { key: 'ring',      img: '/lotr/badge-ring.png',       label: 'Ring Bearer',      unlock: 500 },
];

export default function JourneyProgress({ sessionCount = 0 }) {
  const currentStageIdx = JOURNEY_STAGES.reduce(
    (best, stage, i) => (sessionCount >= stage.unlock ? i : best), 0
  );

  // Progress within current stage toward next
  const current = JOURNEY_STAGES[currentStageIdx];
  const next = JOURNEY_STAGES[currentStageIdx + 1];
  const stageProgress = next
    ? Math.min(((sessionCount - current.unlock) / (next.unlock - current.unlock)) * 100, 100)
    : 100;

  return (
    <div className="space-y-4">
      {/* Stage label */}
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-display font-semibold">
          Current Stage
        </p>
        <p className="font-display text-lg font-semibold text-text mt-1">
          {current.label}
        </p>
        {next && (
          <p className="text-xs text-text-muted mt-0.5">
            {sessionCount} / {next.unlock} sessions to {next.label}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {next && (
        <div className="w-full bg-surface-lighter rounded-full h-2">
          <div
            className="bg-accent rounded-full h-2 transition-all duration-500"
            style={{ width: `${stageProgress}%` }}
          />
        </div>
      )}

      {/* Badge row */}
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {JOURNEY_STAGES.map((stage, i) => {
          const unlocked = sessionCount >= stage.unlock;
          const isCurrent = i === currentStageIdx;

          return (
            <div key={stage.key} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              <div
                className={`relative rounded-full p-1 transition-all ${
                  isCurrent
                    ? 'ring-2 ring-accent shadow-glow'
                    : unlocked
                      ? 'ring-1 ring-accent/30'
                      : ''
                }`}
              >
                <img
                  src={stage.img}
                  alt={stage.label}
                  className={`w-10 h-10 sm:w-14 sm:h-14 object-contain rounded-full transition-all ${
                    unlocked ? '' : 'grayscale opacity-30'
                  }`}
                />
              </div>
              <span
                className={`text-[8px] sm:text-[10px] text-center leading-tight ${
                  isCurrent ? 'text-accent font-semibold' : unlocked ? 'text-text-muted' : 'text-text-muted/40'
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Connector line behind badges — visual only */}
      {/* This is handled by the flex layout gap; no extra decoration needed */}
    </div>
  );
}
```

- [ ] **Step 2: Verify the component renders in isolation**

Temporarily import and render it in Dashboard.jsx to test:

```jsx
import JourneyProgress from '../components/JourneyProgress';
// In the JSX, add temporarily:
<JourneyProgress sessionCount={42} />
```

Check: Badges 1-3 appear full color, badge 4 (unlock: 50) appears dimmed, progress bar shows 42/50.

- [ ] **Step 3: Remove the temporary test render and commit**

```bash
git add frontend/src/components/JourneyProgress.jsx
git commit -m "feat: create JourneyProgress component with 7-stage badge system"
```

### Task 7: Add journey CSS styles

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add journey-specific styles to index.css**

Add to the end of `frontend/src/index.css`:

```css
/* ============================================================
   JOURNEY PROGRESSION
   ============================================================ */

.shadow-glow {
  box-shadow: var(--shadow-glow);
}

/* Journey connector line between badges */
.journey-connector {
  position: relative;
}
.journey-connector::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    var(--color-accent) var(--journey-progress, 0%),
    var(--color-surface-lighter) var(--journey-progress, 0%)
  );
  transform: translateY(-50%);
  z-index: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: add journey progression CSS styles"
```

### Task 8: Integrate JourneyProgress into Achievements page

**Files:**
- Modify: `frontend/src/pages/Achievements.jsx`

- [ ] **Step 1: Add session count state and fetch**

The achievements page needs the total session count to compute journey progress. This comes from `getTracker()` (which returns `completed` count) or we can count milestone achievements.

Add imports and state at the top of `Achievements.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Trophy, Award, Target, Flame, Star } from 'lucide-react';
import Card from '../components/Card';
import JourneyProgress from '../components/JourneyProgress';
import LoadingSpinner from '../components/LoadingSpinner';
import { getAchievements, getSummary } from '../api/client';
import { useApp } from '../context/AppContext';
```

Update the state and data fetching in the component:

```jsx
export default function Achievements() {
  const { convert, unitLabel } = useApp();
  const [achievements, setAchievements] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAchievements().catch(() => []),
      getSummary().catch(() => null),
    ]).then(([achList, summary]) => {
      setAchievements(achList);
      setSessionCount(summary?.total_sessions ?? 0);
    }).finally(() => setLoading(false));
  }, []);
```

Note: `summary.total_sessions` may need to be verified against the actual API response. If the summary endpoint returns `total_sets_logged` instead, use that. Check `getSummary()` response shape.

- [ ] **Step 2: Add JourneyProgress panel to the page**

Insert the journey section right after the page header (after the divider, before "Hall of Records"):

```jsx
      {/* ─── Journey Progression ─── */}
      <Card title="The Journey" variant="parchment">
        <JourneyProgress sessionCount={sessionCount} />
      </Card>
```

- [ ] **Step 3: Verify the full achievements page**

Run: `cd frontend && npm run dev`
Navigate to `/achievements`

Check:
- Journey panel appears at top with badge progression
- Current stage is highlighted with gold ring
- Unlocked badges show full color
- Locked badges are greyed out
- Progress bar shows advancement toward next stage
- Existing sections (PRs, All-Time Records, Milestones, Honors) still render below

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Achievements.jsx
git commit -m "feat: integrate journey progression panel into achievements page"
```

### Task 9: Add total_sessions to summary API (if needed)

**Files:**
- Modify: `backend/app/routers/analytics.py`

**Pre-check:** Verify what `getSummary()` returns. If it already has a session count field, skip this task.

- [ ] **Step 1: Read the summary endpoint**

Read `backend/app/routers/analytics.py` and identify the summary function's return value.

- [ ] **Step 2: Add total session count if missing**

```python
from sqlalchemy import func

# Inside the summary endpoint:
total_sessions = db.query(func.count(SessionLog.id)).filter(
    SessionLog.status == 'completed'
).scalar()

result["total_sessions"] = total_sessions or 0
```

- [ ] **Step 3: Test**

Run: `curl http://localhost:8000/api/analytics/summary | python -m json.tool`
Expected: `"total_sessions": <number>`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/analytics.py
git commit -m "feat: add total_sessions count to analytics summary"
```

### Task 10: Add journey preview to Dashboard

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx:264-307` (Journey + Recovery section)

Replace the current "Journey Progress" card (the simple progress bar) with the badge-based JourneyProgress component.

- [ ] **Step 1: Import JourneyProgress in Dashboard.jsx**

Add to imports:

```jsx
import JourneyProgress from '../components/JourneyProgress';
```

- [ ] **Step 2: Replace the Journey Progress card**

Replace the "Journey Progress" `<Card>` block (lines ~267-287) with:

```jsx
        {activeProgram && tracker && (
          <Card title="The Journey" variant="parchment">
            <JourneyProgress sessionCount={tracker?.completed ?? 0} />
            <div className="mt-3 pt-3 border-t border-surface-lighter flex items-center justify-between text-xs text-text-muted">
              <span>Week {tracker.current_week} of {tracker.total_weeks || activeProgram.total_weeks}</span>
              <span className="text-accent-light font-medium">{completionPct}% program complete</span>
            </div>
          </Card>
        )}
```

This embeds the compact journey badges above the existing program progress info.

- [ ] **Step 3: Verify Dashboard**

Run: `cd frontend && npm run dev`

Check:
- Journey badges appear in the left column of the bottom 2-column grid
- Badge states (locked/unlocked) match the user's session count
- Recovery card still appears in the right column
- Mobile: cards stack vertically

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: add journey progression badges to dashboard"
```

---

## Final Verification

### Task 11: Full integration test

- [ ] **Step 1: Run frontend build to catch compilation errors**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Visual check all affected pages**

Open the dev server and verify:

1. **Sidebar** — 5 PNG icons + 5 SVG icons render correctly, hover/active states work
2. **Logo** — Ring emblem appears in sidebar header (desktop) and mobile header
3. **Favicon** — Browser tab shows the ring image
4. **Dashboard** — Header bar shows rank + streak + volume; journey badges in bottom section
5. **Achievements** — Journey progression panel at top with all 7 badges
6. **Mobile** — All features responsive, nothing overflows

- [ ] **Step 3: Check all 5 realm themes**

Click through Gondor → Rohan → Rivendell → Mordor → Shire. Verify:
- PNG icons remain visible (they're fixed-color, should be fine on all backgrounds)
- SVG icons adapt color correctly
- Journey badges remain clear against each theme's surface color
- No jarring color clashes

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final polish for LOTR visual system integration"
```
