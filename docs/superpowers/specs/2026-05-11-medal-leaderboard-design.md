# Medal Leaderboard — design spec

**Date:** 2026-05-11
**Status:** Approved (ready for implementation plan)

## Goal

For every medal, let the user open a leaderboard that shows every user with a
qualifying value for that metric, ranked. Today the Medals page only shows the
current holder. The leaderboard answers the user's question: *"I have the
Strongest Bench medal — how close are the others to taking it from me?"*

## Scope

- **In:** A new modal opened from the Medals page (and trophy-case tiles) that
  lists every user's current value for the medal's metric, sorted. Backed by a
  new endpoint. Reuses existing medal-engine categorization rules.
- **Out:** History/timeline of past holders. Per-user trend charts. Filtering
  by friends. Notifications. Schema changes.

## Product decisions

1. **Audience:** global — every user in the app.
2. **Entry point:** modal on click of any medal card.
3. **Row content:** username + value only. No rank number, gap-to-leader, or
   bars.
4. **Row count:** all users with a value (no pagination cap; current scale is
   single-digit users, scrollable).
5. **Users without a value:** omitted entirely — no "—" rows.

## API

One new endpoint, added to `backend/app/routers/medals.py`:

```
GET /api/medals/{medal_id}/leaderboard
```

Auth: `get_current_user` (same as the rest of `/api/medals`).

Response:

```json
{
  "medal": {
    "id": 3,
    "name": "Strongest Bench 1RM",
    "metric_type": "strength_1rm:bench",
    "unit": "kg",
    "higher_is_better": true,
    "category": "strength"
  },
  "entries": [
    {"user_id": 1, "username": "hackesmit", "value": 150.0, "achieved_at": "2026-05-08T19:24:00Z"},
    {"user_id": 4, "username": "ari",       "value": 142.5, "achieved_at": "2026-04-30T08:11:00Z"}
  ]
}
```

- Sort: by `value` respecting `higher_is_better` (descending for max-is-best,
  ascending for time-based metrics like Fastest Mile).
- Tie-break: earlier `achieved_at` wins ("first to reach it").
- `achieved_at` reflects the underlying log that produced the user's current
  value (or `User.manual_1rm[cat].tested_at` for manual entries). Not displayed
  in v1, but in the payload for future use.
- 404 if `medal_id` does not exist.

## Per-metric value computation

New module `backend/app/medal_leaderboards.py`. Single entry point:

```python
def leaderboard_for(db, metric_type: str) -> list[Entry]
```

where `Entry = (user_id, value, achieved_at)`. Internally dispatches by
`metric_type`. The medal engine's exercise→category mapping is imported from
`medal_engine.py` rather than duplicated, so the leader on the leaderboard
always agrees with `MedalCurrentHolder`.

### Strength (`strength_1rm:{bench,squat,deadlift,ohp}`)

For each user, take the max of:
- `User.manual_1rm[category].value_kg` (with `tested_at` as `achieved_at`), and
- the heaviest `load_kg` from `WorkoutLog` rows that satisfy the same gate
  `check_strength_medals` uses today:
  `is_true_1rm_attempt = True` AND `completed_successfully = True` AND
  `reps_completed = 1`, with the exercise's name matching
  `EXERCISE_TO_LIFT_CATEGORY[category]`.

This rule is deliberately identical to the engine's so that the top of
`leaderboard_for` equals `MedalCurrentHolder` for every strength medal
(enforced by Test #6).

In practice the Logger UI does not currently expose
`is_true_1rm_attempt`, so most strength values come from `manual_1rm`. That
sparseness is accepted — richer projections would diverge from the medal
holder and break the invariant.

### Strength derivatives

- `strength_pl_total` = sum of the user's bench + squat + deadlift values from
  the strength block above. User must have all three; otherwise omitted.
- `strength_relative` = (bench + squat + deadlift) / bodyweight. Requires
  bodyweight; otherwise omitted.

These both use the latest `achieved_at` across the contributing components.

### Cardio

- `cardio_fastest_mile`, `cardio_fastest_5k`, `cardio_fastest_10k` — min pace
  from `CardioLog`, filtered by the engine's distance buckets.
- `cardio_longest:{run,bike,swim}` — max distance from `CardioLog` filtered by
  `activity_type`.

### Consistency

- `consistency_longest_streak` — reuses the engine's streak computation per user.
- `consistency_sessions_30d` / `consistency_sessions_all` — `COUNT(SessionLog)`
  per user, with date filter for 30d.
- `consistency_volume_30d` — `SUM(coalesce(added_load_kg, load_kg) *
  reps_completed)` over the last 30 days, honoring the 2026-04-26 plate-only
  semantic for bodyweight-class lifts.
- `consistency_perfect_weeks` — reuses the engine's perfect-week logic per user.

### Performance

- `performance_1rm_increase_30d`, `performance_volume_increase_30d`,
  `performance_most_improved_pct`. These already have per-user computation
  inside `medal_engine.py`; refactor each into a small helper that takes
  `user_id` and call it in a loop. Performance metrics are the only ones whose
  cost scales linearly with user count — acceptable at our scale.

### Cross-cutting rules

- The `preset` synthetic user is excluded everywhere.
- Users with no qualifying data for the metric are omitted from the response.
- Orphaned values (user row gone) are dropped via `JOIN users`.

## Frontend

### Component

`frontend/src/components/MedalLeaderboardModal.jsx` — new.

- Triggered by clicking a `MedalCard` on `pages/Medals.jsx` and the trophy-case
  tiles in the same file.
- Cards become focusable (`<button>`-styled with cursor-pointer + focus ring).
- Layout:
  - **Header:** `MedalBadge` icon + name + category pill + short description
    ("King-of-the-hill — best across all users").
  - **Body:** scrollable list. Each row = `username` (left) + formatted value
    (right). Current user's row uses the existing accent treatment
    (`border-accent/40 bg-accent/5`, matching `MedalCard`).
  - **Empty state:** "No records yet. Log a qualifying lift to claim this medal."
  - **Loading:** `LoadingSpinner` while the fetch is in flight.
  - **Close:** backdrop click + Esc + ✕ button.
- Mobile: full-screen sheet on small viewports; max-width 32rem on desktop.

### API client

One new function in `frontend/src/api/client.js`:

```js
export async function getMedalLeaderboard(medalId) { ... }
```

### Formatting

Reuse `formatValue(value, unit, higherIsBetter)` and `displayUnit(unit)` from
`pages/Medals.jsx`. Extract to `frontend/src/utils/medalFormat.js` so the new
modal can import without circular dependencies.

### i18n

Two new strings in `frontend/src/i18n.js` (en + es):

- `medals.leaderboard.title`
- `medals.leaderboard.empty`

### Theming

No realm-specific work. The modal inherits surface/accent/border from the
active theme via CSS variables — both Minimal and LOTR realms style correctly
for free.

## Error handling & edge cases

- **API errors** (network, 500): toast "Failed to load leaderboard" + close
  modal.
- **Unknown medal_id:** backend returns 404; frontend shows the same toast.
- **Unknown metric_type** (defensive): `leaderboard_for` raises; router
  returns 500. Catalog is closed-set so this is unreachable in practice but
  won't silently return an empty list.
- **Ties:** earlier `achieved_at` wins.
- **User deleted between log time and modal open:** filtered out via
  `JOIN users`.
- **Missing bodyweight for `strength_relative`:** user omitted from that metric.
- **Manual 1RM with future `tested_at`:** treated like any other manual entry
  (existing behavior).
- **Preset user:** excluded at the SQL level in `leaderboard_for`.

## Testing

### Backend (`backend/tests/test_medal_leaderboard.py`)

1. **Strength leaderboard ordering** — 3 users, 3 different bench 1RMs; assert
   descending order and that a user with no bench is omitted.
2. **Manual 1RM is first-class** — user A has a logged 100kg bench, user B has
   a `manual_1rm` of 120kg with no logs; B ranks above A.
3. **Cardio time-based metric** — Fastest Mile sorts ascending; preset user
   excluded.
4. **Strength derivative gating** — `strength_pl_total` omits users missing
   any of bench/squat/deadlift; `strength_relative` omits users without
   bodyweight.
5. **404 on unknown medal_id.**
6. **Leader matches `MedalCurrentHolder`** — for each strength metric, assert
   the top of `leaderboard_for` equals the `MedalCurrentHolder` row. Key
   invariant: the leaderboard must agree with the medal it's attached to.

### Frontend

One Vitest test: mount `MedalLeaderboardModal` with a stub API response, assert
rows render in correct order and the current-user row is visually distinguished.

## Files changed

- `backend/app/medal_leaderboards.py` — new
- `backend/app/routers/medals.py` — add endpoint
- `backend/app/medal_engine.py` — refactor performance-metric computations into
  per-user helpers (minimal change; existing call sites preserved)
- `backend/tests/test_medal_leaderboard.py` — new
- `frontend/src/api/client.js` — add `getMedalLeaderboard`
- `frontend/src/components/MedalLeaderboardModal.jsx` — new
- `frontend/src/utils/medalFormat.js` — new (extracts `formatValue` /
  `displayUnit`)
- `frontend/src/pages/Medals.jsx` — wire up modal trigger; import formatters
  from new utils module
- `frontend/src/i18n.js` — two strings × two languages

## Out of scope (deferred)

- History of past holders.
- Per-user value-over-time charts.
- Friends-only / global toggle.
- Push or in-app notification when someone closes the gap.
- Caching layer (revisit if profiling shows the on-demand endpoint is slow).
