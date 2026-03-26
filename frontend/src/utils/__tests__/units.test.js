import { describe, it, expect } from 'vitest';
import { kgToDisplay, displayToKg, getUnitLabel } from '../units';

describe('kgToDisplay', () => {
  it('converts kg to lbs', () => {
    expect(kgToDisplay(100, 'lbs')).toBeCloseTo(220.5, 0);
  });

  it('returns kg unchanged', () => {
    expect(kgToDisplay(100, 'kg')).toBe(100);
  });
});

describe('displayToKg', () => {
  it('converts lbs to kg with .toFixed(2) precision', () => {
    const result = displayToKg(260, 'lbs');
    expect(result).toBeCloseTo(117.93, 1);
    expect(kgToDisplay(result, 'lbs')).toBeCloseTo(260, 0);
  });

  it('returns kg unchanged', () => {
    expect(displayToKg(100, 'kg')).toBe(100);
  });

  it('handles round weights without precision loss', () => {
    const kg = displayToKg(135, 'lbs');
    expect(kgToDisplay(kg, 'lbs')).toBeCloseTo(135, 0);
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
