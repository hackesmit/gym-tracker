// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useWorkoutDraft from '../useWorkoutDraft';

const KEY = (programId, week, sessionName) =>
  `gym-pending-${programId}-${week}-${sessionName}`;

beforeEach(() => {
  localStorage.clear();
});

describe('useWorkoutDraft', () => {
  it('persists when any set has reps_completed > 0 (no load)', () => {
    const sets = [{ load_kg: 0, reps_completed: 15 }];
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets, saved: false, knownProgramIds: [1] })
    );
    const stored = JSON.parse(localStorage.getItem(KEY(1, 1, 'A')));
    expect(stored.sets).toHaveLength(1);
    expect(stored.sets[0].reps_completed).toBe(15);
  });

  it('persists when any set has load_kg > 0', () => {
    const sets = [{ load_kg: 100, reps_completed: 5 }];
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets, saved: false, knownProgramIds: [1] })
    );
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeTruthy();
  });

  it('does not persist when all sets are empty', () => {
    const sets = [{ load_kg: 0, reps_completed: 0 }];
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets, saved: false, knownProgramIds: [1] })
    );
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
  });

  it('returns null pendingRestore when no key exists', () => {
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    expect(result.current.pendingRestore).toBeNull();
  });

  it('returns pendingRestore from existing key', () => {
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 100, reps_completed: 5 }],
    }));
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    expect(result.current.pendingRestore).toBeTruthy();
    expect(result.current.pendingRestore.sets[0].load_kg).toBe(100);
  });

  it('expires keys older than 14 days', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 3600 * 1000);
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: fifteenDaysAgo.toISOString(),
      sets: [{ load_kg: 100, reps_completed: 5 }],
    }));
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    expect(result.current.pendingRestore).toBeNull();
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
  });

  it('clears pendingRestore on session change', () => {
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 50, reps_completed: 5 }],
    }));
    const { result, rerender } = renderHook(
      ({ sessionName }) =>
        useWorkoutDraft({ programId: 1, week: 1, sessionName,
                          sets: [], saved: false, knownProgramIds: [1] }),
      { initialProps: { sessionName: 'A' } },
    );
    expect(result.current.pendingRestore.sets[0].load_kg).toBe(50);

    rerender({ sessionName: 'B' });
    expect(result.current.pendingRestore).toBeNull();
  });

  it('acceptRestore removes the localStorage key', () => {
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 50, reps_completed: 5 }],
    }));
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    act(() => result.current.acceptRestore());
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
    expect(result.current.pendingRestore).toBeNull();
  });

  it('discardRestore removes the localStorage key', () => {
    localStorage.setItem(KEY(1, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 50, reps_completed: 5 }],
    }));
    const { result } = renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    act(() => result.current.discardRestore());
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
  });

  it('orphaned key for unknown programId is swept on mount', () => {
    localStorage.setItem(KEY(99, 1, 'A'), JSON.stringify({
      savedAt: new Date().toISOString(),
      sets: [{ load_kg: 50, reps_completed: 5 }],
    }));
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [], saved: false, knownProgramIds: [1] })
    );
    expect(localStorage.getItem(KEY(99, 1, 'A'))).toBeNull();
  });

  it('saved=true disables persistence', () => {
    renderHook(() =>
      useWorkoutDraft({ programId: 1, week: 1, sessionName: 'A',
                        sets: [{ load_kg: 100, reps_completed: 5 }],
                        saved: true, knownProgramIds: [1] })
    );
    expect(localStorage.getItem(KEY(1, 1, 'A'))).toBeNull();
  });
});
