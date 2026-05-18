// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../api/client', () => ({
  swapExercise: vi.fn().mockResolvedValue({}),
  getSchedule: vi.fn(),
  getExerciseCatalog: vi.fn().mockResolvedValue([
    { name: 'BARBELL ROW', muscle_group: 'back' },
    { name: 'BENT-OVER BARBELL ROW', muscle_group: 'back' },
  ]),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import useExerciseSwap from '../useExerciseSwap';
import { swapExercise, getSchedule } from '../../api/client';

describe('useExerciseSwap', () => {
  let setSets, setSessions, setScheduleData, setSelectedSession, setCatalogData;
  let skipSetsInit, swapInProgress;

  beforeEach(() => {
    setSets = vi.fn();
    setSessions = vi.fn();
    setScheduleData = vi.fn();
    setSelectedSession = vi.fn();
    setCatalogData = vi.fn();
    skipSetsInit = { current: false };
    swapInProgress = { current: false };
    vi.clearAllMocks();
  });

  it('does NOT set skipSetsInit after swap (so sets re-init from new overload)', async () => {
    getSchedule.mockResolvedValue({
      schedule: { 1: { 'Pull A': [{ id: 99, exercise_name: 'BENT-OVER BARBELL ROW', working_sets: 3 }] } },
    });

    const { result } = renderHook(() =>
      useExerciseSwap(
        { id: 7 },
        swapInProgress,
        {
          currentWeek: 1,
          selectedSession: { session_name: 'Pull A', exercises: [] },
          setSelectedSession,
          setSessions,
          setScheduleData,
          setSets,
          setCatalogData,
          catalogData: [
            { name: 'BARBELL ROW', muscle_group: 'back' },
            { name: 'BENT-OVER BARBELL ROW', muscle_group: 'back' },
          ],
          skipSetsInit,
        }
      )
    );

    await act(async () => {
      await result.current.openSwapModal('BARBELL ROW');
    });

    await act(async () => {
      await result.current.handleSwapSelect('BENT-OVER BARBELL ROW');
    });

    expect(swapExercise).toHaveBeenCalledWith(7, 'BARBELL ROW', 'BENT-OVER BARBELL ROW');
    expect(skipSetsInit.current).toBe(false);   // CRITICAL — must not skip
    expect(swapInProgress.current).toBe(false); // CRITICAL — no leftover flag
  });
});
