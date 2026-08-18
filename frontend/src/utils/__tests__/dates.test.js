import { describe, it, expect } from 'vitest';
import { todayLocalISO } from '../dates';

describe('todayLocalISO', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 23:30 local on 2026-08-17 (whatever the zone) must read as 08-17
    const d = new Date(2026, 7, 17, 23, 30, 0);
    expect(todayLocalISO(d)).toBe('2026-08-17');
    const early = new Date(2026, 0, 1, 0, 5, 0);
    expect(todayLocalISO(early)).toBe('2026-01-01');
  });
});
