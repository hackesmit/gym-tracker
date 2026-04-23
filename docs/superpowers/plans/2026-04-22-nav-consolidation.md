# Navigation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce sidebar from 15 tabs to 9 by consolidating Progress/Analytics/History into a `/stats` hub, Profile/Achievements/Medals into a `/profile` hub, Friends/Chat into a `/social` hub, and removing Recovery entirely.

**Architecture:** Three new "hub" pages using React Router nested routes and a shared `HubLayout` component that renders a horizontal sub-tab strip plus `<Outlet />`. Old top-level paths (`/progress`, `/achievements`, etc.) become `<Navigate replace>` redirects to preserve bookmarks. Friend-profile view is extracted from `/profile?userId=N` to a dedicated `/users/:id` route.

**Tech Stack:** React 18, React Router v6, Vite, Tailwind, Vitest. No backend framework changes — just endpoint deletions.

**Spec:** `docs/superpowers/specs/2026-04-22-nav-consolidation-design.md`

---

## File overview

**New files:**
- `frontend/src/components/HubLayout.jsx` — shared hub shell (tab strip + Outlet)
- `frontend/src/pages/hubs/StatsHub.jsx` — `[progress, analytics, history]`
- `frontend/src/pages/hubs/ProfileHub.jsx` — `[me, achievements, medals]`
- `frontend/src/pages/hubs/SocialHub.jsx` — `[friends, chat]`
- `frontend/src/pages/UserProfile.jsx` — friend-profile view (lifted from Profile.jsx)
- `frontend/src/components/__tests__/HubLayout.test.jsx` — smoke test

**Modified files:**
- `frontend/src/App.jsx` — route tree restructuring, redirects, imports
- `frontend/src/components/Layout.jsx` — sidebar 15 → 9 items, both `lotrNavItems` and `neutralNavItems`
- `frontend/src/i18n.js` — add hub + sub-tab keys, remove `nav.recovery`
- `frontend/src/api/client.js` — remove `getRecovery()`
- `frontend/src/pages/Dashboard.jsx` — remove Recovery banner
- `frontend/src/pages/Profile.jsx` — remove friend-view branch (self-only now)
- `frontend/src/pages/Friends.jsx` — update 1 link from `/profile?userId=` to `/users/`
- `backend/app/routers/analytics.py` — remove `GET /recovery` endpoint
- `backend/app/routers/dashboard.py` — remove `recovery_flag` field

**Deleted files:**
- `frontend/src/pages/Recovery.jsx`

---

## Task 1: Remove Recovery completely

**Files:**
- Delete: `frontend/src/pages/Recovery.jsx`
- Modify: `frontend/src/App.jsx` (remove import, remove route)
- Modify: `frontend/src/components/Layout.jsx` (remove nav entries, clean unused imports)
- Modify: `frontend/src/i18n.js` (remove `nav.recovery` in both en and es)
- Modify: `frontend/src/api/client.js` (remove `getRecovery`)
- Modify: `frontend/src/pages/Dashboard.jsx` (remove Recovery banner block)
- Modify: `backend/app/routers/analytics.py` (remove `/recovery` endpoint)
- Modify: `backend/app/routers/dashboard.py` (remove `recovery_flag` computation + response field)

- [ ] **Step 1.1: Remove frontend Recovery route and import**

Edit `frontend/src/App.jsx`:
- Delete line `import Recovery from './pages/Recovery';`
- Delete line `<Route path="/recovery" element={<Recovery />} />`

- [ ] **Step 1.2: Remove Recovery from Layout.jsx nav arrays**

Edit `frontend/src/components/Layout.jsx`:
- Delete the line `{ to: '/recovery', icon: Lembas, labelKey: 'nav.recovery' },` from `lotrNavItems`.
- Delete the line `{ to: '/recovery', icon: Leaf, labelKey: 'nav.recovery' },` from `neutralNavItems`.
- In the `lucide-react` import (line 2–5), remove `Leaf` from the list.
- In the `./LotrIcons` import (line 7–10), remove `Lembas` from the list.

- [ ] **Step 1.3: Remove nav.recovery key from i18n.js**

Edit `frontend/src/i18n.js`:
- Delete line `'nav.recovery': 'Recovery',` (around line 52 in `en`).
- Delete line `'nav.recovery': 'Recuperación',` (around line 459 in `es`).

- [ ] **Step 1.4: Remove getRecovery from api/client.js**

Edit `frontend/src/api/client.js`:
- Delete the line `export const getRecovery = () => request('/analytics/recovery');` (around line 232).

- [ ] **Step 1.5: Remove Recovery banner from Dashboard.jsx**

Edit `frontend/src/pages/Dashboard.jsx`:
- Delete the line `const recovery = data?.recovery_flag;` (around line 90).
- Delete the entire `{recovery?.warning && ( … )}` JSX block (around lines 234–241, including the comment `{/* Recovery flag */}` above it).

- [ ] **Step 1.6: Delete the Recovery page file**

```bash
rm "frontend/src/pages/Recovery.jsx"
```

- [ ] **Step 1.7: Remove backend /recovery endpoint**

Edit `backend/app/routers/analytics.py`:
- Delete the entire endpoint function defined at lines 78–89 (the `@router.get("/recovery")` decorator and its `recovery_status` function).
- Leave `from ..analytics.recovery import get_recovery_status` (still used internally at line 198 for leaderboard summary).

- [ ] **Step 1.8: Remove recovery_flag from dashboard router**

Edit `backend/app/routers/dashboard.py`:
- Delete lines 131–141 (the `recovery_flag = None` block through `recovery_flag = "rested" if last3 == 0 else "active"`).
- Delete line 205: `"recovery_flag": recovery_flag,` from the response dict.

- [ ] **Step 1.9: Verify frontend builds and tests pass**

```bash
cd frontend && npm run lint && npm test -- --run && npm run build
```
Expected: lint clean, tests pass, build succeeds. If lint flags unused imports anywhere (e.g. a leftover `Leaf` or `Lembas` reference somewhere else), remove them.

- [ ] **Step 1.10: Verify backend tests pass**

```bash
cd backend && python -m pytest -q
```
Expected: all previously passing tests still pass. The pre-existing `test_log_bulk_relog_replaces` failure documented in CLAUDE.md is unrelated — ignore it.

- [ ] **Step 1.11: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Layout.jsx frontend/src/i18n.js \
        frontend/src/api/client.js frontend/src/pages/Dashboard.jsx \
        backend/app/routers/analytics.py backend/app/routers/dashboard.py
git rm frontend/src/pages/Recovery.jsx
git commit -m "feat: remove Recovery tab and backend endpoint"
```

---

## Task 2: Create HubLayout component

**Files:**
- Create: `frontend/src/components/HubLayout.jsx`
- Create: `frontend/src/components/__tests__/HubLayout.test.jsx`

- [ ] **Step 2.1: Write the failing test**

Create `frontend/src/components/__tests__/HubLayout.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HubLayout from '../HubLayout';

// Mock useT — i18n resolves labelKey strings to themselves if no key
vi.mock('../../i18n', () => ({
  useT: () => (key) => key,
}));

const TABS = [
  { to: 'a', labelKey: 'hub.a' },
  { to: 'b', labelKey: 'hub.b' },
];

function TestHub() {
  return <HubLayout tabs={TABS} />;
}

describe('HubLayout', () => {
  it('renders all tab labels and the outlet content for the active route', () => {
    render(
      <MemoryRouter initialEntries={['/hub/a']}>
        <Routes>
          <Route path="/hub" element={<TestHub />}>
            <Route path="a" element={<div>content-a</div>} />
            <Route path="b" element={<div>content-b</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('hub.a')).toBeInTheDocument();
    expect(screen.getByText('hub.b')).toBeInTheDocument();
    expect(screen.getByText('content-a')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd frontend && npm test -- --run src/components/__tests__/HubLayout.test.jsx
```
Expected: FAIL with "Cannot find module '../HubLayout'" (file doesn't exist yet). If `@testing-library/react` is missing, the project already has it via vitest transitively; if that fails, install it with `npm install -D @testing-library/react @testing-library/jest-dom` and re-run. Note which direction the failure comes from before continuing.

- [ ] **Step 2.3: Implement HubLayout**

Create `frontend/src/components/HubLayout.jsx`:

```jsx
import { NavLink, Outlet } from 'react-router-dom';
import { useT } from '../i18n';

/**
 * Shared layout for hub pages (Stats, Profile, Social).
 * Renders a horizontal sub-tab strip + <Outlet /> for the active child route.
 *
 * Props:
 *   tabs: Array<{ to: string, labelKey: string, end?: boolean }>
 *     `to` is a relative path (e.g. "progress"), resolved against the hub's route.
 */
export default function HubLayout({ tabs }) {
  const t = useT();
  return (
    <div>
      <nav className="flex gap-1 overflow-x-auto border-b border-surface-lighter pb-2 mb-4">
        {tabs.map(({ to, labelKey, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'nav-active'
                  : 'text-text-muted hover:bg-surface-light hover:text-text'
              }`
            }
          >
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
cd frontend && npm test -- --run src/components/__tests__/HubLayout.test.jsx
```
Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add frontend/src/components/HubLayout.jsx frontend/src/components/__tests__/HubLayout.test.jsx
git commit -m "feat: add HubLayout component for nav sub-tab strips"
```

---

## Task 3: Extract friend profile to /users/:id

**Files:**
- Create: `frontend/src/pages/UserProfile.jsx`
- Modify: `frontend/src/pages/Profile.jsx` (remove friend-view branch)
- Modify: `frontend/src/App.jsx` (add `/users/:id` route and `/profile?userId=` redirect)
- Modify: `frontend/src/pages/Friends.jsx` (update internal link)

- [ ] **Step 3.1: Identify the friend-view branch in Profile.jsx**

Run:
```bash
cd "/mnt/c/users/danie/downloads/gym tracker" && grep -n "useSearchParams\|targetId\|userId" frontend/src/pages/Profile.jsx
```
Expected output includes lines 79 and 80:
```
79:  const [params] = useSearchParams();
80:  const targetId = params.get('userId');
```
Read the full file to identify every block that branches on `targetId`. The intent is to lift the `targetId != null` paths out into `UserProfile.jsx` and leave `Profile.jsx` rendering only the self-view (the `targetId == null` paths).

- [ ] **Step 3.2: Create UserProfile.jsx for the friend view**

Create `frontend/src/pages/UserProfile.jsx` by copying `frontend/src/pages/Profile.jsx` and modifying:
- Replace `import { useSearchParams } from 'react-router-dom';` with `import { useParams } from 'react-router-dom';`
- Replace `const [params] = useSearchParams(); const targetId = params.get('userId');` with `const { id: targetId } = useParams();`
- Remove every branch that handles the self-view case (i.e., branches where `targetId` is null/undefined) — those stay in `Profile.jsx`. This file should only render the friend-view.
- Rename the default export to `UserProfile`: `export default function UserProfile() { ... }`

If the existing Profile.jsx structure makes extraction messy, the minimal acceptable implementation is: keep `UserProfile` as a thin wrapper that pulls `:id` from params and forwards it as a prop, while Profile.jsx keeps a compatibility branch for prop-driven friend rendering. Document whatever approach is taken in a one-line comment at the top of `UserProfile.jsx`.

- [ ] **Step 3.3: Simplify Profile.jsx to self-only**

Edit `frontend/src/pages/Profile.jsx`:
- Delete the `useSearchParams` import line.
- Delete `const [params] = useSearchParams(); const targetId = params.get('userId');`.
- Delete every branch that handles `targetId != null` — the file now only renders the current user's profile (from `useAuth()`).
- Remove any imports that become unused.

- [ ] **Step 3.4: Add /users/:id route in App.jsx**

Edit `frontend/src/App.jsx`:
- Add import: `import UserProfile from './pages/UserProfile';`
- Inside the `<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>` block, add:
  ```jsx
  <Route path="/users/:id" element={<UserProfile />} />
  ```

- [ ] **Step 3.5: Add `/profile?userId=N` → `/users/:id` redirect**

This needs a small redirect component since `<Navigate>` alone cannot read a query param. Add this helper inside `App.jsx` (above `ProtectedRoute`):

```jsx
import { useSearchParams } from 'react-router-dom';

function ProfileQueryRedirect() {
  const [params] = useSearchParams();
  const uid = params.get('userId');
  if (uid) return <Navigate to={`/users/${uid}`} replace />;
  return <Navigate to="/profile/me" replace />;
}
```

Inside the protected route block, change the existing `/profile` route to:
```jsx
<Route path="/profile" element={<ProfileQueryRedirect />} />
```

(Note: this is a temporary line; Task 5 will replace it with the full ProfileHub nested routes. Leave it in place for now so friend links continue to work during the intermediate commit.)

- [ ] **Step 3.6: Update the internal link in Friends.jsx**

Edit `frontend/src/pages/Friends.jsx` line 141:
- Change `<Link to={\`/profile?userId=${uid}\`} …>` to `<Link to={\`/users/${uid}\`} …>`.

Also search for any other internal references to `/profile?userId=`:
```bash
grep -rn "/profile?userId=" frontend/src
```
Expected: only the Friends.jsx occurrence, now updated. If any others exist, update them the same way.

- [ ] **Step 3.7: Manual verification**

Start the dev server (`cd frontend && npm run dev` and `cd backend && python -m uvicorn app.main:app --reload --port 8000` in parallel). Log in, click a friend in Friends — confirm it navigates to `/users/:id` and renders their profile. Then manually paste `/profile?userId=1` in the address bar — confirm it redirects to `/users/1`.

- [ ] **Step 3.8: Run tests and lint**

```bash
cd frontend && npm run lint && npm test -- --run
```
Expected: lint clean, all tests pass.

- [ ] **Step 3.9: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/UserProfile.jsx \
        frontend/src/pages/Profile.jsx frontend/src/pages/Friends.jsx
git commit -m "feat: split friend profile into /users/:id route"
```

---

## Task 4: Build Stats hub

**Files:**
- Create: `frontend/src/pages/hubs/StatsHub.jsx`
- Modify: `frontend/src/App.jsx` (nest routes under `/stats`, add redirects)
- Modify: `frontend/src/i18n.js` (add stats keys, both locales)
- Modify: `frontend/src/components/Layout.jsx` (replace 3 nav entries with 1)

- [ ] **Step 4.1: Create StatsHub.jsx**

Create `frontend/src/pages/hubs/StatsHub.jsx`:

```jsx
import HubLayout from '../../components/HubLayout';

const TABS = [
  { to: 'progress',  labelKey: 'stats.progress' },
  { to: 'analytics', labelKey: 'stats.analytics' },
  { to: 'history',   labelKey: 'stats.history' },
];

export default function StatsHub() {
  return <HubLayout tabs={TABS} />;
}
```

- [ ] **Step 4.2: Restructure Stats routes in App.jsx**

Edit `frontend/src/App.jsx`:

Add import near the top with the other page imports:
```jsx
import StatsHub from './pages/hubs/StatsHub';
```

Inside the protected `<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>` block:

**Remove** these three existing route lines:
```jsx
<Route path="/progress" element={<Progress />} />
<Route path="/analytics" element={<Analytics />} />
<Route path="/history" element={<History />} />
```

**Replace** with the nested hub + old-path redirects:
```jsx
<Route path="/stats" element={<StatsHub />}>
  <Route index element={<Navigate to="progress" replace />} />
  <Route path="progress"  element={<Progress />} />
  <Route path="analytics" element={<Analytics />} />
  <Route path="history"   element={<History />} />
</Route>
<Route path="/progress"  element={<Navigate to="/stats/progress"  replace />} />
<Route path="/analytics" element={<Navigate to="/stats/analytics" replace />} />
<Route path="/history"   element={<Navigate to="/stats/history"   replace />} />
```

- [ ] **Step 4.3: Add stats i18n keys**

Edit `frontend/src/i18n.js`:

In the `en` block, replace the three lines `'nav.progress': 'Progress',`, `'nav.analytics': 'Analytics',`, `'nav.history': 'History',` with:
```js
'nav.stats': 'Stats',
'stats.progress': 'Progress',
'stats.analytics': 'Analytics',
'stats.history': 'History',
```
(Keep `'nav.chronicle': 'Chronicle',` — it's a separate LOTR-mode label used elsewhere.)

In the `es` block, replace the corresponding three lines with:
```js
'nav.stats': 'Estadísticas',
'stats.progress': 'Progreso',
'stats.analytics': 'Analíticas',
'stats.history': 'Historial',
```

- [ ] **Step 4.4: Update Layout.jsx sidebar for Stats**

Edit `frontend/src/components/Layout.jsx`:

In `lotrNavItems`, **remove** these three entries:
```jsx
{ to: '/progress',  icon: NavAxe,        labelKey: 'nav.progress' },
{ to: '/analytics', icon: NavEye,        labelKey: 'nav.analytics' },
{ to: '/history',   icon: ChronicleIcon, labelKey: 'nav.chronicle' },
```

**Replace** with a single entry (place it where Progress/Analytics/History used to sit):
```jsx
{ to: '/stats', icon: NavAxe, labelKey: 'nav.stats' },
```

In `neutralNavItems`, **remove** these three entries:
```jsx
{ to: '/progress',  icon: TrendingUp, labelKey: 'nav.progress' },
{ to: '/analytics', icon: BarChart3,  labelKey: 'nav.analytics' },
{ to: '/history',   icon: BookOpen,   labelKey: 'nav.history' },
```

**Replace** with:
```jsx
{ to: '/stats', icon: BarChart3, labelKey: 'nav.stats' },
```

Then, check which `lucide-react` imports (`TrendingUp`, `BookOpen`) and which `LotrIcons` imports (`ChronicleIcon`, `NavEye`) are still referenced elsewhere in `Layout.jsx`. Remove any that are no longer used.

- [ ] **Step 4.5: Manual verification**

Run `cd frontend && npm run dev`. Log in. Verify:
- Sidebar shows "Stats" instead of three separate items. Clicking it goes to `/stats/progress`.
- Sub-tab strip shows Progress, Analytics, History. Clicking each changes the URL and the content.
- Browser back button navigates between sub-tabs correctly.
- Manually visit `/progress` — redirects to `/stats/progress`. Same for `/analytics` and `/history`.

- [ ] **Step 4.6: Run lint, tests, and build**

```bash
cd frontend && npm run lint && npm test -- --run && npm run build
```
Expected: lint clean, tests pass, build succeeds.

- [ ] **Step 4.7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/hubs/StatsHub.jsx \
        frontend/src/i18n.js frontend/src/components/Layout.jsx
git commit -m "feat: consolidate Progress/Analytics/History into /stats hub"
```

---

## Task 5: Build Profile hub

**Files:**
- Create: `frontend/src/pages/hubs/ProfileHub.jsx`
- Modify: `frontend/src/App.jsx` (nest routes under `/profile`, add redirects, remove the Task-3 temporary `ProfileQueryRedirect` route)
- Modify: `frontend/src/i18n.js` (add profile sub-tab keys, both locales)
- Modify: `frontend/src/components/Layout.jsx` (replace 3 nav entries with 1)

- [ ] **Step 5.1: Create ProfileHub.jsx**

Create `frontend/src/pages/hubs/ProfileHub.jsx`:

```jsx
import HubLayout from '../../components/HubLayout';

const TABS = [
  { to: 'me',           labelKey: 'profile.me' },
  { to: 'achievements', labelKey: 'profile.achievements' },
  { to: 'medals',       labelKey: 'profile.medals' },
];

export default function ProfileHub() {
  return <HubLayout tabs={TABS} />;
}
```

- [ ] **Step 5.2: Restructure Profile routes in App.jsx**

Edit `frontend/src/App.jsx`:

Add import: `import ProfileHub from './pages/hubs/ProfileHub';`

**Remove** these existing routes from the protected block:
```jsx
<Route path="/achievements" element={<Achievements />} />
<Route path="/medals" element={<Medals />} />
<Route path="/profile" element={<ProfileQueryRedirect />} />
```

(The `ProfileQueryRedirect` helper component added in Task 3 will be rewritten below — keep the function, update its body.)

**Add** the hub and redirects:
```jsx
<Route path="/profile" element={<ProfileHub />}>
  <Route index element={<ProfileQueryRedirect />} />
  <Route path="me"           element={<Profile />} />
  <Route path="achievements" element={<Achievements />} />
  <Route path="medals"       element={<Medals />} />
</Route>
<Route path="/achievements" element={<Navigate to="/profile/achievements" replace />} />
<Route path="/medals"       element={<Navigate to="/profile/medals"       replace />} />
```

Update the `ProfileQueryRedirect` helper body (it now runs as the *index* route of the profile hub, so it needs to preserve the hub chrome when redirecting to `me`, and bail out to `/users/:id` when a userId is present):

```jsx
function ProfileQueryRedirect() {
  const [params] = useSearchParams();
  const uid = params.get('userId');
  if (uid) return <Navigate to={`/users/${uid}`} replace />;
  return <Navigate to="me" replace />;
}
```

Note the relative target `"me"` (not `"/profile/me"`) — because this component now renders as an index under the `/profile` hub, a relative path will resolve to `/profile/me` while keeping React Router happy.

- [ ] **Step 5.3: Add profile i18n keys**

Edit `frontend/src/i18n.js`:

In `en`, **remove** these two lines:
```js
'nav.achievements': 'Achievements',
'nav.medals': 'Medals',
```
(Keep `'nav.profile': 'Profile',` — it's the hub label.)

**Add** directly below `'nav.profile':`:
```js
'profile.me': 'Profile',
'profile.achievements': 'Achievements',
'profile.medals': 'Medals',
```

In `es`, **remove** these two lines:
```js
'nav.achievements': 'Logros',
'nav.medals': 'Medallas',
```

**Add**:
```js
'profile.me': 'Perfil',
'profile.achievements': 'Logros',
'profile.medals': 'Medallas',
```

- [ ] **Step 5.4: Update Layout.jsx sidebar for Profile**

Edit `frontend/src/components/Layout.jsx`:

In `lotrNavItems`, **remove** these two entries:
```jsx
{ to: '/achievements', icon: NavHand, labelKey: 'nav.achievements' },
{ to: '/medals',       icon: Trophy,  labelKey: 'nav.medals' },
```
Keep the existing `{ to: '/profile', icon: UserIcon, labelKey: 'nav.profile' }` entry exactly as is — the hub entry stays at `/profile` and still uses the same label key. Move it into the position where Achievements/Medals/Profile used to cluster (group it with the social-ish items near the bottom of the sidebar).

In `neutralNavItems`, **remove** these two entries:
```jsx
{ to: '/achievements', icon: Award,   labelKey: 'nav.achievements' },
{ to: '/medals',       icon: Trophy,  labelKey: 'nav.medals' },
```
Keep `{ to: '/profile', icon: UserIcon, labelKey: 'nav.profile' }` — again no change needed besides positioning.

Clean up unused `lucide-react` imports (`Award`, `Trophy` if no longer referenced) and unused `LotrIcons` imports (`NavHand`).

- [ ] **Step 5.5: Manual verification**

Run dev servers. Verify:
- Sidebar now shows a single Profile entry instead of three. Clicking Profile lands on `/profile/me`.
- Sub-tab strip shows Profile, Achievements, Medals; each switches content and URL.
- Manually visit `/achievements` — redirects to `/profile/achievements`. Same for `/medals`.
- Manually visit `/profile?userId=1` — redirects to `/users/1`.
- Visit `/profile` with no query param — redirects to `/profile/me` and shows your profile.

- [ ] **Step 5.6: Run lint, tests, and build**

```bash
cd frontend && npm run lint && npm test -- --run && npm run build
```
Expected: all green.

- [ ] **Step 5.7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/hubs/ProfileHub.jsx \
        frontend/src/i18n.js frontend/src/components/Layout.jsx
git commit -m "feat: consolidate Profile/Achievements/Medals into /profile hub"
```

---

## Task 6: Build Social hub

**Files:**
- Create: `frontend/src/pages/hubs/SocialHub.jsx`
- Modify: `frontend/src/App.jsx` (nest routes under `/social`, add redirects)
- Modify: `frontend/src/i18n.js` (add social sub-tab keys, both locales)
- Modify: `frontend/src/components/Layout.jsx` (replace 2 nav entries with 1)

- [ ] **Step 6.1: Create SocialHub.jsx**

Create `frontend/src/pages/hubs/SocialHub.jsx`:

```jsx
import HubLayout from '../../components/HubLayout';

const TABS = [
  { to: 'friends', labelKey: 'social.friends' },
  { to: 'chat',    labelKey: 'social.chat' },
];

export default function SocialHub() {
  return <HubLayout tabs={TABS} />;
}
```

- [ ] **Step 6.2: Restructure Social routes in App.jsx**

Edit `frontend/src/App.jsx`:

Add import: `import SocialHub from './pages/hubs/SocialHub';`

**Remove** these existing routes from the protected block:
```jsx
<Route path="/friends" element={<Friends />} />
<Route path="/chat" element={<Chat />} />
```

**Add** the hub and redirects:
```jsx
<Route path="/social" element={<SocialHub />}>
  <Route index element={<Navigate to="friends" replace />} />
  <Route path="friends" element={<Friends />} />
  <Route path="chat"    element={<Chat />} />
</Route>
<Route path="/friends" element={<Navigate to="/social/friends" replace />} />
<Route path="/chat"    element={<Navigate to="/social/chat"    replace />} />
```

- [ ] **Step 6.3: Add social i18n keys**

Edit `frontend/src/i18n.js`:

In `en`, **remove** these two lines:
```js
'nav.friends': 'Friends',
'nav.chat': 'Chat',
```

**Add** in their place:
```js
'nav.social': 'Social',
'social.friends': 'Friends',
'social.chat': 'Chat',
```

In `es`, **remove** these two lines:
```js
'nav.friends': 'Amigos',
'nav.chat': 'Chat',
```

**Add**:
```js
'nav.social': 'Social',
'social.friends': 'Amigos',
'social.chat': 'Chat',
```

- [ ] **Step 6.4: Update Layout.jsx sidebar for Social**

Edit `frontend/src/components/Layout.jsx`:

In `lotrNavItems`, **remove** these two entries:
```jsx
{ to: '/friends', icon: Users,         labelKey: 'nav.friends' },
{ to: '/chat',    icon: MessageCircle, labelKey: 'nav.chat' },
```

**Replace** with:
```jsx
{ to: '/social', icon: Users, labelKey: 'nav.social' },
```

In `neutralNavItems`, **remove** these two entries:
```jsx
{ to: '/friends', icon: Users,         labelKey: 'nav.friends' },
{ to: '/chat',    icon: MessageCircle, labelKey: 'nav.chat' },
```

**Replace** with:
```jsx
{ to: '/social', icon: Users, labelKey: 'nav.social' },
```

Remove the `MessageCircle` import from the `lucide-react` import line if it's no longer used.

- [ ] **Step 6.5: Verify sidebar has exactly 9 items**

Visually inspect both `lotrNavItems` and `neutralNavItems` in Layout.jsx. Each should contain exactly 9 entries in this order (top to bottom) — as built:

1. `/` (Dashboard)
2. `/tracker`
3. `/log`
4. `/stats`
5. `/program`
6. `/cardio`
7. `/social`
8. `/profile`
9. `/settings`

If the count differs, reconcile against this list.

- [ ] **Step 6.6: Manual verification**

Run dev servers. Verify:
- Sidebar shows exactly 9 entries.
- Clicking Social lands on `/social/friends`. Tab strip switches to Chat.
- `/friends` and `/chat` redirect to their hub sub-paths.
- Toggle LOTR/neutral theme via `data-realm` — both sidebars show the 9 items.
- Toggle language `en` → `es` — all hub + sub-tab labels translate.

- [ ] **Step 6.7: Run lint, tests, and build**

```bash
cd frontend && npm run lint && npm test -- --run && npm run build
```
Expected: all green.

- [ ] **Step 6.8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/hubs/SocialHub.jsx \
        frontend/src/i18n.js frontend/src/components/Layout.jsx
git commit -m "feat: consolidate Friends/Chat into /social hub"
```

---

## Task 7: Final cleanup and full QA

**Files:**
- Modify: `frontend/src/components/Layout.jsx` (final unused-import sweep)
- Modify: `frontend/src/pages/Dashboard.jsx` (internal link paths if any)
- Modify: `CLAUDE.md` (document the new route layout in the Pages/Routes section)

- [ ] **Step 7.1: Sweep unused imports in Layout.jsx**

Run:
```bash
cd frontend && npm run lint 2>&1 | grep -i "Layout\|no-unused"
```
Remove any imports flagged as unused. Also eyeball the `lucide-react` and `./LotrIcons` import lines in `Layout.jsx` — any name not referenced in either `lotrNavItems` or `neutralNavItems` should be deleted.

- [ ] **Step 7.2: Update internal links in Dashboard.jsx**

Run:
```bash
grep -n "/progress\|/analytics\|/history\|/achievements\|/medals\|/friends\|/chat" frontend/src/pages/Dashboard.jsx
```
For each hit that is a `<Link to=…>` or `navigate(…)` call, update to the new path (e.g. `/progress` → `/stats/progress`). Old paths would still redirect, but updating avoids an extra navigation hop and keeps the code honest.

Also run the same grep across the rest of `frontend/src/pages` and `frontend/src/components`:
```bash
grep -rn "to=\"/progress\"\|to=\"/analytics\"\|to=\"/history\"\|to=\"/achievements\"\|to=\"/medals\"\|to=\"/friends\"\|to=\"/chat\"" frontend/src
```
Update each occurrence to its new path.

- [ ] **Step 7.3: Update CLAUDE.md**

Edit `/mnt/c/users/danie/downloads/gym tracker/CLAUDE.md`:

In the "Pages / Routes" section, rewrite the table to reflect the new 9-item navigation (plus hub sub-routes) and remove the `/recovery` row. Specifically:
- Delete the `/recovery` row.
- Delete the `/progress`, `/analytics`, `/history` rows; replace with a single row:
  `| /stats, /stats/{progress,analytics,history} | Stats hub | Per-exercise e1RM, volume/tonnage/DOTS/spider, session chronicle |`
- Delete the `/achievements`, `/medals` rows; replace with:
  `| /profile, /profile/{me,achievements,medals} | Profile hub | BodyMap + PRs; Hall of Heroes; medal catalog |`
- Delete the `/friends`, `/chat` rows; replace with:
  `| /social, /social/{friends,chat} | Social hub | Friend management + global chat |`
- Replace the `/profile?userId=N` row with `/users/:id`.

- [ ] **Step 7.4: Full regression pass**

```bash
cd frontend && npm run lint && npm test -- --run && npm run build
cd ../backend && python -m pytest -q
```
Expected: lint clean, frontend tests pass, build succeeds, backend tests pass (minus the pre-existing `test_log_bulk_relog_replaces` failure documented in CLAUDE.md).

- [ ] **Step 7.5: Manual QA checklist**

Run the full dev environment and verify each item. Check off every box:

- [ ] Sidebar shows 9 items in both LOTR and neutral themes.
- [ ] Mobile hamburger menu shows 9 items; sub-tab strips scroll horizontally on narrow widths.
- [ ] Each hub lands on its default sub-tab when clicked in the sidebar.
- [ ] Browser back button correctly navigates between sub-tabs of the same hub.
- [ ] Every old path redirects: `/progress`, `/analytics`, `/history`, `/achievements`, `/medals`, `/friends`, `/chat`, `/profile?userId=N`.
- [ ] Friend link from Friends page navigates to `/users/:id` and renders correctly.
- [ ] Dashboard no longer shows the Recovery notice banner.
- [ ] `/recovery` gives a 404 (it's gone — no redirect).
- [ ] Language toggle en/es translates all hub + sub-tab labels.
- [ ] Realm toggle (LOTR mode) re-themes the sub-tab pill highlight correctly.

- [ ] **Step 7.6: Commit**

```bash
git add frontend/src/components/Layout.jsx frontend/src/pages/Dashboard.jsx CLAUDE.md \
        frontend/src/pages frontend/src/components
git commit -m "chore: clean up unused imports + update internal links + docs for nav consolidation"
```

---

## Rollout notes

- Single branch, single PR. No feature flag needed.
- Fly.io backend deploys are **manual** — after this merges to `master`, the user must run:
  ```
  cd backend && flyctl deploy --app gym-tracker-api-bold-violet-7582
  ```
  This is because the backend `analytics.py` and `dashboard.py` changes need to land in production before the frontend Dashboard stops expecting `recovery_flag` in the response payload. Vercel auto-deploys the frontend on push.
- Leave the `<Navigate>` redirect stubs in place for at least one release cycle (roughly 1–2 weeks in practice) before considering removal. They cost nothing to keep.

## Out of scope (do not change in this plan)

- Bottom tab bar on mobile.
- Backend `analytics/recovery.py` module (internal callers in `deload.py` and leaderboard summary still use it).
- Content of Log, Tracker, Program, Cardio, Dashboard, Settings pages.
- Any changes to chart styling, copy, or data shapes within a sub-tab page.

---

## Post-implementation manual QA checklist

Run through these manually in a browser after deploying. Each item is independent — tick off as you go.

- [ ] Sidebar shows exactly 9 items (Dashboard, Tracker, Log, Stats, Program, Cardio, Social, Profile, Settings) in both LOTR and neutral themes.
- [ ] Mobile hamburger menu shows all 9 items; opening and closing it works correctly on a narrow viewport.
- [ ] Sub-tab strips on each hub scroll horizontally on narrow widths (no wrapping or overflow clipping).
- [ ] Clicking Stats in the sidebar lands on `/stats/progress` (default sub-tab active).
- [ ] Clicking Profile in the sidebar lands on `/profile/me` (default sub-tab active).
- [ ] Clicking Social in the sidebar lands on `/social/friends` (default sub-tab active).
- [ ] Browser back button navigates between sub-tabs within the same hub correctly.
- [ ] Old paths redirect as expected:
  - `/progress` → `/stats/progress`
  - `/analytics` → `/stats/analytics`
  - `/history` → `/stats/history`
  - `/achievements` → `/profile/achievements`
  - `/medals` → `/profile/medals`
  - `/friends` → `/social/friends`
  - `/chat` → `/social/chat`
  - `/profile?userId=N` → `/users/N`
- [ ] `/recovery` returns a 404 or "not found" state (no redirect — route was deleted).
- [ ] Friend link from the Friends tab navigates to `/users/:id` (not `/profile?userId=`).
- [ ] Dashboard medal showcase "All" link goes to `/profile/medals` (not `/medals`).
- [ ] Dashboard recent PRs "View all" link goes to `/profile/achievements` (not `/achievements`).
- [ ] Profile hub trophy case "View all" link goes to `/profile/medals` (not `/medals`).
- [ ] Dashboard no longer shows any Recovery notice/warning banner.
- [ ] Language toggle en → es translates sidebar labels AND hub sub-tab labels.
- [ ] Language toggle es → en switches back correctly.
- [ ] Realm toggle (LOTR mode) applies the realm accent color to the active sub-tab pill.
- [ ] Realm cycle button still works in LOTR mode (Gondor → Rohan → Rivendell → Mordor → Shire → Gondor).
