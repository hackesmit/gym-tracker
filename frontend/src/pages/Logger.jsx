import { useEffect, useRef, useState } from 'react';
import { kgToDisplay, displayToKg } from '../utils/units';
import {
  Dumbbell, ChevronLeft, ChevronRight, Check, Timer,
  Plus, Minus, Save, Trophy, X, TrendingUp, ArrowLeftRight, Search,
} from 'lucide-react';
import Card from '../components/Card';
import RestTimer from '../components/RestTimer';
import LoadingSpinner from '../components/LoadingSpinner';
import WarmUpPyramid from '../components/WarmUpPyramid';
import PlateCalculator, { PlateCalcButton } from '../components/PlateCalculator';
import SessionSummary from '../components/SessionSummary';
import SetRow from '../components/SetRow';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';
import {
  logBulkSession, logBodyMetric, undoSession,
} from '../api/client';
import useLoggerSession from '../hooks/useLoggerSession';
import useExerciseSwap from '../hooks/useExerciseSwap';
import useWorkoutDraft from '../hooks/useWorkoutDraft';

function getWeightHint(exerciseName, catalog) {
  if (!catalog || !catalog.length) return null;
  const entry = catalog.find((ex) => {
    const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
    return name === exerciseName;
  });
  if (!entry || typeof entry === 'string') return null;
  if (entry.is_unilateral) return '/side';
  if (entry.equipment === 'dumbbell') return '/DB';
  return null;
}

function isBodyweightExercise(exerciseName, catalog) {
  if (!exerciseName || !catalog || !catalog.length) return false;
  const entry = catalog.find((ex) => {
    const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
    return name === exerciseName;
  });
  if (!entry || typeof entry === 'string') return false;
  return entry.equipment === 'bodyweight';
}

function getBodyweightKind(exerciseName, catalog) {
  if (!exerciseName || !catalog || !catalog.length) return null;
  const entry = catalog.find((ex) => {
    const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
    return name === exerciseName;
  });
  if (!entry || typeof entry === 'string') return null;
  return entry.bodyweight_kind || null;
}

export default function Logger() {
  const { activeProgram, unitLabel, units, convert, defaultRestSeconds, programs } = useApp();
  const t = useT();
  const { addToast } = useToast();
  const { user, refreshUser } = useAuth();
  const userBodyweightKg = user?.bodyweight_kg ?? null;

  const handleSetBw = async (bw) => {
    await logBodyMetric({
      date: new Date().toISOString().split('T')[0],
      bodyweight_kg: displayToKg(bw, units),
    });
    if (refreshUser) await refreshUser();
  };

  // --- Hook 1: session / schedule / overload state ---
  const {
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
  } = useLoggerSession(activeProgram, units);

  // --- Local Logger state ---
  const [sets, setSets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('workout'); // workout | metrics
  const [prList, setPrList] = useState([]);
  const [restTimerTriggers, setRestTimerTriggers] = useState({});
  const [plateCalcWeight, setPlateCalcWeight] = useState(null);
  const [undoInfo, setUndoInfo] = useState(null); // { sessionLogId, savedSets, timer }
  const undoTimerRef = useRef(null);

  // Body metrics state
  const [metrics, setMetrics] = useState({
    bodyweight_kg: '', body_fat_pct: '', sleep_hours: '',
    stress_level: '', soreness_level: '',
  });
  const [metricsSaved, setMetricsSaved] = useState(false);

  // --- Hook 2: exercise swap modal ---
  const {
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
  } = useExerciseSwap(activeProgram, swapInProgress, {
    currentWeek, selectedSession, setSelectedSession,
    setSessions, setScheduleData, setSets, setCatalogData, catalogData,
    skipSetsInit,
  });

  // --- Hook 3: draft persistence (replaces inline localStorage logic) ---
  const knownProgramIds = (programs || []).map((p) => p.id);
  const { pendingRestore, acceptRestore, discardRestore } = useWorkoutDraft({
    programId: activeProgram?.id,
    week: currentWeek,
    sessionName: selectedSession?.session_name,
    sets,
    saved,
    knownProgramIds,
  });

  // Initialize sets when session or overload changes
  useEffect(() => {
    if (skipSetsInit.current) {
      skipSetsInit.current = false;
      return;
    }
    if (!selectedSession) return;
    const exercises = selectedSession.exercises || [];
    const newSets = [];
    exercises.forEach((ex) => {
      const exName = ex.exercise_name || ex.exercise_name_canonical;
      const suggestion = overload?.exercises?.find(
        (o) => o.exercise_name === exName
      );
      const suggestedLoad = suggestion?.suggested_load_kg;
      const perSetData = suggestion?.per_set_data || [];
      // Convert suggested load for display if in lbs mode
      const displayLoad = suggestedLoad != null
        ? kgToDisplay(suggestedLoad, units)
        : '';

      // Parse prescribed reps — handle ranges like "8-10"
      const repsStr = ex.prescribed_reps || '';
      const repsMatch = repsStr.match(/(\d+)/);
      const defaultReps = repsMatch ? parseInt(repsMatch[1], 10) : 8;

      for (let s = 1; s <= (ex.working_sets || 3); s++) {
        // Auto-fill: use exact per-set data from last session if available
        const prevSet = perSetData.find((p) => p.set_number === s);
        let setLoad = displayLoad;
        let setReps = defaultReps;
        let setRpe = ex.prescribed_rpe || '';
        if (prevSet) {
          setLoad = kgToDisplay(prevSet.load_kg, units);
          setReps = prevSet.reps_completed;
          if (prevSet.rpe_actual != null) setRpe = prevSet.rpe_actual;
        }

        newSets.push({
          program_exercise_id: ex.id,
          exercise_name: exName,
          set_number: s,
          load_kg: setLoad,
          reps_completed: setReps,
          rpe_actual: setRpe,
          rest_period: ex.rest_period || '',
          warm_up_sets: ex.warm_up_sets || '',
          is_bodyweight: false,
          added_load_kg: '',
          is_dropset: false,
          dropset_load_kg: '',
          dropset_reps: '',
          is_superset: ex.is_superset || false,
          superset_group: ex.superset_group || null,
        });
      }
    });
    setSets(newSets);
  }, [selectedSession, overload]);

  const updateSet = (idx, field, value) => {
    setSets((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  // Wrap changeWeek to also reset saved state
  const handleChangeWeek = (newWeek) => {
    changeWeek(newWeek);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!activeProgram || !selectedSession || !sets.length) return;

    const needsBwButMissing = sets.some((s) => {
      const kind = getBodyweightKind(s.exercise_name, catalogData);
      return (kind === 'pure' || kind === 'weighted_capable')
             && +s.reps_completed > 0
             && !userBodyweightKg;
    });
    if (needsBwButMissing) {
      addToast('Set your bodyweight to log bodyweight exercises.', 'error');
      return;
    }

    const oversizedAdded = sets.some((s) => {
      const kind = getBodyweightKind(s.exercise_name, catalogData);
      if (kind !== 'weighted_capable') return false;
      return parseFloat(s.added_load_kg) > 100;
    });
    if (oversizedAdded) {
      addToast('Added weight > 100 kg. Double-check before lifting!', 'info');
    }

    setSaving(true);
    try {
      const payload = {
        program_id: activeProgram.id,
        week: currentWeek,
        session_name: selectedSession.session_name,
        date: new Date().toISOString().split('T')[0],
        sets: sets
          .filter((s) => {
            const kind = getBodyweightKind(s.exercise_name, catalogData);
            if (kind === 'pure' || kind === 'weighted_capable') {
              return +s.reps_completed > 0;
            }
            return +s.load_kg > 0;
          })
          .map((s) => {
            const kind = getBodyweightKind(s.exercise_name, catalogData);
            let load_kg, added_load_kg;
            if (kind === 'pure') {
              load_kg = userBodyweightKg ?? 0;
              added_load_kg = 0;
            } else if (kind === 'weighted_capable') {
              // s.added_load_kg is in display units (what the user typed);
              // convert to kg before summing with userBodyweightKg (already kg).
              const added = displayToKg(parseFloat(s.added_load_kg) || 0, units);
              load_kg = (userBodyweightKg ?? 0) + added;
              added_load_kg = added;
            } else {
              load_kg = displayToKg(s.load_kg, units);
              added_load_kg = null;
            }
            return {
              program_exercise_id: s.program_exercise_id,
              set_number: s.set_number,
              load_kg,
              reps_completed: +s.reps_completed,
              rpe_actual: s.rpe_actual ? +s.rpe_actual : null,
              added_load_kg,
              is_dropset: s.is_dropset,
              dropset_load_kg: s.is_dropset && s.dropset_load_kg
                ? displayToKg(s.dropset_load_kg, units)
                : null,
            };
          }),
      };
      const result = await logBulkSession(payload);
      setSaved(true);
      acceptRestore();   // clears the localStorage key for this session
      if (result.prs && result.prs.length > 0) {
        setPrList(result.prs);
      }
      // Start undo timer
      if (result.session_log_id) {
        clearTimeout(undoTimerRef.current);
        const savedCopy = [...sets];
        setUndoInfo({ sessionLogId: result.session_log_id, savedSets: savedCopy });
        undoTimerRef.current = setTimeout(() => setUndoInfo(null), 10000);
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMetricsSave = async () => {
    const data = {
      date: new Date().toISOString().split('T')[0],
      bodyweight_kg: displayToKg(metrics.bodyweight_kg, units),
    };
    if (metrics.body_fat_pct) data.body_fat_pct = +metrics.body_fat_pct;
    if (metrics.sleep_hours) data.sleep_hours = +metrics.sleep_hours;
    if (metrics.stress_level) data.stress_level = +metrics.stress_level;
    if (metrics.soreness_level) data.soreness_level = +metrics.soreness_level;

    try {
      await logBodyMetric(data);
      setMetricsSaved(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleUndo = async () => {
    if (!undoInfo) return;
    try {
      await undoSession(undoInfo.sessionLogId);
      clearTimeout(undoTimerRef.current);
      setSets(undoInfo.savedSets);
      setSaved(false);
      setPrList([]);
      setUndoInfo(null);
    } catch (err) {
      addToast('Undo failed: ' + err.message, 'error');
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!activeProgram) return (
    <div className="text-center py-12 text-text-muted">
      {t('logger.noActiveProgram')}
    </div>
  );

  // Group sets by exercise, respecting superset grouping
  const exerciseGroups = [];
  let currentEx = null;
  sets.forEach((s, idx) => {
    if (s.exercise_name !== currentEx) {
      exerciseGroups.push({
        name: s.exercise_name,
        sets: [],
        is_superset: s.is_superset,
        superset_group: s.superset_group,
        rest_period: s.rest_period,
        warm_up_sets: s.warm_up_sets,
      });
      currentEx = s.exercise_name;
    }
    exerciseGroups[exerciseGroups.length - 1].sets.push({ ...s, idx });
  });

  // Group supersets together for visual display
  const displayGroups = [];
  let i = 0;
  while (i < exerciseGroups.length) {
    const group = exerciseGroups[i];
    if (group.is_superset && group.superset_group) {
      // Collect all exercises in this superset
      const supersetExercises = [group];
      let j = i + 1;
      while (j < exerciseGroups.length && exerciseGroups[j].superset_group === group.superset_group) {
        supersetExercises.push(exerciseGroups[j]);
        j++;
      }
      displayGroups.push({ type: 'superset', group: group.superset_group, exercises: supersetExercises });
      i = j;
    } else {
      displayGroups.push({ type: 'single', exercises: [group] });
      i++;
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header + tab switcher */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">{t('logger.title')}</h2>
        <div className="flex gap-1 bg-surface-light rounded-lg p-1">
          <button onClick={() => setTab('workout')}
            className={`px-3 py-2 sm:px-4 rounded text-xs sm:text-sm font-medium touch-manipulation ${tab === 'workout' ? 'bg-accent text-accent-ink' : 'text-text-muted'}`}>
            Workout
          </button>
          <button onClick={() => setTab('metrics')}
            className={`px-3 py-2 sm:px-4 rounded text-xs sm:text-sm font-medium touch-manipulation ${tab === 'metrics' ? 'bg-accent text-accent-ink' : 'text-text-muted'}`}>
            Metrics
          </button>
        </div>
      </div>

      {tab === 'metrics' && (
        <Card title="Today's Metrics">
          {metricsSaved ? (
            <div className="text-center py-6">
              <Check className="text-success mx-auto mb-2" size={32} />
              <p className="text-sm">Metrics saved!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <MetricInput label={`${t('logger.bodyweight')} (${unitLabel})`} value={metrics.bodyweight_kg}
                onChange={(v) => setMetrics((m) => ({ ...m, bodyweight_kg: v }))} />
              <MetricInput label="Body Fat %" value={metrics.body_fat_pct}
                onChange={(v) => setMetrics((m) => ({ ...m, body_fat_pct: v }))} />
              <MetricInput label="Sleep (hours)" value={metrics.sleep_hours}
                onChange={(v) => setMetrics((m) => ({ ...m, sleep_hours: v }))} />
              <MetricInput label="Stress (1-5)" value={metrics.stress_level}
                onChange={(v) => setMetrics((m) => ({ ...m, stress_level: v }))} />
              <MetricInput label="Soreness (1-5)" value={metrics.soreness_level}
                onChange={(v) => setMetrics((m) => ({ ...m, soreness_level: v }))} />
              <button onClick={handleMetricsSave}
                disabled={!metrics.bodyweight_kg}
                className="btn-primary-cta touch-manipulation">
                {t('common.save')}
              </button>
            </div>
          )}
        </Card>
      )}

      {tab === 'workout' && (
        <>
          {/* Week selector */}
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => handleChangeWeek(currentWeek - 1)} disabled={currentWeek <= 1}
              className="p-2.5 rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-30 touch-manipulation">
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium min-w-[5rem] text-center">Week {currentWeek}</span>
            <button onClick={() => handleChangeWeek(currentWeek + 1)} disabled={currentWeek >= (activeProgram?.total_weeks || 12)}
              className="p-2.5 rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-30 touch-manipulation">
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Session selector - horizontal scroll on mobile */}
          {sessions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
              {sessions.map((s) => (
                <button
                  key={s.session_name}
                  onClick={() => { setSelectedSession(s); setSaved(false); }}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors touch-manipulation ${
                    selectedSession?.session_name === s.session_name
                      ? 'bg-accent text-accent-ink' : 'bg-surface-light text-text-muted hover:text-text'
                  }`}
                >
                  {s.session_name}
                </button>
              ))}
            </div>
          )}

          {/* Overload suggestions banner */}
          {overload?.exercises?.length > 0 && !saved && (
            <div className="bg-accent/10 border border-accent/25 rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-accent-light" />
                <span className="text-xs font-semibold text-accent-light uppercase tracking-wider">Progressive Overload</span>
              </div>
              <div className="space-y-1">
                {overload.exercises.map((ex) => {
                  const displayLoad = ex.suggested_load_kg != null
                    ? kgToDisplay(ex.suggested_load_kg, units)
                    : null;
                  return (
                    <div key={ex.exercise_name} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted truncate mr-2">{ex.exercise_name}</span>
                      {displayLoad != null && (
                        <span className="text-accent-light font-medium whitespace-nowrap">
                          {displayLoad} {unitLabel} · {ex.method}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Restore pending sets prompt */}
          {pendingRestore && !saved && (
            <div className="bg-info/10 border border-info/25 rounded-xl p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-info">Unsaved workout found. Restore?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setSets(pendingRestore.sets); acceptRestore(); }}
                  className="px-3 py-1.5 text-xs font-medium bg-info text-white rounded-lg touch-manipulation"
                >
                  Restore
                </button>
                <button
                  onClick={discardRestore}
                  className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text touch-manipulation"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {saved ? (
            <SessionSummary
              sets={sets.map((s) => {
                // Synthesize an effective load_kg in DISPLAY units for the chronicle's
                // volume / top-set / set-count math. External-load sets already store
                // user-typed display values; bodyweight-class sets need it derived.
                const kind = getBodyweightKind(s.exercise_name, catalogData);
                if (kind === 'pure') {
                  const bwDisplay = userBodyweightKg ? kgToDisplay(userBodyweightKg, units) : 0;
                  return { ...s, load_kg: bwDisplay };
                }
                if (kind === 'weighted_capable') {
                  const bwDisplay = userBodyweightKg ? kgToDisplay(userBodyweightKg, units) : 0;
                  const addedDisplay = parseFloat(s.added_load_kg) || 0;
                  return { ...s, load_kg: bwDisplay + addedDisplay };
                }
                return s;
              })}
              prList={prList}
              sessionName={selectedSession?.session_name || ''}
              week={currentWeek}
              units={units}
              convert={convert}
              unitLabel={unitLabel}
              onLogAnother={() => { setSaved(false); setUndoInfo(null); }}
            />
          ) : (
            <>
              {displayGroups.map((dg, dgIdx) => (
                <div key={dgIdx}>
                  {dg.type === 'superset' && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-accent-light font-semibold bg-accent/10 px-2 py-0.5 rounded">
                        Superset {dg.group}
                      </span>
                    </div>
                  )}
                  <div className={dg.type === 'superset' ? 'border border-accent/20 rounded-xl p-2 sm:p-3 space-y-3' : ''}>
                    {dg.exercises.map((group) => (
                      <Card key={group.name} className="!p-3 sm:!p-5">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <Dumbbell size={14} className="text-accent-light shrink-0" />
                          <span className="truncate">{group.name}</span>
                          {isBodyweightExercise(group.name, catalogData) && (
                            <span className="text-[9px] uppercase tracking-wider text-accent-light bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
                              {t('logger.bodyweight')}
                            </span>
                          )}
                          <button
                            onClick={() => openSwapModal(group.name)}
                            title={t('logger.swap')}
                            className="p-1 rounded text-text-muted hover:text-accent-light hover:bg-surface-light transition-colors shrink-0 touch-manipulation"
                          >
                            <ArrowLeftRight size={13} />
                          </button>
                          <PlateCalcButton onClick={() => setPlateCalcWeight(group.sets[0]?.load_kg ? +group.sets[0].load_kg : 0)} />
                          {group.warm_up_sets && group.warm_up_sets !== '0' && (
                            <span className="text-[10px] text-text-muted shrink-0">
                              {group.warm_up_sets} warm-up
                            </span>
                          )}
                          {group.rest_period && group.rest_period !== '0 MINS' && (
                            <span className="ml-auto text-[10px] text-text-muted flex items-center gap-1 shrink-0">
                              <Timer size={10} /> {group.rest_period}
                            </span>
                          )}
                        </h4>
                        {/* Previous session numbers */}
                        {(() => {
                          const prev = overload?.exercises?.find((o) => o.exercise_name === group.name)?.last_performance;
                          if (!prev) return null;
                          const displayLoad = kgToDisplay(prev.load_kg, units);
                          return (
                            <p className="text-[10px] text-text-muted mb-2 ml-5">
                              Last: {displayLoad} {unitLabel} x {prev.reps} reps{prev.rpe != null ? ` @ RPE ${prev.rpe}` : ''}
                            </p>
                          );
                        })()}
                        <WarmUpPyramid
                          workingWeight={group.sets[0]?.load_kg ? +group.sets[0].load_kg : 0}
                          units={units}
                          unitLabel={unitLabel}
                        />
                        <div className="space-y-2">
                          {/* Set rows */}
                          {group.sets.map((s) => {
                            const triggerTimer = () => setRestTimerTriggers((prev) => ({
                              ...prev, [group.name]: (prev[group.name] || 0) + 1,
                            }));
                            return (
                            <div key={s.idx} className="space-y-1.5">
                              <SetRow
                                set={s}
                                bodyweightKind={getBodyweightKind(s.exercise_name, catalogData)}
                                userBodyweightKg={userBodyweightKg}
                                unitLabel={unitLabel}
                                units={units}
                                weightHint={getWeightHint(s.exercise_name, catalogData)}
                                onUpdate={(field, value) => updateSet(s.idx, field, value)}
                                onTriggerTimer={triggerTimer}
                                onSetBw={handleSetBw}
                              />
                              {s.is_dropset && (
                                <div className="grid grid-cols-[1.5rem_1fr_1fr] sm:grid-cols-[2rem_1fr_1fr] gap-1.5 sm:gap-2 items-end ml-0">
                                  <span className="text-[9px] text-warning text-center pb-2">&#8627;</span>
                                  <div className="relative">
                                    <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-warning/70 pointer-events-none">Drop {unitLabel}</label>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      value={s.dropset_load_kg || ''}
                                      onChange={(e) => updateSet(s.idx, 'dropset_load_kg', e.target.value)}
                                      className="bg-warning/5 border border-warning/20 rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-warning outline-none min-w-0"
                                      placeholder="0"
                                    />
                                  </div>
                                  <div className="relative">
                                    <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-warning/70 pointer-events-none">Drop Reps</label>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      value={s.dropset_reps || ''}
                                      onChange={(e) => updateSet(s.idx, 'dropset_reps', e.target.value)}
                                      onBlur={triggerTimer}
                                      className="bg-warning/5 border border-warning/20 rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-warning outline-none min-w-0"
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            );
                          })}
                          {/* Rest timer */}
                          {(group.rest_period && group.rest_period !== '0 MINS' || defaultRestSeconds > 0) && (
                            <div className="mt-2">
                              <RestTimer
                                key={`${group.name}-${restTimerTriggers[group.name] || 0}`}
                                restPeriod={group.rest_period}
                                defaultSeconds={defaultRestSeconds}
                                autoStart={(restTimerTriggers[group.name] || 0) > 0}
                              />
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}

              {/* Save button - sticky on mobile for easy access */}
              <div className="sticky bottom-4 z-10">
                <button
                  onClick={handleSave}
                  disabled={saving || !sets.some((s) => {
                    const kind = getBodyweightKind(s.exercise_name, catalogData);
                    if (kind === 'pure' || kind === 'weighted_capable') {
                      return +s.reps_completed > 0;
                    }
                    return +s.load_kg > 0;
                  })}
                  className="btn-primary-cta flex items-center justify-center gap-2 touch-manipulation"
                >
                  <Save size={14} />
                  {saving ? t('common.saving') : t('logger.finish')}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Exercise Swap Modal */}
      {swapTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeSwapModal}>
          <div className="bg-surface border border-surface-lighter rounded-2xl p-4 sm:p-5 max-w-sm w-full shadow-2xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-text">{t('logger.swap')}</h3>
              <button onClick={closeSwapModal}
                className="text-text-muted hover:text-text p-1 touch-manipulation">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-text-muted mb-3">
              Replacing <span className="font-semibold text-text">{swapTarget}</span>
            </p>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search exercises..."
                value={swapSearch}
                onChange={(e) => setSwapSearch(e.target.value)}
                autoFocus
                className="w-full bg-surface-light border border-surface-lighter rounded-lg pl-9 pr-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            {swapMuscleGroup && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  {showAllMuscleGroups ? 'All exercises' : `${swapMuscleGroup} exercises`}
                </span>
                <button
                  onClick={() => setShowAllMuscleGroups((v) => !v)}
                  className="text-[10px] text-accent hover:text-accent-light font-medium touch-manipulation"
                >
                  {showAllMuscleGroups ? 'Same muscle only' : 'Show all'}
                </button>
              </div>
            )}
            <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-0.5">
              {swapLoading ? (
                <p className="text-xs text-text-muted text-center py-4">Loading catalog...</p>
              ) : filteredCatalog.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-4">
                  {swapSearch ? 'No matching exercises' : 'No exercises found'}
                </p>
              ) : (
                filteredCatalog.map((ex) => {
                  const name = typeof ex === 'string' ? ex : ex.name || ex.exercise_name || '';
                  const mg = typeof ex === 'string' ? '' : ex.muscle_group || '';
                  return (
                    <button
                      key={name}
                      onClick={() => handleSwapSelect(name)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-text hover:bg-surface-light transition-colors touch-manipulation flex items-center gap-2"
                    >
                      <span className="truncate">{name}</span>
                      {showAllMuscleGroups && mg && (
                        <span className="text-[9px] text-text-muted bg-surface-light px-1.5 py-0.5 rounded shrink-0">{mg}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plate Calculator Modal */}
      {plateCalcWeight != null && plateCalcWeight > 0 && (
        <PlateCalculator
          targetWeight={plateCalcWeight}
          units={units}
          unitLabel={unitLabel}
          onClose={() => setPlateCalcWeight(null)}
        />
      )}

      {/* Undo Snackbar */}
      {undoInfo && (
        <div className="fixed bottom-6 left-4 right-4 z-40 flex items-center justify-between bg-surface-light border border-surface-lighter rounded-xl px-4 py-3 shadow-lg max-w-md mx-auto">
          <span className="text-sm text-text">Session saved</span>
          <button
            onClick={handleUndo}
            className="text-sm font-semibold text-accent hover:text-accent-light touch-manipulation"
          >
            UNDO
          </button>
        </div>
      )}

      {/* PR Celebration Overlay */}
      {prList.length > 0 && (
        <PRCelebration prs={prList} onClose={() => setPrList([])} convert={convert} unitLabel={unitLabel} />
      )}
    </div>
  );
}

function PRCelebration({ prs, onClose, convert, unitLabel }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-warning/30 rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl animate-in">
        <div className="flex justify-end">
          <button onClick={onClose} className="text-text-muted hover:text-text p-1 touch-manipulation">
            <X size={20} />
          </button>
        </div>
        <div className="text-center mb-4">
          <Trophy size={48} className="text-warning mx-auto mb-2" />
          <h3 className="text-xl font-bold text-warning">New PR!</h3>
          <p className="text-xs text-text-muted mt-1">Personal record{prs.length > 1 ? 's' : ''} set this session</p>
        </div>
        <div className="space-y-3">
          {prs.map((pr, i) => (
            <div key={i} className="bg-warning/10 border border-warning/20 rounded-lg p-3">
              <p className="text-sm font-semibold text-text">{pr.exercise}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg font-bold text-warning">{convert(pr.new_e1rm)} {unitLabel}</span>
                <span className="text-xs text-text-muted">e1RM</span>
                {pr.previous_e1rm != null && (
                  <span className="ml-auto text-xs text-success font-medium">
                    +{(convert(pr.new_e1rm) - convert(pr.previous_e1rm)).toFixed(1)} {unitLabel}
                  </span>
                )}
                {pr.previous_e1rm == null && (
                  <span className="ml-auto text-xs text-text-muted">First log!</span>
                )}
              </div>
              {pr.previous_e1rm != null && (
                <p className="text-[10px] text-text-muted mt-1">
                  Previous best: {convert(pr.previous_e1rm)} {unitLabel}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricInput({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-text-muted mb-1.5 block">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-base text-text focus:ring-1 focus:ring-accent outline-none"
      />
    </div>
  );
}
