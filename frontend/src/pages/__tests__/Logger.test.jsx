import { describe, it, expect } from 'vitest';

/**
 * Pure-function test of the Logger's exercise-grouping pass. Two PEs with
 * matching canonical exercise_name (post-2026-05-13 HEAVY/BACK-OFF collapse)
 * must render as two distinct groups, not one merged group.
 *
 * We extract the grouping into a helper for testability; the Logger imports
 * it from the same module.
 */
import { groupSetsByProgramExercise } from '../Logger';

describe('groupSetsByProgramExercise', () => {
  it('keeps two PEs with the same exercise_name in separate groups', () => {
    const sets = [
      { program_exercise_id: 10, exercise_name: 'PULLUP', exercise_name_raw: 'PULLUP (HEAVY)',   set_number: 1, reps_completed: 5 },
      { program_exercise_id: 10, exercise_name: 'PULLUP', exercise_name_raw: 'PULLUP (HEAVY)',   set_number: 2, reps_completed: 4 },
      { program_exercise_id: 11, exercise_name: 'PULLUP', exercise_name_raw: 'PULLUP (BACK OFF)', set_number: 1, reps_completed: 8 },
    ];
    const groups = groupSetsByProgramExercise(sets);
    expect(groups).toHaveLength(2);
    expect(groups[0].pe_id).toBe(10);
    expect(groups[0].sets).toHaveLength(2);
    expect(groups[1].pe_id).toBe(11);
    expect(groups[1].sets).toHaveLength(1);
  });

  it('still merges consecutive sets that share a program_exercise_id', () => {
    const sets = [
      { program_exercise_id: 7, exercise_name: 'BENCH PRESS', set_number: 1 },
      { program_exercise_id: 7, exercise_name: 'BENCH PRESS', set_number: 2 },
      { program_exercise_id: 7, exercise_name: 'BENCH PRESS', set_number: 3 },
    ];
    const groups = groupSetsByProgramExercise(sets);
    expect(groups).toHaveLength(1);
    expect(groups[0].sets).toHaveLength(3);
  });

  it('attaches a unique idx to each set within the group', () => {
    const sets = [
      { program_exercise_id: 10, exercise_name: 'PULLUP', set_number: 1 },
      { program_exercise_id: 10, exercise_name: 'PULLUP', set_number: 2 },
      { program_exercise_id: 11, exercise_name: 'PULLUP', set_number: 1 },
    ];
    const groups = groupSetsByProgramExercise(sets);
    const allIdx = groups.flatMap((g) => g.sets.map((s) => s.idx));
    expect(allIdx).toEqual([0, 1, 2]);
  });

  it('falls back to exercise_name when program_exercise_id is missing', () => {
    // Defensive: legacy code paths that build sets without pe_id keep working.
    const sets = [
      { exercise_name: 'BENCH PRESS', set_number: 1 },
      { exercise_name: 'BENCH PRESS', set_number: 2 },
      { exercise_name: 'OHP', set_number: 1 },
    ];
    const groups = groupSetsByProgramExercise(sets);
    expect(groups).toHaveLength(2);
    expect(groups[0].sets).toHaveLength(2);
  });
});
