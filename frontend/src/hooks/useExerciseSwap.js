import { useState } from 'react';
import { swapExercise, getSchedule, getExerciseCatalog } from '../api/client';
import { flattenScheduleForWeek } from './useLoggerSession';
import { useToast } from '../context/ToastContext';

/**
 * Custom hook that manages the exercise swap modal state and logic.
 */
export default function useExerciseSwap(activeProgram, swapInProgress, {
  currentWeek, selectedSession, setSelectedSession,
  setSessions, setScheduleData, setSets, setCatalogData, catalogData,
  skipSetsInit,
}) {
  const { addToast } = useToast();
  const [swapTarget, setSwapTarget] = useState(null);
  const [swapSearch, setSwapSearch] = useState('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapMuscleGroup, setSwapMuscleGroup] = useState(null);
  const [showAllMuscleGroups, setShowAllMuscleGroups] = useState(false);

  // Open swap modal — fetch catalog on first open
  const openSwapModal = async (exerciseName) => {
    setSwapTarget(exerciseName);
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

    // Default-filter to same muscle group as exercise being swapped
    const match = catalog.find((ex) => {
      const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
      return name === exerciseName;
    });
    setSwapMuscleGroup(match?.muscle_group || null);
  };

  const handleSwapSelect = async (newName) => {
    if (!activeProgram || !swapTarget || newName === swapTarget) return;
    try {
      await swapExercise(activeProgram.id, swapTarget, newName);
      // Refresh schedule data
      const scheduleRes = await getSchedule(activeProgram.id);
      setScheduleData(scheduleRes);
      const flatSessions = flattenScheduleForWeek(scheduleRes, currentWeek);
      setSessions(flatSessions);

      // Update sets in-place: rename the swapped exercise but keep user-entered data
      setSets((prev) => prev.map((s) => {
        if (s.exercise_name === swapTarget) {
          // Find the new exercise in the updated session to get its id
          const match = flatSessions.find((fs) => fs.session_name === selectedSession?.session_name);
          const newEx = match?.exercises?.find((e) => (e.exercise_name || e.exercise_name_canonical) === newName);
          return {
            ...s,
            exercise_name: newName,
            program_exercise_id: newEx?.id ?? s.program_exercise_id,
          };
        }
        return s;
      }));

      // Skip the sets-init effect since we already updated sets manually
      skipSetsInit.current = true;
      swapInProgress.current = true;

      // Re-select the same session by name
      const match = flatSessions.find((s) => s.session_name === selectedSession?.session_name);
      if (match) setSelectedSession(match);
      else if (flatSessions.length) setSelectedSession(flatSessions[0]);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSwapTarget(null);
      setSwapSearch('');
    }
  };

  const closeSwapModal = () => {
    setSwapTarget(null);
    setSwapSearch('');
  };

  // Filtered catalog for swap search — default-filtered by muscle group
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
