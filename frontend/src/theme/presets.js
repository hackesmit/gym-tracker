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
