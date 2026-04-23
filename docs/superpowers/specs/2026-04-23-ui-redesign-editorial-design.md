# UI Redesign — Editorial Theme System

**Date:** 2026-04-23
**Status:** Design — awaiting implementation plan
**Scope:** Frontend-only visual refresh + two small additions (rank badge glow, rank standards reference section). No changes to app logic, routing, copy, or data models.

---

## Summary

Expand the existing two-mode theme system (`minimal` / `lotr`) to deliver the editorial, dark, serif-led design language defined in the external style spec. Most of the foundation already exists — this is an expansion + targeted audit, not a rebuild.

### Deliverables

1. **13 minimal-mode accent presets** (up from 4), driven by a single JS array + hex→rgba helper
2. **LOTR mode visual simplification** — strip glows/gradients, keep 5 unique palettes + heraldic identity
3. **Rank badge tier-colored glow** — subtle `drop-shadow` behind each RankBadge in all modes
4. **Rank standards reference** — expandable section on the Profile page showing the 7-tier ladder + qualifying exercises, backed by a new `GET /api/ranks/standards` endpoint
5. **Swatch picker refresh** — 28px visible circles (40px tap target), 8px gap, wrap row, 2px ring on active
6. **`BodyMap.jsx` cleanup** — replace 3 hardcoded surface hexes with tokens; remove stale Emerald tier entry

---

## Context: What's already in place

Before listing changes, what already exists and does **not** change:

- **Tailwind v4 with `@theme` block** driving CSS custom properties — this is the token system the spec calls for
- **Two-mode architecture** via `data-mode="minimal|lotr"` on `<html>`, accent pick via `data-theme`, realm pick via `data-realm`
- **All required fonts loaded** in `index.html` (Fraunces, Inter Tight, JetBrains Mono, Cinzel)
- **Component utility classes** — `stone-panel`, `btn-primary-cta`, `btn-ghost-dashed`, `mono-label`, `section-label`, `serif-display`, `row-divider-top`, `theme-swatch` — all implemented in `index.css`
- **localStorage key `gym-tracker-theme`** — already aligned with spec
- **Wisdom quote + JourneyProgress (Road to Ringbearer)** — already render in both modes
- **Mode-dependent copy/icon swaps** — ("Today's Quest" vs "Today's Workout", Torch vs Flame, etc.) — preserved unchanged

---

## 1. Theme token architecture

### Single source of truth: `frontend/src/theme/presets.js` (new file)

```js
// MINIMAL_PRESETS — to add a new preset, append one entry. Nothing else changes.
// accentInk is the text color that sits on accent fills — pick whichever hits WCAG AA.
export const MINIMAL_PRESETS = [
  { key: 'lime',    name: 'Lime',    accent: '#d4ff4a', ink: '#000' }, // default
  { key: 'amber',   name: 'Amber',   accent: '#f5b544', ink: '#000' },
  { key: 'cyan',    name: 'Cyan',    accent: '#4ad4ff', ink: '#000' },
  { key: 'crimson', name: 'Crimson', accent: '#ff4a5a', ink: '#fff' },
  { key: 'ember',   name: 'Ember',   accent: '#ff6a1a', ink: '#000' },
  { key: 'saffron', name: 'Saffron', accent: '#ffb300', ink: '#000' },
  { key: 'mint',    name: 'Mint',    accent: '#4aff9e', ink: '#000' },
  { key: 'teal',    name: 'Teal',    accent: '#2dd4bf', ink: '#000' },
  { key: 'sky',     name: 'Sky',     accent: '#7cc4ff', ink: '#000' },
  { key: 'indigo',  name: 'Indigo',  accent: '#8b7cff', ink: '#fff' },
  { key: 'magenta', name: 'Magenta', accent: '#ff4ac4', ink: '#fff' },
  { key: 'rose',    name: 'Rose',    accent: '#ff8fa3', ink: '#000' },
  { key: 'ivory',   name: 'Ivory',   accent: '#e8e4d8', ink: '#000' },
];

// hex like "#d4ff4a" → "rgba(212, 255, 74, 0.07)"
export function hexToRgba(hex, alpha) { /* standard impl */ }
```

### Apply strategy

- The four existing hand-typed `[data-theme="lime|amber|cyan|crimson"] { ... }` CSS blocks in `index.css` are **removed**.
- `AppContext.setThemeColor()` looks up the preset by key and writes exactly **4 variables** on `document.documentElement`:
  - `--color-accent` ← `preset.accent`
  - `--color-accent-ink` ← `preset.ink`
  - `--color-accent-tint` ← `hexToRgba(preset.accent, 0.07)`
  - `--color-accent-border` ← `hexToRgba(preset.accent, 0.20)`
- All other accent-derived variables are computed in CSS once in `:root`, never touched by JS:
  ```css
  :root {
    --color-accent-light: color-mix(in srgb, var(--color-accent) 85%, white 15%);
    --color-accent-dark:  color-mix(in srgb, var(--color-accent) 85%, black 15%);
    --color-primary:       var(--color-accent);
    --color-primary-light: var(--color-accent-light);
    --color-primary-dark:  var(--color-accent-dark);
  }
  ```
  This also removes the need to hand-tune light/dark variants per preset — they derive automatically.
- `data-theme="<key>"` is still set on `<html>` for selector-based hooks and devtools inspection.
- Transition rule already covers color changes: `[data-theme], [data-realm] { transition: background-color 200ms, color 200ms, border-color 200ms }`.

### Defaults / persistence

- First-run default: `minimal` mode, `lime` preset.
- `localStorage` keys unchanged: `gym-tracker-theme`, `gym-theme-mode`, `gym-realm`.
- Invalid stored values fall back to defaults (already enforced).

### LOTR mode untouched by the preset architecture

The 5 realms are full surface-palette overrides (different darks, different text colors, different accent-ink pairings). They keep their `[data-realm="gondor|rohan|rivendell|mordor|shire"] { ... }` CSS blocks — they're not the same shape as minimal presets and don't share the helper.

---

## 2. LOTR mode — strip decoration, keep identity

LOTR stays **opt-in**. What changes inside `[data-realm]` selectors in `index.css`:

### Strip (the "gamer aesthetics" the spec calls out)

| Selector | Current | New |
|---|---|---|
| `[data-realm]` base | `--shadow-glow` set per realm | `--shadow-glow: none` everywhere |
| `[data-realm] .parchment-panel` | Linear gradient + inset shadow | Flat `--color-surface` + 1px `--color-surface-lighter` border |
| `[data-realm] .forged-panel` | Gradient + dwarven inset | Flat surface, keep left-accent utility option |
| `[data-realm] .heraldic-card` | Accent halo shadow | Flat; keep top-trim option |
| `[data-realm] .rivendell-card` | Gradient to rivendell tint | Flat |
| `[data-realm] .chronicle-card` | Gradient + accent top border | Flat; keep accent-top utility only if explicitly applied |
| `[data-realm] .engraved-border` | Accent inset `box-shadow` | Drop |
| `[data-realm] .tier-elite` | Glow + gradient | Drop |
| `[data-realm] .btn-gold:hover` | Accent glow | Drop |
| `a:hover .lotr-nav-icon` | `drop-shadow` on hover | Drop (opacity lift only) |
| `[data-realm] .nav-gondor` | Subtle vertical gradient | Flat |

### Keep (what makes LOTR still LOTR)

- 5 unique surface + accent palettes per realm — unchanged
- Cinzel display font inside `[data-realm]` — unchanged
- `LotrIcons.jsx` heraldic SVGs in nav + PR/streak swaps — unchanged
- Realm switcher in Settings + any realm cycle button in `Layout.jsx` — unchanged
- Mode-dependent copy swaps ("Today's Quest", "Hall of Heroes", "The Journey") — unchanged
- `.timer-card` gradient — kept in both modes (it's a hero card, spec explicitly allows `--bg-card-elevated` gradient on hero/timer cards)

### Cross-mode (always render, already in place, no change)

- Wisdom quote on Dashboard
- JourneyProgress / Road to Ringbearer widget on Dashboard + Achievements

---

## 3. Rank badge glow

A subtle tier-colored glow behind each `RankBadge` — the one carve-out from the spec's "no glows" rule, justified by the spec's "loud only on meaningful moments" clause. Rank tier is that moment.

### Implementation

- Applied as `filter: drop-shadow(0 0 10px <tier-base-hex> / 35%)` on the SVG wrapper inside `RankBadge.jsx`
- Follows the badge silhouette (cleaner than a square `box-shadow`)
- Tier → glow color pulled from each tier's existing `base` entry in `RankBadge.jsx`:

| Tier | Glow color (existing `base`) |
|---|---|
| Copper | `#7a3d1e` |
| Bronze | `#8a5a2b` |
| Silver | `#8a92a0` |
| Gold | `#a78025` |
| Platinum | `#3a6bb8` |
| Diamond | `#7a4ac8` |
| Champion | `#ff4fa8` (soft magenta from iridescent palette) |

- Static opacity (35%) — no pulsing / no animation
- Active in **both** minimal and LOTR modes (content-bound, not mode-bound)

Glow hex values live inside `RankBadge.jsx` next to the existing tier palettes — these are not theme tokens.

---

## 4. Rank standards reference section

A new expandable section on the Profile page (`/profile/me`) that shows the full rank ladder — so users can see what they're working toward without leaving the page that shows their current ranks.

### UI

- Added below the BodyMap on Profile, inside a standard `Card` with `section-label` "Rank standards" and a caret toggle
- Collapsed by default; expand state not persisted (simple local state)
- When expanded, renders one sub-card per muscle group (chest, back, shoulders, quads, hamstrings, arms). Each sub-card shows:
  - Muscle name (Inter Tight)
  - Metric description (e.g. "Barbell bench 1RM / bodyweight") in `mono-label`
  - Qualifying exercise list in body copy
  - Ladder table: `Tier | Min ratio` — rows for Copper → Champion, highlighting the user's current tier
  - Tier subdivisions (V–I) mentioned in a footnote per card — not tabulated row-by-row to keep the view scannable
- No sidebar entry, no new route

### Backend

New endpoint: `GET /api/ranks/standards`

```json
{
  "tiers": ["Copper", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion"],
  "subdivisions_per_tier": 5,
  "groups": [
    {
      "key": "chest",
      "label": "Chest",
      "metric": "Barbell bench 1RM ÷ bodyweight",
      "qualifying_exercises": ["Barbell Bench Press", "Paused Bench Press", "Close-Grip Bench Press"],
      "thresholds": { "Bronze": 0.50, "Silver": 0.75, "Gold": 1.00, "Platinum": 1.25, "Diamond": 1.75, "Champion": 2.00 }
    },
    // ... 5 more groups
  ]
}
```

- Data sourced from `backend/app/muscle_rank_config.py` — single source of truth preserved, no client-side duplication
- Read-only, no auth gate beyond standard JWT required (same as other `/api/ranks/*` routes)
- Lives in existing router: `backend/app/routers/ranks.py`
- Frontend API call added to `api/client.js`: `getRankStandards()`

---

## 5. Swatch picker UI

### Layout (inside existing Settings page)

- **Mode toggle** (Neutral / LOTR) — unchanged
- **When mode = Neutral (minimal):** "Theme color" card renders all 13 presets as circles in a wrap row
- **When mode = LOTR:** "Realm" card renders 5 realm swatches in a wrap row (current realm grid layout replaced with a circle row for consistency)
- Active preset name shown inline as a `mono-label` beside the row

### Circle styling

- Visible diameter: **28px**
- Gap between circles: **8px**
- Wrap: yes (`flex-wrap`)
- Tap target: **40px** — achieved by a 6px transparent padding wrapper around each 28px circle
- Active ring: `box-shadow: 0 0 0 2px var(--color-surface-dark), 0 0 0 4px var(--color-accent)` (2px offset ring in `--accent`)
- Each circle: `aria-label` + `title` set to the preset's display name (localized via `i18n.js`)
- Existing `.theme-swatch` class is replaced with a new sizing; no other class rename

### i18n

13 new `settings.themeColor.<key>` translation keys added to `i18n.js` (English + Spanish).

---

## 6. Component token audit

Grep of `frontend/src/**/*.{jsx,js}` found **95 hardcoded hex values**, distributed as follows:

| Location | Count | Purpose | Action |
|---|---|---|---|
| `components/RankBadge.jsx` | ~56 | Per-tier pixel-art palettes | **Leave** — content, fixed across themes |
| `components/MedalBadge.jsx` | ~22 | Steel/ribbon gradients + category colors | **Leave** — illustration |
| `components/BodyMap.jsx` rank colors | ~8 | Per-tier fill mapping | **Leave** — matches RankBadge identity |
| `components/BodyMap.jsx` anatomy strokes/fills | 3 (`#0a0a0a`, `#2a2a2a`, `#3a3a3a`) | Body outline | **Replace** with `var(--color-surface-dark/light/lighter)` tokens |
| `components/BodyMap.jsx` Emerald entry | 1 | Stale tier color | **Delete** — not part of the 7-tier engine |
| Anywhere else | **0** | — | — |

Outcome: the remainder of the UI is already fully token-driven via Tailwind utility classes that resolve to CSS custom properties. No other component files need edits for the token audit.

---

## 7. Files touched

### Frontend

**New:**
- `frontend/src/theme/presets.js` — preset array + `hexToRgba` helper + README-style comment at top

**Modified:**
- `frontend/src/index.css` — remove 4 hand-typed `[data-theme]` blocks; strip LOTR mode decoration (gradients, glows, shadows listed in §2); swatch-class sizing update
- `frontend/src/context/AppContext.jsx` — import `MINIMAL_PRESETS`; rewrite `setThemeColor` to write CSS vars from preset; replace `THEME_COLORS` hardcoded list
- `frontend/src/pages/Settings.jsx` — source `THEME_COLOR_INFO` from presets array; replace 4-swatch flex row with 13-swatch wrap row; replace realm grid with 5-swatch wrap row
- `frontend/src/pages/Profile.jsx` (or `ProfileHub` / current Profile sub-page — confirm in plan) — add "Rank standards" expandable card below BodyMap; fetch `/api/ranks/standards` on expand
- `frontend/src/components/RankBadge.jsx` — add tier-colored `filter: drop-shadow` on SVG wrapper
- `frontend/src/components/BodyMap.jsx` — replace 3 anatomy hexes with tokens; remove Emerald rank entry
- `frontend/src/api/client.js` — add `getRankStandards()`
- `frontend/src/i18n.js` — 13 new `settings.themeColor.<key>` entries (en + es); 1 new `profile.rankStandards.*` group (en + es)

### Backend

**Modified:**
- `backend/app/routers/ranks.py` — add `GET /standards` route returning the config payload defined in §4
- `backend/tests/test_ranks.py` — add 3 tests for the new endpoint: (a) returns all 6 muscle groups, (b) tier list is in correct Copper→Champion order, (c) at least one group's thresholds match `muscle_rank_config.py` byte-for-byte

---

## 8. Out of scope

- Any change to the muscle rank engine computation
- Any change to the LOTR mode's copy/icon swaps
- Any change to the Navigation / Sidebar structure
- Any change to MedalBadge visuals
- Any new preset beyond the 13 listed (adding a 14th later is a one-line change)
- Backfill or migration of existing users' stored `gym-tracker-theme` values (the 4 pre-existing keys — lime, amber, cyan, crimson — remain valid)

---

## 9. Acceptance criteria

1. All 13 minimal presets selectable from Settings; picking any one updates the entire UI within 200ms
2. Adding a 14th preset requires editing **only** `presets.js`
3. In LOTR mode (any realm), no page has glow shadows or gradient panels — except `.timer-card` and the explicitly accent-tinted `.btn-primary-cta`
4. Each RankBadge shows a visible, static tier-colored halo — same in minimal and LOTR
5. Profile page has a "Rank standards" card that, when expanded, displays 6 muscle groups × 7 tiers with thresholds from the backend
6. `GET /api/ranks/standards` returns 6 groups with correct thresholds matching `muscle_rank_config.py`
7. No component file in `frontend/src` references a hex string outside the three illustration SVGs (RankBadge, MedalBadge, BodyMap)
8. Existing tests (`backend/tests/*`, `frontend vitest`) still pass; 3 new backend tests cover the standards endpoint
9. CLAUDE.md's stale "`Copper → … → Emerald → Diamond → Champion`" note is updated to match the 7-tier reality
