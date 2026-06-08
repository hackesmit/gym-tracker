import { useState } from 'react';
import { swapExercise, getSchedule, getExerciseCatalog } from '../api/client';
import { flattenScheduleForWeek } from './useLoggerSession';
import { useToast } from '../context/ToastContext';

/**
 * Manages the exercise-swap modal state. After a successful swap, the schedule
 * is re-fetched and the parent's selectedSession is re-bound by name; the
 * Logger's sets-init effect then runs naturally and pulls the new exercise's
 * last-session per-set data via the overload endpoint.
 */
export default function useExerciseSwap(activeProgram, _swapInProgress, {
  currentWeek, selectedSession, setSelectedSession,
  setSessions, setScheduleData, setSets, setCatalogData, catalogData,
  skipSetsInit: _skipSetsInit,
}) {
  const { addToast } = useToast();
  const [swapTarget, setSwapTarget] = useState(null); // display name (for modal copy + filter)
  const [swapPeId, setSwapPeId] = useState(null);     // the exact slot to swap
  const [swapSearch, setSwapSearch] = useState('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapMuscleGroup, setSwapMuscleGroup] = useState(null);
  const [showAllMuscleGroups, setShowAllMuscleGroups] = useState(false);

  const openSwapModal = async (exerciseName, peId) => {
    setSwapTarget(exerciseName);
    setSwapPeId(peId ?? null);
    setSwapSearch('');
    setShowAllMuscleGroups(false);

    let catalog = catalogData;
    if (catalog.length === 0) {
      setSwapLoading(true);
      try {
        const res = await getExerciseCatalog();
        catalog = Array.isArray(res) ? res : res.exercises || [];
        setCatalogData(catalog);
      } catch {
        setCatalogData([]);
        catalog = [];
      } finally {
        setSwapLoading(false);
      }
    }

    const match = catalog.find((ex) => {
      const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
      return name === exerciseName;
    });
    setSwapMuscleGroup(match?.muscle_group || null);
  };

  const handleSwapSelect = async (newName) => {
    if (!activeProgram || swapPeId == null || newName === swapTarget) return;
    try {
      await swapExercise(activeProgram.id, swapPeId, newName);
      const scheduleRes = await getSchedule(activeProgram.id);
      setScheduleData(scheduleRes);
      const flatSessions = flattenScheduleForWeek(scheduleRes, currentWeek);
      setSessions(flatSessions);

      // Drop the swapped-out PE's rows from sets so React doesn't briefly
      // render stale rows while the schedule refresh propagates. The
      // sets-init effect will repopulate from the new schedule + overload.
      setSets((prev) => prev.filter((s) => s.exercise_name !== swapTarget));

      const match = flatSessions.find((s) => s.session_name === selectedSession?.session_name);
      if (match) setSelectedSession(match);
      else if (flatSessions.length) setSelectedSession(flatSessions[0]);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSwapTarget(null);
      setSwapPeId(null);
      setSwapSearch('');
    }
  };

  const closeSwapModal = () => {
    setSwapTarget(null);
    setSwapPeId(null);
    setSwapSearch('');
  };

  const filteredCatalog = catalogData.filter((ex) => {
    const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
    if (name === swapTarget) return false;
    if (!name.toLowerCase().includes(swapSearch.toLowerCase())) return false;
    if (!showAllMuscleGroups && swapMuscleGroup) {
      const mg = typeof ex === 'string' ? '' : ex.muscle_group || '';
      if (mg !== swapMuscleGroup) return false;
    }
    return true;
  });

  return {
    swapTarget,
    swapSearch,
    setSwapSearch,
    swapLoading,
    swapMuscleGroup,
    showAllMuscleGroups,
    setShowAllMuscleGroups,
    filteredCatalog,
    openSwapModal,
    handleSwapSelect,
    closeSwapModal,
  };
}
