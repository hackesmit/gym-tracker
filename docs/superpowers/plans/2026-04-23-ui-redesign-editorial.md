# UI Redesign — Editorial Theme System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the gym-tracker theme system from 4 minimal accent presets to 13, strip LOTR mode of gradients/glows while keeping its 5 palettes + heraldic identity, add a tier-colored drop-shadow behind each rank badge, and add a new "Rank standards" reference section to the Profile page.

**Architecture:** Replace the 4 hand-typed `[data-theme]` CSS blocks with a JS-driven preset array (`frontend/src/theme/presets.js`) that writes exactly 4 CSS variables on `<html>` when the theme changes. All other accent-derived variables are computed once via CSS `color-mix`. LOTR mode keeps its 5 `[data-realm]` surface-palette blocks, but the decorative layer (gradients/glows/shadows) is removed. A new `GET /api/ranks/standards` endpoint serves the 7-tier × 6-group standards from `muscle_rank_config.py` to an expandable card on the Profile page.

**Tech Stack:** React 18 + Vite + Tailwind CSS v4 (with `@theme` block driving CSS custom properties), FastAPI + pytest on the backend.

**Design spec:** `docs/superpowers/specs/2026-04-23-ui-redesign-editorial-design.md`

---

## Task 1: Backend — `GET /api/ranks/standards` endpoint (TDD)

**Files:**
- Modify: `backend/app/routers/ranks.py` (add route)
- Modify: `backend/tests/test_ranks.py` (add 3 tests)

- [ ] **Step 1: Write the failing tests**

Open `backend/tests/conftest.py` first to confirm the test-client fixture name (most likely `client`) — match whatever name the other tests in `test_ranks.py` already depend on. `get_current_user` is overridden there, so the test client can hit authenticated routes without explicit headers.

Append to `backend/tests/test_ranks.py` (the imports for `MUSCLE_RANK_THRESHOLDS`, `RANK_ORDER`, `SUBDIVISION_COUNT`, `MVP_GROUPS` already exist at the top of the file):

```python
def test_standards_returns_all_mvp_groups(db, client):
    """GET /api/ranks/standards returns all 6 MVP groups with metric + thresholds."""
    response = client.get("/api/ranks/standards")
    assert response.status_code == 200
    body = response.json()
    group_keys = {g["key"] for g in body["groups"]}
    assert group_keys == set(MVP_GROUPS)
    for g in body["groups"]:
        assert g.get("label")
        assert g.get("metric")
        assert isinstance(g.get("qualifying_exercises"), list)
        assert isinstance(g.get("thresholds"), dict)


def test_standards_tier_order_matches_rank_order(db, client):
    """Tiers are returned in ascending Copper→Champion order with subdivision count."""
    body = client.get("/api/ranks/standards").json()
    assert body["tiers"] == RANK_ORDER
    assert body["subdivisions_per_tier"] == SUBDIVISION_COUNT


def test_standards_chest_thresholds_match_config(db, client):
    """Chest thresholds in the payload match the config file byte-for-byte."""
    body = client.get("/api/ranks/standards").json()
    chest = next(g for g in body["groups"] if g["key"] == "chest")
    assert chest["thresholds"] == MUSCLE_RANK_THRESHOLDS["chest"]["thresholds"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_ranks.py -k standards -v`
Expected: 3 tests FAIL with 404 "Not Found" (endpoint doesn't exist yet).

- [ ] **Step 3: Implement the endpoint**

In `backend/app/routers/ranks.py`, extend the existing `from ..muscle_rank_config import (...)` block to add three names: `EXERCISE_MAP`, `RANK_ORDER`, `SUBDIVISION_COUNT`. (`MVP_GROUPS` and `MUSCLE_RANK_THRESHOLDS` are already imported.)

Then, above the first route (`@router.get("")`), add:

```python
_GROUP_LABELS = {
    "chest": "Chest",
    "back": "Back",
    "shoulders": "Shoulders",
    "quads": "Quads",
    "hamstrings": "Hamstrings",
    "arms": "Arms",
}

_METRIC_HUMAN = {
    "bench_press_1rm_over_bodyweight":       "Barbell bench 1RM ÷ bodyweight",
    "back_squat_1rm_over_bodyweight":        "Back squat 1RM ÷ bodyweight",
    "deadlift_1rm_over_bodyweight":          "Deadlift 1RM ÷ bodyweight",
    "overhead_press_1rm_over_bodyweight":    "Strict press 1RM ÷ bodyweight",
    "weighted_pullup_added_over_bodyweight": "Weighted pull-up added load ÷ bodyweight",
    "weighted_dip_added_over_bodyweight":    "Weighted dip added load ÷ bodyweight",
}


@router.get("/standards")
def standards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the full rank-standards reference for the profile page."""
    groups = []
    for key in MVP_GROUPS:
        cfg = MUSCLE_RANK_THRESHOLDS.get(key, {})
        metric_key = cfg.get("metric") or ""
        groups.append({
            "key": key,
            "label": _GROUP_LABELS.get(key, key.title()),
            "metric": _METRIC_HUMAN.get(metric_key, metric_key),
            "qualifying_exercises": sorted(EXERCISE_MAP.get(key, {}).keys()),
            "thresholds": cfg.get("thresholds", {}),
        })
    return {
        "tiers": list(RANK_ORDER),
        "subdivisions_per_tier": SUBDIVISION_COUNT,
        "groups": groups,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_ranks.py -k standards -v`
Expected: 3 tests PASS.

- [ ] **Step 5: Run the full rank test suite to make sure nothing regressed**

Run: `cd backend && pytest tests/test_ranks.py -v`
Expected: all tests PASS (including the 3 new ones, plus the existing 6).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/ranks.py backend/tests/test_ranks.py
git commit -m "feat(ranks): add GET /api/ranks/standards reference endpoint"
```

---

## Task 2: Frontend — theme presets module + `hexToRgba` helper (TDD)

**Files:**
- Create: `frontend/src/theme/presets.js`
- Create: `frontend/src/theme/__tests__/presets.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/theme/__tests__/presets.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MINIMAL_PRESETS, hexToRgba, getPreset } from '../presets';

describe('MINIMAL_PRESETS', () => {
  it('contains exactly 13 presets in the documented order', () => {
    expect(MINIMAL_PRESETS).toHaveLength(13);
    expect(MINIMAL_PRESETS.map((p) => p.key)).toEqual([
      'lime', 'amber', 'cyan', 'crimson', 'ember', 'saffron', 'mint',
      'teal', 'sky', 'indigo', 'magenta', 'rose', 'ivory',
    ]);
  });

  it('every preset has a key, name, accent hex, and ink color', () => {
    for (const p of MINIMAL_PRESETS) {
      expect(p.key).toMatch(/^[a-z]+$/);
      expect(p.name).toBeTruthy();
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(['#000', '#fff']).toContain(p.ink);
    }
  });

  it('first preset is lime (default)', () => {
    expect(MINIMAL_PRESETS[0].key).toBe('lime');
  });
});

describe('hexToRgba', () => {
  it('converts 6-digit hex to rgba with the given alpha', () => {
    expect(hexToRgba('#d4ff4a', 0.07)).toBe('rgba(212, 255, 74, 0.07)');
  });

  it('is case-insensitive', () => {
    expect(hexToRgba('#FF4A5A', 0.2)).toBe('rgba(255, 74, 90, 0.2)');
  });

  it('accepts 3-digit shorthand', () => {
    expect(hexToRgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('throws on invalid input', () => {
    expect(() => hexToRgba('notahex', 0.5)).toThrow();
  });
});

describe('getPreset', () => {
  it('returns the preset matching the key', () => {
    expect(getPreset('crimson').accent).toBe('#ff4a5a');
  });

  it('falls back to lime for unknown keys', () => {
    expect(getPreset('notapreset').key).toBe('lime');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/theme/__tests__/presets.test.js`
Expected: tests FAIL with "Cannot find module '../presets'".

- [ ] **Step 3: Implement the presets module**

Create `frontend/src/theme/presets.js`:

```js
/**
 * MINIMAL_PRESETS — the accent presets for minimal (editorial) mode.
 *
 * To add a new preset: append one entry to the array below. Nothing else
 * changes — `AppContext.setThemeColor` reads this array, writes the four
 * `--color-accent*` CSS variables on <html>, and the rest of the UI picks
 * up the change via CSS `color-mix` derivations in `:root` (see index.css).
 *
 * `ink` is the text color that sits on accent fills (buttons, active
 * checkboxes). Pick whichever of '#000' or '#fff' hits WCAG AA contrast on
 * the accent — roughly: light accents (#d4ff4a, #f5b544, #4aff9e) use '#000',
 * saturated mid-dark accents (#ff4a5a, #8b7cff, #ff4ac4) use '#fff'.
 */
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
  { key: 'ivory',   name: 'Ivory',   accent: '#e8e4d8', ink: '#000' }, // monochrome
];

export const THEME_KEYS = MINIMAL_PRESETS.map((p) => p.key);

/**
 * Convert "#d4ff4a" (or "#fff") into "rgba(212, 255, 74, alpha)".
 */
export function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string') throw new Error(`hexToRgba: expected string, got ${typeof hex}`);
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`hexToRgba: invalid hex "${hex}"`);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Look up a preset by key, falling back to lime (the default).
 */
export function getPreset(key) {
  return MINIMAL_PRESETS.find((p) => p.key === key) || MINIMAL_PRESETS[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/theme/__tests__/presets.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/theme/presets.js frontend/src/theme/__tests__/presets.test.js
git commit -m "feat(theme): add MINIMAL_PRESETS array + hexToRgba helper"
```

---

## Task 3: Frontend — rewrite `index.css` theme layer

**Files:**
- Modify: `frontend/src/index.css`

This task does the CSS side of the architecture switch:
1. Delete the 4 hand-typed `[data-theme="lime|amber|cyan|crimson"]` blocks (JS writes those vars now)
2. Add `color-mix` derivations in `:root` so `--color-accent-light`, `--color-accent-dark`, `--color-primary*` all derive from the single `--color-accent`
3. Strip LOTR decoration (shadows, gradients) from panel variants and nav, keep surface/accent palettes per realm

- [ ] **Step 1: Replace the `:root` block**

Find the existing block starting with `:root { --color-accent-tint: ...` (around line 85) and replace it with:

```css
:root {
  /* JS writes --color-accent, --color-accent-ink, --color-accent-tint, --color-accent-border.
     Everything else derives from --color-accent via color-mix. */
  --color-accent-tint:   rgba(212, 255, 74, 0.07);
  --color-accent-border: rgba(212, 255, 74, 0.20);
  --color-accent-light:  color-mix(in srgb, var(--color-accent) 85%, white 15%);
  --color-accent-dark:   color-mix(in srgb, var(--color-accent) 85%, black 15%);
  --color-primary:       var(--color-accent);
  --color-primary-light: var(--color-accent-light);
  --color-primary-dark:  var(--color-accent-dark);
  --border-dashed:       rgba(255, 255, 255, 0.08);
}
```

- [ ] **Step 2: Delete the 4 hand-typed minimal-preset blocks**

Find and delete these four blocks entirely (around lines 95–135):
```css
[data-theme="lime"]    { ... }
[data-theme="amber"]   { ... }
[data-theme="cyan"]    { ... }
[data-theme="crimson"] { ... }
```

These are replaced by JS-driven writes in Task 4.

- [ ] **Step 3: Strip LOTR decorative shadows**

Inside each of the 5 realm blocks (`[data-realm="gondor"]`, `rohan`, `rivendell`, `mordor`, `shire`), change both:

```css
  --shadow-glow: 0 0 20px rgba(..., 0.08);
  --shadow-panel: 0 2px 12px rgba(0, 0, 0, 0.3);
```

to:

```css
  --shadow-glow: none;
  --shadow-panel: none;
```

Do this for all 5 realm blocks. Keep everything else (surface palette, accent, text, etc.) unchanged.

- [ ] **Step 4: Flatten LOTR panel variants**

Find the block starting with `/* LOTR: restore decorative panel treatments */` (around line 390) and replace the entire set of `[data-realm] .stone-panel`, `.parchment-panel`, `.forged-panel`, `.heraldic-card`, `.rivendell-card`, `.chronicle-card` rules with a single comment:

```css
/* LOTR mode — editorial: panel variants inherit the flat base styles from
   `.stone-panel` etc. defined above. No gradients, no glows, no insets.
   Realms are distinguished purely by their surface + accent palettes. */
```

Keep `.timer-card` unchanged (hero card — spec allows its gradient in both modes).

- [ ] **Step 5: Strip decorative ornament rules**

Remove the `[data-realm] .engraved-border` rule (the one with `box-shadow: inset 0 0 0 1px color-mix(...)`). Keep the base `.engraved-border { border: 1px solid var(--color-surface-lighter); border-radius: 14px; }`.

Remove the three `[data-realm] .tier-silver`, `.tier-gold`, `.tier-elite` rules (the ones with `box-shadow` glows and gradients). Keep the base `.tier-*` rules that set colors.

Remove the `[data-realm] .nav-gondor` linear-gradient rule. Keep the base `.nav-gondor` (flat surface).

In `.btn-gold:hover`, delete the `[data-realm] .btn-gold:hover { box-shadow: ... }` rule that adds a glow.

In `.lotr-nav-icon`, change the hover state from:
```css
a:hover .lotr-nav-icon,
.nav-active .lotr-nav-icon {
  opacity: 1;
  filter: grayscale(0%) drop-shadow(0 0 4px color-mix(...));
}
```
to:
```css
a:hover .lotr-nav-icon,
.nav-active .lotr-nav-icon {
  opacity: 1;
  filter: grayscale(0%);
}
```

- [ ] **Step 6: Update the theme-mode comment block at the top of the file**

Replace the documentation comment at the top of `index.css` (lines 3–31) with:

```css
/* ============================================================
   GYM TRACKER — THEME TOKENS
   ------------------------------------------------------------
   Two modes live side-by-side:

     1. MINIMAL MODE (default)
        Editorial, dark, serif-led. 13 accent presets defined in
        `src/theme/presets.js`. Only `--color-accent` and
        `--color-accent-ink` are written by JS; tint/border/light/dark
        derive automatically via color-mix in `:root`.

     2. LOTR MODE (opt-in, editorial)
        Same flat editorial surfaces as minimal. Five Middle-earth
        realms differ only in surface + accent palette:
          - gondor, rohan, rivendell, mordor, shire
        No gradients, no glows, no decorative shadows. Heraldic
        icons and Cinzel display font are the visual identity.

   Mode is applied via html[data-mode="minimal"|"lotr"].
   Within minimal mode, html[data-theme="<preset>"] picks the accent.
   Within LOTR mode, html[data-realm="<realm>"] picks the palette.

   TO ADD A NEW MINIMAL PRESET (e.g. "violet"):
     1. Append one entry to MINIMAL_PRESETS in src/theme/presets.js.
     2. Add 'settings.themeColor.violet' i18n entries (en + es).
     That's it — no CSS edit required.
   ============================================================ */
```

- [ ] **Step 7: Visual smoke test**

Start the dev server (`cd frontend && npm run dev`), open the app, confirm:
- The page still loads without visual regressions on the default lime theme
- Switching mode toggle to LOTR no longer shows gradient/glow panels
- The timer card on Logger retains its gradient (the only hero exception)

Report any issues; do not proceed until the page renders.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/index.css
git commit -m "refactor(theme): consolidate accent derivations to color-mix; strip LOTR decoration"
```

---

## Task 4: Frontend — wire AppContext to presets module

**Files:**
- Modify: `frontend/src/context/AppContext.jsx`

- [ ] **Step 1: Update imports and THEME_COLORS**

At the top of `AppContext.jsx`, add:

```js
import { MINIMAL_PRESETS, THEME_KEYS, hexToRgba, getPreset } from '../theme/presets';
```

Find the line `const THEME_COLORS = ['lime', 'amber', 'cyan', 'crimson'];` and replace with:

```js
const THEME_COLORS = THEME_KEYS;
```

- [ ] **Step 2: Add a helper that writes the 4 accent variables on `<html>`**

Inside the component body, above `applyTheme`, add:

```js
const writeAccentVars = (presetKey) => {
  const preset = getPreset(presetKey);
  const html = document.documentElement;
  html.style.setProperty('--color-accent',        preset.accent);
  html.style.setProperty('--color-accent-ink',    preset.ink === '#fff' ? '#ffffff' : '#000000');
  html.style.setProperty('--color-accent-tint',   hexToRgba(preset.accent, 0.07));
  html.style.setProperty('--color-accent-border', hexToRgba(preset.accent, 0.20));
};
```

- [ ] **Step 3: Update `applyTheme` to call `writeAccentVars` when in minimal mode**

Replace the existing `applyTheme` function with:

```js
const applyTheme = (mode, r, color) => {
  const html = document.documentElement;
  html.setAttribute('data-mode', mode === 'lotr' ? 'lotr' : 'minimal');
  if (mode === 'lotr') {
    html.removeAttribute('data-theme');
    html.setAttribute('data-realm', r);
    // Clear any previously-written inline accent vars so realm CSS takes over
    html.style.removeProperty('--color-accent');
    html.style.removeProperty('--color-accent-ink');
    html.style.removeProperty('--color-accent-tint');
    html.style.removeProperty('--color-accent-border');
  } else {
    html.removeAttribute('data-realm');
    html.setAttribute('data-theme', color);
    writeAccentVars(color);
  }
};
```

- [ ] **Step 4: Verify in the browser**

Start dev server, open the app. In DevTools console, run:

```js
document.documentElement.style.getPropertyValue('--color-accent')
```

Expected: `"#d4ff4a"` (lime default). Switch to another theme in Settings → the value updates to that preset's hex.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/AppContext.jsx
git commit -m "feat(theme): drive minimal-mode accent vars from presets.js at runtime"
```

---

## Task 5: Frontend — update Settings swatch picker for 13 presets

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`
- Modify: `frontend/src/index.css` (swatch sizing)

- [ ] **Step 1: Replace `THEME_COLOR_INFO` with a preset-sourced list**

In `Settings.jsx`, remove:

```js
const THEME_COLOR_INFO = [
  { key: 'lime',    hex: '#d4ff4a' },
  { key: 'amber',   hex: '#f5b544' },
  { key: 'cyan',    hex: '#4ad4ff' },
  { key: 'crimson', hex: '#ff4a5a' },
];
```

Add at the top of the file (with the other imports):

```js
import { MINIMAL_PRESETS } from '../theme/presets';
```

Then replace `THEME_COLOR_INFO.map(...)` inside the theme-color card with `MINIMAL_PRESETS.map((preset) => { const { key, accent } = preset; ... })`.

Concretely, replace the existing theme-color card body:

```jsx
<div className="flex gap-4 items-center">
  {THEME_COLOR_INFO.map(({ key, hex }) => (
    <button
      key={key}
      onClick={() => setThemeColor(key)}
      data-active={themeColor === key}
      aria-label={t(`settings.themeColor.${key}`)}
      title={t(`settings.themeColor.${key}`)}
      className="theme-swatch touch-manipulation"
      style={{ background: hex }}
    />
  ))}
  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
    {t(`settings.themeColor.${themeColor}`)}
  </span>
</div>
```

with:

```jsx
<div className="flex flex-wrap gap-2 items-center">
  {MINIMAL_PRESETS.map(({ key, accent }) => (
    <button
      key={key}
      type="button"
      onClick={() => setThemeColor(key)}
      data-active={themeColor === key}
      aria-label={t(`settings.themeColor.${key}`)}
      title={t(`settings.themeColor.${key}`)}
      className="theme-swatch-tap touch-manipulation"
    >
      <span className="theme-swatch-dot" style={{ background: accent }} />
    </button>
  ))}
  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
    {t(`settings.themeColor.${themeColor}`)}
  </span>
</div>
```

- [ ] **Step 2: Update swatch CSS for 28px dot inside 40px tap target**

In `frontend/src/index.css`, find the existing `.theme-swatch` rule block (around line 640) and replace it with:

```css
/* ============================================================
   THEME SWATCH PICKER
   28px visible circle inside a 40px transparent tap target
   ============================================================ */
.theme-swatch-tap {
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: transform 150ms ease;
}
.theme-swatch-tap:hover .theme-swatch-dot {
  transform: scale(1.08);
}
.theme-swatch-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: block;
  border: 1px solid var(--color-surface-lighter);
  transition: transform 150ms ease, box-shadow 150ms ease;
}
.theme-swatch-tap[data-active="true"] .theme-swatch-dot {
  box-shadow:
    0 0 0 2px var(--color-surface-dark),
    0 0 0 4px var(--color-accent);
}
```

Delete the old `.theme-swatch` rule entirely — no components still reference it after Task 5 Step 1.

- [ ] **Step 3: Convert the realm picker to the same wrap-row swatch style**

In the same file (`Settings.jsx`), find the realm card body (around line 241, starting `<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">`). Inspect the current structure — if it's a larger grid of labeled tiles, leave it alone (the realm switcher often needs labels for recognition). If it's a simple swatch grid, convert it to use `.theme-swatch-tap` + `.theme-swatch-dot` like the minimal picker for visual consistency.

Only convert the realm picker if it's currently a simple color grid. If it has realm-name labels beside each swatch, preserve that layout but apply `.theme-swatch-tap` + `.theme-swatch-dot` to each color dot and keep the label text to the right of each one. Example if converting:

```jsx
<div className="flex flex-wrap gap-3 items-center">
  {REALMS.map((r) => {
    const accent = REALM_ACCENTS[r]; // define a small { gondor: '#c9a84c', ... } map above
    return (
      <button
        key={r}
        type="button"
        onClick={() => setRealm(r)}
        data-active={realm === r}
        aria-label={t(`settings.realm.${r}`) || r}
        title={t(`settings.realm.${r}`) || r}
        className="theme-swatch-tap touch-manipulation"
      >
        <span className="theme-swatch-dot" style={{ background: accent }} />
      </button>
    );
  })}
</div>
```

Add `REALM_ACCENTS` at the top of the file near `MINIMAL_PRESETS`:

```js
const REALM_ACCENTS = {
  gondor:    '#c9a84c',
  rohan:     '#d4a843',
  rivendell: '#5ba3a0',
  mordor:    '#c44a2b',
  shire:     '#6d9b4a',
};
```

Whether to convert the realm picker is a judgment call — preserve current UX if the grid-with-labels layout is recognized as the realm chooser. Minimum change: leave realm picker alone if uncertain; the minimal picker refresh is the must-do.

- [ ] **Step 4: Visual smoke test**

Start the dev server. In Settings, confirm:
- Minimal-mode "Accent color" card shows 13 swatches in a wrap row, tap targets are comfortable
- The active swatch has a visible 2px ring in the current accent color
- Clicking each swatch updates the active-state indicator and changes the app accent immediately
- Name caption next to the row updates

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Settings.jsx frontend/src/index.css
git commit -m "feat(settings): 13-preset wrap-row swatch picker with 28px dots"
```

---

## Task 6: Frontend — add i18n entries for the 9 new preset names

**Files:**
- Modify: `frontend/src/i18n.js`

- [ ] **Step 1: Add English translations**

In `frontend/src/i18n.js`, find the English block containing `'settings.themeColor.lime': 'Lime'` (around line 345). After `'settings.themeColor.crimson': 'Crimson',` insert:

```js
    'settings.themeColor.ember':   'Ember',
    'settings.themeColor.saffron': 'Saffron',
    'settings.themeColor.mint':    'Mint',
    'settings.themeColor.teal':    'Teal',
    'settings.themeColor.sky':     'Sky',
    'settings.themeColor.indigo':  'Indigo',
    'settings.themeColor.magenta': 'Magenta',
    'settings.themeColor.rose':    'Rose',
    'settings.themeColor.ivory':   'Ivory',
```

- [ ] **Step 2: Add Spanish translations**

In the same file, find the Spanish block (`'settings.themeColor.lime': 'Lima'`, around line 732). After `'settings.themeColor.crimson': 'Carmesí',` insert:

```js
    'settings.themeColor.ember':   'Brasa',
    'settings.themeColor.saffron': 'Azafrán',
    'settings.themeColor.mint':    'Menta',
    'settings.themeColor.teal':    'Verde azulado',
    'settings.themeColor.sky':     'Cielo',
    'settings.themeColor.indigo':  'Índigo',
    'settings.themeColor.magenta': 'Magenta',
    'settings.themeColor.rose':    'Rosa',
    'settings.themeColor.ivory':   'Marfil',
```

- [ ] **Step 3: Verify in the browser**

Start dev server. Open Settings. Hover each swatch → tooltip shows the English name. Switch language to Spanish in Settings → tooltips show Spanish names.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n.js
git commit -m "i18n: add preset names for ember/saffron/mint/teal/sky/indigo/magenta/rose/ivory (en+es)"
```

---

## Task 7: Frontend — tokenize BodyMap surface hexes + remove Emerald

**Files:**
- Modify: `frontend/src/components/BodyMap.jsx`

- [ ] **Step 1: Remove the Emerald entry and tokenize surface colors**

Near the top of `BodyMap.jsx`, replace:

```js
const RANK_COLORS = {
  Copper:    '#a97142',
  Bronze:    '#cd7f32',
  Silver:    '#c0c0c0',
  Gold:      '#d4af37',
  Platinum:  '#8abfd1',
  Emerald:   '#50c878',
  Diamond:   '#b9f2ff',
  Champion:  '#ff4d4d',
};
const NEUTRAL = '#3a3a3a';
const STROKE = '#0a0a0a';
```

with:

```js
const RANK_COLORS = {
  Copper:    '#a97142',
  Bronze:    '#cd7f32',
  Silver:    '#c0c0c0',
  Gold:      '#d4af37',
  Platinum:  '#8abfd1',
  Diamond:   '#b9f2ff',
  Champion:  '#ff4d4d',
};
// Surface tokens — follow the active theme's dark palette so the silhouette
// reads the same on lime as it does on, say, a rivendell-teal realm.
const NEUTRAL = 'var(--color-surface-lighter)';
const STROKE  = 'var(--color-surface-dark)';
const HEAD_FILL = 'var(--color-surface-light)';
```

- [ ] **Step 2: Replace remaining inline `#2a2a2a` hex fills with the HEAD_FILL token**

In the JSX below, replace every `fill="#2a2a2a"` (there are ~6 occurrences) with `fill={HEAD_FILL}`.

Search-and-replace pattern:
- Find: `fill="#2a2a2a"`
- Replace: `fill={HEAD_FILL}`

- [ ] **Step 3: Verify no hex literals remain in the anatomy paths**

Run:
```bash
grep -nE '#[0-9a-fA-F]{3,6}' frontend/src/components/BodyMap.jsx | grep -v RANK_COLORS
```
Expected: no output. If any show up, convert them to one of the three tokens (`NEUTRAL`, `STROKE`, `HEAD_FILL`) by contextual judgment.

- [ ] **Step 4: Visual smoke test**

Start dev server, open `/profile/me` (or wherever BodyMap renders). Confirm the body silhouette is visible and readable on both lime (default) and another theme like crimson. Switch to LOTR mode → confirm the silhouette adapts to the realm's darks.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BodyMap.jsx
git commit -m "refactor(body-map): token-drive surface colors; remove stale Emerald entry"
```

---

## Task 8: Frontend — tier-colored drop-shadow behind RankBadge

**Files:**
- Modify: `frontend/src/components/RankBadge.jsx`

- [ ] **Step 1: Add a GLOW map and apply `filter: drop-shadow` to the SVG wrapper**

At the top of `RankBadge.jsx`, after the `MATERIALS` map, add:

```js
// Tier-colored halo — the one carve-out from the "no glows" rule. Rank tier
// is a meaningful moment (spec: "loud only on meaningful moments"). Applied
// in both minimal and LOTR modes.
const TIER_GLOW = {
  Copper:   '#7a3d1e',
  Bronze:   '#8a5a2b',
  Silver:   '#8a92a0',
  Gold:     '#a78025',
  Platinum: '#3a6bb8',
  Diamond:  '#7a4ac8',
  Champion: '#ff4fa8',
};
```

- [ ] **Step 2: Apply the drop-shadow on the SVG output**

Find the main component export (`export default function RankBadge(...)`). At the line where the SVG is rendered (look for `<svg ... >`), wrap or style the SVG so it gets a tier-colored drop-shadow.

If the current render returns `<svg ...>...</svg>` directly, change it to:

```jsx
const glow = TIER_GLOW[rank] || TIER_GLOW.Copper;
// 35% alpha expressed as hex suffix — browsers accept `<color>XX` 8-char form
const filterStyle = {
  filter: `drop-shadow(0 0 10px ${glow}59)`, // 0x59 ≈ 35% alpha
};
return (
  <svg
    ...existing props...
    style={{ ...existingStyle, ...filterStyle }}
  >
    ...existing content...
  </svg>
);
```

If the component already has a `style` prop on the svg, merge `filter: drop-shadow(...)` into it. If no style prop exists, add one with just the filter.

Exact diff — find the opening `<svg` tag in the render and add a `style={{ filter: \`drop-shadow(0 0 10px ${TIER_GLOW[rank] || TIER_GLOW.Copper}59)\` }}` prop to it.

- [ ] **Step 3: Visual smoke test**

Start dev server, open `/profile/me`. Confirm:
- Each `RankCard` shows a faint halo behind its badge in the tier's color (reddish for Copper/Bronze, bluish for Platinum, purple for Diamond, pink for Champion)
- Glow is static — no pulsing
- Toggle mode to LOTR → glow persists in the same colors (content-bound)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RankBadge.jsx
git commit -m "feat(rank-badge): tier-colored drop-shadow halo (static, all modes)"
```

---

## Task 9: Backend API client + Rank standards component

**Files:**
- Modify: `frontend/src/api/client.js`
- Create: `frontend/src/components/RankStandards.jsx`

- [ ] **Step 1: Add the API call**

In `frontend/src/api/client.js`, find the existing rank API line:

```js
export const getRanks = (userId) => request(`/ranks${userId ? `?user_id=${userId}` : ''}`);
export const compareRanks = (userId) => request(`/ranks/compare/${userId}`);
```

After it, append:

```js
export const getRankStandards = () => request('/ranks/standards');
```

- [ ] **Step 2: Create the RankStandards component**

Create `frontend/src/components/RankStandards.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { getRankStandards } from '../api/client';
import { useT } from '../i18n';

/**
 * RankStandards — expandable reference showing the 7-tier ladder for each
 * muscle group. Fetched from GET /api/ranks/standards on first expand.
 *
 * Props:
 *   currentRanks  array of the user's current { muscle_group, rank } entries
 *                 (used to highlight the row they're currently on)
 */
export default function RankStandards({ currentRanks = [] }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const currentTierByGroup = Object.fromEntries(
    currentRanks.map((r) => [r.muscle_group, r.rank])
  );

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !data && !loading) {
      setLoading(true);
      try {
        const payload = await getRankStandards();
        setData(payload);
      } catch (ex) {
        setErr(ex?.message || 'Failed to load rank standards.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="btn-ghost-dashed w-full text-left flex items-center justify-between py-3 px-4"
        aria-expanded={expanded}
      >
        <span>{t('profile.rankStandards.title') || 'Rank standards'}</span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {loading && <p className="text-sm text-text-muted">{t('common.loading') || 'Loading…'}</p>}
          {err && <p className="text-sm text-danger">{err}</p>}
          {data && data.groups.map((g) => (
            <div key={g.key} className="stone-panel p-4">
              <p className="text-base font-semibold">{g.label}</p>
              <p className="mono-label mt-1">{g.metric}</p>

              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-sm">
                {data.tiers.map((tier) => {
                  const threshold = g.thresholds[tier];
                  const isCurrent = currentTierByGroup[g.key] === tier;
                  return (
                    <li
                      key={tier}
                      className={`flex items-center justify-between py-1 ${isCurrent ? 'text-accent font-semibold' : ''}`}
                    >
                      <span>{tier}</span>
                      <span className="font-mono text-xs text-text-muted">
                        {tier === 'Copper' ? '—' : (threshold != null ? `≥ ${threshold.toFixed(2)}` : '—')}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-3 mono-label opacity-60">
                {t('profile.rankStandards.subdivisions') ||
                  `Each non-Champion tier is subdivided into 5 equal slots (V → I). Champion is a single elite tier.`}
              </p>

              {g.qualifying_exercises?.length > 0 && (
                <details className="mt-3">
                  <summary className="mono-label cursor-pointer">
                    {t('profile.rankStandards.qualifying') || 'Qualifying exercises'}
                  </summary>
                  <p className="text-xs text-text-muted mt-2 leading-relaxed">
                    {g.qualifying_exercises.join(' · ')}
                  </p>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the i18n strings**

In `frontend/src/i18n.js`, English block add:

```js
    'profile.rankStandards.title':         'Rank standards',
    'profile.rankStandards.subdivisions':  'Each non-Champion tier is subdivided into 5 equal slots (V → I). Champion is a single elite tier.',
    'profile.rankStandards.qualifying':    'Qualifying exercises',
    'common.loading':                      'Loading…',
```

Spanish block:

```js
    'profile.rankStandards.title':         'Estándares de rango',
    'profile.rankStandards.subdivisions':  'Cada rango no-Campeón se subdivide en 5 niveles iguales (V → I). Campeón es un único rango de élite.',
    'profile.rankStandards.qualifying':    'Ejercicios válidos',
    'common.loading':                      'Cargando…',
```

If `common.loading` already exists in i18n.js, skip that line in both blocks.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.js frontend/src/components/RankStandards.jsx frontend/src/i18n.js
git commit -m "feat(profile): RankStandards component + /ranks/standards API client"
```

---

## Task 10: Wire RankStandards into the Profile page

**Files:**
- Modify: `frontend/src/pages/Profile.jsx`

- [ ] **Step 1: Import and render the component**

In `frontend/src/pages/Profile.jsx`, add the import at the top alongside other component imports:

```js
import RankStandards from '../components/RankStandards';
```

Find the end of the "Muscle rank grid" `<Card>` (around line 183, just before `<Card title="Training calendar">`). Insert a new card:

```jsx
      {/* Rank standards reference — expandable */}
      <Card>
        <RankStandards currentRanks={groups} />
      </Card>
```

- [ ] **Step 2: Visual smoke test**

Start dev server, open `/profile/me`. Confirm:
- A "+ Rank standards" button appears below the Muscle ranks grid
- Clicking it expands into 6 sub-cards (one per muscle group)
- Each sub-card shows: group name, metric, tier ladder with thresholds, subdivision footnote, qualifying exercises (collapsible)
- Rows for the user's current tier are highlighted (accent color + bold)
- Switch mode to LOTR → the component visually adapts (flat surfaces, accent changes)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Profile.jsx
git commit -m "feat(profile): render RankStandards expandable card below muscle ranks"
```

---

## Task 11: Documentation — update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the rank engine tier list**

In `CLAUDE.md`, find the line:

```
- Tiers: `Copper → Bronze → Silver → Gold → Platinum → Emerald → Diamond → Champion`
```

Replace with:

```
- Tiers: `Copper → Bronze → Silver → Gold → Platinum → Diamond → Champion` (7 tiers; Emerald was dropped on 2026-04-22 to match the badge system)
- Each non-Champion tier subdivides into 5 equal slots (V → I). Champion is a single elite rank.
```

- [ ] **Step 2: Update the theme system section**

Find the "LOTR Theme System" section header. Above it, insert a new section or update the existing mention of theme presets:

```markdown
## Editorial Theme System (2026-04-23)
The frontend ships two coexisting modes, defaulting to minimal.

**Minimal mode (default):** 13 accent presets in `frontend/src/theme/presets.js`
— lime (default), amber, cyan, crimson, ember, saffron, mint, teal, sky,
indigo, magenta, rose, ivory. JS writes 4 CSS variables on `<html>`; all
other accent derivatives (`--color-accent-light`, `--color-accent-dark`,
`--color-primary*`) are computed via CSS `color-mix` in `:root`.

**LOTR mode (opt-in, editorial):** 5 realms — gondor, rohan, rivendell,
mordor, shire — each with a unique surface + accent palette. Flat visuals
(no gradients, no glows); heraldic icons + Cinzel display font + mode-
conditional copy swaps ("Today's Quest", "Hall of Heroes") are the visual
identity.

Adding a 14th minimal preset = one array entry in `presets.js` + 2 i18n
strings in `i18n.js` (en + es). No CSS edits required.
```

If a theme-related section already exists, update it rather than duplicating.

- [ ] **Step 3: Add the `/api/ranks/standards` endpoint to the API surface list**

If CLAUDE.md lists rank endpoints, append:

```
- `GET  /api/ranks/standards` — 7-tier × 6-group reference payload sourced from `muscle_rank_config.py`
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update rank tier list (drop Emerald) + editorial theme system notes"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run the backend test suite**

Run: `cd backend && pytest -q`
Expected: all previously-passing tests still pass, plus 3 new tests (`test_standards_*`). Pre-existing unrelated failure (`test_log_bulk_relog_replaces`) per CLAUDE.md may still fail — not introduced by this plan.

- [ ] **Step 2: Run the frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all existing tests pass, plus new ones for `presets.js`.

- [ ] **Step 3: Full manual smoke test in the browser**

Run `cd frontend && npm run dev` and walk through:

1. Default load → lime accent, editorial dark UI
2. Settings → cycle through all 13 minimal presets → accent updates live, active swatch has 2px ring
3. Switch mode toggle to LOTR → realm picker visible, cycle through 5 realms → surface palette changes, no gradients/glows
4. Profile page → BodyMap visible, rank cards show halos in tier colors
5. Profile page → click "+ Rank standards" → 6 sub-cards expand, current tier highlighted
6. Logger page → timer card still shows gradient (the allowed hero exception)
7. Switch language to Spanish → all 13 preset names show Spanish labels

- [ ] **Step 4: Token-audit regression check**

Run:
```bash
cd frontend/src && grep -rEn '#[0-9a-fA-F]{3,6}' --include='*.jsx' --include='*.js' \
  | grep -vE '(test-setup|__tests__|i18n\.js|theme/presets\.js|//|\*)' \
  | grep -vE '(RankBadge|MedalBadge|BodyMap)\.jsx'
```
Expected: **no output** — no component outside the 3 illustration components contains a hardcoded hex.

- [ ] **Step 5: If the verification reveals any issues, fix and commit**

Do not mark this task complete until all the above succeed.

---

## Out of scope (do not implement)

- Any change to the rank engine computation or thresholds
- Any change to LOTR copy/icon swaps or heraldic iconography
- Navigation changes (sidebar, routing)
- MedalBadge internal visuals
- Backfill / migration of stored theme preferences (existing `gym-tracker-theme` values — lime, amber, cyan, crimson — are already valid in the new list)
- Any preset beyond the 13 listed
