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

describe('useExerciseSwap.handleSwapSelect', () => {
  let setSets, setSessions, setScheduleData, setSelectedSession, setCatalogData;
  let skipSetsInit;

  beforeEach(() => {
    setSets = vi.fn();
    setSessions = vi.fn();
    setScheduleData = vi.fn();
    setSelectedSession = vi.fn();
    setCatalogData = vi.fn();
    skipSetsInit = { current: false };
    vi.clearAllMocks();
  });

  function setupHook() {
    const scheduleRes = {
      schedule: { 1: { 'Pull A': [{ id: 99, exercise_name: 'BENT-OVER BARBELL ROW', working_sets: 3 }] } },
    };
    getSchedule.mockResolvedValue(scheduleRes);

    const hook = renderHook(() =>
      useExerciseSwap(
        { id: 7 },
        null,
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
    return { hook, scheduleRes };
  }

  it('does NOT set skipSetsInit after swap (sets re-init from new overload)', async () => {
    const { hook } = setupHook();
    await act(async () => { await hook.result.current.openSwapModal('BARBELL ROW'); });
    await act(async () => { await hook.result.current.handleSwapSelect('BENT-OVER BARBELL ROW'); });

    expect(swapExercise).toHaveBeenCalledWith(7, 'BARBELL ROW', 'BENT-OVER BARBELL ROW');
    expect(skipSetsInit.current).toBe(false);
  });

  it('drops the swapped-out exercise rows from sets', async () => {
    const { hook } = setupHook();
    await act(async () => { await hook.result.current.openSwapModal('BARBELL ROW'); });
    await act(async () => { await hook.result.current.handleSwapSelect('BENT-OVER BARBELL ROW'); });

    // setSets is called with a functional updater. Run it against a mock
    // prev-sets array to verify the swapped-out exercise's rows are removed
    // while other exercises in the session stay.
    expect(setSets).toHaveBeenCalledWith(expect.any(Function));
    const updater = setSets.mock.calls[0][0];
    const prev = [
      { exercise_name: 'BARBELL ROW', set_number: 1, load_kg: 60 },
      { exercise_name: 'BARBELL ROW', set_number: 2, load_kg: 60 },
      { exercise_name: 'OHP', set_number: 1, load_kg: 40 },
    ];
    expect(updater(prev)).toEqual([
      { exercise_name: 'OHP', set_number: 1, load_kg: 40 },
    ]);
  });

  it('refreshes the schedule and re-selects the same session', async () => {
    const { hook, scheduleRes } = setupHook();
    await act(async () => { await hook.result.current.openSwapModal('BARBELL ROW'); });
    await act(async () => { await hook.result.current.handleSwapSelect('BENT-OVER BARBELL ROW'); });

    expect(setScheduleData).toHaveBeenCalledWith(scheduleRes);
    expect(setSessions).toHaveBeenCalledWith([
      { session_name: 'Pull A', exercises: [{ id: 99, exercise_name: 'BENT-OVER BARBELL ROW', working_sets: 3 }] },
    ]);
    expect(setSelectedSession).toHaveBeenCalledWith(
      expect.objectContaining({ session_name: 'Pull A' }),
    );
  });
});
