import { describe, it, expect } from 'vitest';
import { kgToDisplay, displayToKg, getUnitLabel } from '../units';

describe('kgToDisplay', () => {
  it('converts kg to lbs', () => {
    expect(kgToDisplay(100, 'lbs')).toBeCloseTo(220.5, 0);
  });

  it('returns kg unchanged', () => {
    expect(kgToDisplay(100, 'kg')).toBe(100);
  });

  it('snaps near-whole lbs values to absorb round-trip drift', () => {
    // 40.82 kg * 2.20462 = 89.9926 → within tolerance of 90
    expect(kgToDisplay(40.82, 'lbs')).toBe(90);
    // 65.77 kg * 2.20462 = 144.998 → within tolerance of 145
    expect(kgToDisplay(65.77, 'lbs')).toBe(145);
  });

  it('keeps one-decimal precision for legit fractional lbs', () => {
    // e1RM-like value that isn't near a 0.5-lb step stays precise
    const kg = 100.2 / 2.20462; // ~45.45 kg → 100.2 lbs exactly
    expect(kgToDisplay(kg, 'lbs')).toBeCloseTo(100.2, 1);
  });
});

describe('displayToKg', () => {
  it('converts lbs to kg', () => {
    const result = displayToKg(260, 'lbs');
    expect(result).toBeCloseTo(117.93, 1);
    expect(kgToDisplay(result, 'lbs')).toBe(260);
  });

  it('returns kg unchanged', () => {
    expect(displayToKg(100, 'kg')).toBe(100);
  });
});

describe('round-trip', () => {
  it('preserves common whole lbs values without drift', () => {
    for (const lb of [45, 65, 90, 95, 100, 135, 145, 185, 225, 275, 315, 405]) {
      expect(kgToDisplay(displayToKg(lb, 'lbs'), 'lbs')).toBe(lb);
    }
  });

  it('preserves 2.5-lb plate increments', () => {
    for (const lb of [2.5, 7.5, 12.5, 22.5, 47.5, 92.5, 187.5, 327.5]) {
      expect(kgToDisplay(displayToKg(lb, 'lbs'), 'lbs')).toBe(lb);
    }
  });
});

describe('getUnitLabel', () => {
  it('returns lbs for lbs', () => {
    expect(getUnitLabel('lbs')).toBe('lbs');
  });

  it('returns kg for kg', () => {
    expect(getUnitLabel('kg')).toBe('kg');
  });
});
