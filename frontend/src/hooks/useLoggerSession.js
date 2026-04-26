import { useEffect, useRef, useState } from 'react';
import { getSchedule, getOverloadPlan, getTracker, getExerciseCatalog } from '../api/client';

/**
 * Transform the nested schedule response into a flat sessions array for a given week.
 * Backend returns: { schedule: { weekNum: { sessionName: [exercises] } } }
 * We need: [{ session_name, exercises: [...] }]
 */
export function flattenScheduleForWeek(scheduleResponse, week) {
  const schedule = scheduleResponse?.schedule || {};
  const weekData = schedule[week] || schedule[String(week)] || {};
  return Object.entries(weekData).map(([sessionName, exercises]) => ({
    session_name: sessionName,
    exercises,
  }));
}

/**
 * Custom hook that manages session loading, week navigation, overload suggestions,
 * and schedule data for the Logger page.
 */
export default function useLoggerSession(activeProgram, units) {
  const [sessions, setSessions] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [selectedSession, setSelectedSession] = useState(null);
  const [overload, setOverload] = useState(null);
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalogData, setCatalogData] = useState([]);

  // Refs to skip sets re-init after exercise swap (preserves user-entered data)
  const skipSetsInit = useRef(false);
  const swapInProgress = useRef(false);

  // Load schedule + tracker on mount
  useEffect(() => {
    if (!activeProgram) { setLoading(false); return; }

    const load = async () => {
      try {
        const [scheduleRes, trackerRes] = await Promise.all([
          getSchedule(activeProgram.id),
          getTracker(activeProgram.id).catch(() => null),
        ]);

        setScheduleData(scheduleRes);

        // Use tracker's current week, fallback to 1
        const week = trackerRes?.current_week || 1;
        setCurrentWeek(week);

        // If tracker has a next_session, use its week
        const nextWeek = trackerRes?.next_session?.week || week;
        setCurrentWeek(nextWeek);

        const flatSessions = flattenScheduleForWeek(scheduleRes, nextWeek);
        setSessions(flatSessions);

        // Pre-select the next session from tracker, or first available
        const nextSessionName = trackerRes?.next_session?.session_name;
        const match = flatSessions.find((s) => s.session_name === nextSessionName);
        if (match) {
          setSelectedSession(match);
        } else if (flatSessions.length) {
          setSelectedSession(flatSessions[0]);
        }
        // Pre-fetch exercise catalog for weight hints and swap modal
        getExerciseCatalog()
          .then((res) => setCatalogData(Array.isArray(res) ? res : res.exercises || []))
          .catch(() => {});
      } catch {
        // Silently fail — user sees empty state
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeProgram]);

  // Load overload suggestions when session changes
  useEffect(() => {
    if (!activeProgram || !selectedSession) return;
    const isSwap = swapInProgress.current;
    getOverloadPlan(activeProgram.id, currentWeek, selectedSession.session_name)
      .then((data) => {
        setOverload(data);
        if (isSwap) {
          // Overload updated after a swap — skip the sets-init effect it triggers
          skipSetsInit.current = true;
          swapInProgress.current = false;
        }
      })
      .catch(() => {
        setOverload(null);
        swapInProgress.current = false;
      });
  }, [activeProgram, selectedSession, currentWeek]);

  // Change displayed week
  const changeWeek = (newWeek) => {
    if (!scheduleData || newWeek < 1 || newWeek > (activeProgram?.total_weeks || 12)) return;
    setCurrentWeek(newWeek);
    const flatSessions = flattenScheduleForWeek(scheduleData, newWeek);
    setSessions(flatSessions);
    if (flatSessions.length) setSelectedSession(flatSessions[0]);
  };

  return {
    sessions,
    setSessions,
    currentWeek,
    setCurrentWeek,
    selectedSession,
    setSelectedSession,
    overload,
    setOverload,
    scheduleData,
    setScheduleData,
    loading,
    catalogData,
    setCatalogData,
    skipSetsInit,
    swapInProgress,
    changeWeek,
  };
}
