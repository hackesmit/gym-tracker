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
