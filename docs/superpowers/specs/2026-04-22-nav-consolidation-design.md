# Navigation consolidation — design spec

**Date:** 2026-04-22
**Status:** Approved, ready for implementation plan

## Problem

The sidebar has 15 items (Dashboard, Tracker, Log, Progress, Analytics, Recovery, History, Program, Achievements, Cardio, Friends, Medals, Chat, Profile, Settings). Two concrete pains:

- **Cognitive overload.** Related destinations sit far apart. "PR history" could plausibly live under Progress, Achievements, or History; "trophies" under Achievements or Medals; "other users" under Friends, Chat, Profile, or Compare. Users hunt.
- **Visual length.** 15 items make the desktop sidebar feel long and the mobile hamburger menu cramped.

Out of scope: redesigning the individual pages' content, or adding a bottom tab bar on mobile.

## Goal

Reduce the sidebar to 9 top-level items by grouping redundant destinations into three hubs, while keeping daily-use tabs (Log, Tracker, Cardio) one click away.

## Final navigation

```
Dashboard       /
Log             /log
Tracker         /tracker
Program         /program
Cardio          /cardio
Stats           /stats      →  Progress · Analytics · History
Profile         /profile    →  Profile · Achievements · Medals
Social          /social     →  Friends · Chat
Settings        /settings
```

Recovery is removed entirely from the UI.

## Architecture

### Hub URLs — nested routes with redirects

Each hub is a parent route with children:

- `/stats` renders the hub shell with a sub-tab strip and an `<Outlet />`. Index route redirects to `/stats/progress`. Children: `/stats/progress`, `/stats/analytics`, `/stats/history`.
- `/profile` → index redirects to `/profile/me`. Children: `/profile/me`, `/profile/achievements`, `/profile/medals`.
- `/social` → index redirects to `/social/friends`. Children: `/social/friends`, `/social/chat`.

Chosen over query-param (`?tab=...`) or local `useState` because:

- Back button navigates between sub-tabs.
- Sub-tabs are bookmarkable and shareable.
- Dashboard's existing in-app deep links (e.g. "see all PRs") remain valid after redirects are added.

### Old-path redirects

Every removed top-level route gets a `<Navigate replace>` stub for 1–2 releases:

- `/progress` → `/stats/progress`
- `/analytics` → `/stats/analytics`
- `/history` → `/stats/history`
- `/achievements` → `/profile/achievements`
- `/medals` → `/profile/medals`
- `/friends` → `/social/friends`
- `/chat` → `/social/chat`
- `/profile?userId=N` → `/users/N` (see friend-profile split below)

No redirect for `/recovery` — Recovery is deleted outright.

### Hub component

New `frontend/src/components/HubLayout.jsx` (~60 lines). Accepts a `tabs` prop like:

```jsx
[
  { to: 'progress',   labelKey: 'stats.progress' },
  { to: 'analytics',  labelKey: 'stats.analytics' },
  { to: 'history',    labelKey: 'stats.history' },
]
```

Renders:

1. Realm-themed `PageHeader` (already exists in `RealmBorder.jsx`).
2. Horizontal sub-tab strip that reuses the existing `nav-active` pill styling for visual consistency with the sidebar. `overflow-x-auto` so narrow mobile screens scroll rather than wrap.
3. `<Outlet />` for the active child route.

The three hub page files (`StatsHub.jsx`, `ProfileHub.jsx`, `SocialHub.jsx`) are thin wrappers that declare their `tabs` array and render `<HubLayout>`.

### Friend profile split

Current Profile page handles both self and friend view via `/profile?userId=N`. A sub-tabbed Profile hub doesn't make sense for a friend (they don't have your achievements to browse).

Friend profile moves to a dedicated route: `/users/:id`. A redirect from `/profile?userId=N` to `/users/:id` preserves existing bookmarks and in-app links. Internal implementation can reuse the existing friend-view code — just lifted out of the shared Profile component and mounted at the new route.

## File-level changes

### New files

- `frontend/src/components/HubLayout.jsx` — shared hub chrome.
- `frontend/src/pages/hubs/StatsHub.jsx` — declares `[Progress, Analytics, History]`, default Progress.
- `frontend/src/pages/hubs/ProfileHub.jsx` — declares `[Profile, Achievements, Medals]`, default Profile.
- `frontend/src/pages/hubs/SocialHub.jsx` — declares `[Friends, Chat]`, default Friends.
- A route file (or inline in `App.jsx`) for `/users/:id` that renders the friend-view portion of current Profile.

### Modified files

**Routing + nav:**

- `frontend/src/App.jsx` — replace flat routes for Progress/Analytics/History/Achievements/Medals/Friends/Chat/Recovery with nested hub routes and `<Navigate>` stubs from old paths. Add `/users/:id`. Remove `/recovery`.
- `frontend/src/components/Layout.jsx` — cut `lotrNavItems` and `neutralNavItems` from 15 entries to 9. Pick icons for the three hubs (suggest: BarChart3 / UserIcon / Users for neutral; NavEye / UserProfile crest / Horn for LOTR — open to bikeshedding during implementation). Drop any imports that become unused.
- `frontend/src/i18n.js` — add keys `nav.stats`, `nav.social`, and sub-tab labels (`stats.progress`, `stats.analytics`, `stats.history`, `profile.me`, `profile.achievements`, `profile.medals`, `social.friends`, `social.chat`) in both `en` and `es`. Remove `nav.recovery` (both locales).

**Content pages — strip outer header only:**

- `Progress.jsx`, `Analytics.jsx`, `History.jsx`, `Achievements.jsx`, `Medals.jsx`, `Friends.jsx`, `Chat.jsx`, `Profile.jsx` — remove each page's outer `PageHeader`; the hub now owns the title. Business logic, data fetching, layout, and tests untouched.

**Recovery removal (frontend):**

- Delete `frontend/src/pages/Recovery.jsx`.
- Delete the `/recovery` route in `App.jsx`.
- Delete Recovery entries from both nav arrays in `Layout.jsx`. Remove the `Lembas` / `Leaf` icon imports if they become unused.
- Delete `nav.recovery` keys in `i18n.js`.
- Delete `getRecovery()` from `api/client.js`.
- Delete the "Recovery notice" banner in `Dashboard.jsx` (currently lines ~234–241) and the `data?.recovery_flag` consumer.

**Recovery removal (backend, conservative):**

- Delete the `GET /api/analytics/recovery` endpoint handler in `backend/app/routers/analytics.py`.
- Delete the `recovery_flag` computation and response field in `backend/app/routers/dashboard.py`.
- **Keep** `backend/app/analytics/recovery.py` and `backend/app/analytics/deload.py`. `get_recovery_status()` is consumed internally by deload recommendations and the leaderboard summary endpoint. Removing it is out of scope; revisit as a separate decision if desired.

## Testing

- **Vitest smoke tests**, one per hub: route renders, sub-tab strip lists the expected tabs, default sub-route renders.
- **Redirect tests**: navigating to each old path lands on the new path. Cover `/progress`, `/achievements`, `/friends`, `/chat`, `/medals`, `/history`, `/analytics`, `/profile?userId=N`.
- **Pre-existing page-level tests** (Progress, Analytics, History, Achievements, Medals, Friends, Chat, Profile) must stay green; only the outer header changes.
- **Manual pass**: mobile hamburger menu at 9 items, each realm theme renders the sub-tab strip legibly, active sub-tab highlight works.

## Rollout

- Single PR. No feature flag — the redirects cover bookmarks and in-app links.
- Keep the `<Navigate>` redirect stubs for at least one deploy cycle before any future removal.

## Non-goals

- Bottom tab bar on mobile.
- Changes to the internal content of any page beyond removing its outer `PageHeader`.
- Backend `analytics/recovery.py` module removal.
- Changes to Log, Tracker, Program, Cardio, Dashboard, or Settings pages.
- i18n architecture changes — only key additions/removals.
