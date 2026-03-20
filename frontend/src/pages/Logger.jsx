import { useEffect, useState } from 'react';
import {
  Dumbbell, ChevronLeft, ChevronRight, Check, Timer,
  Plus, Minus, Save, Trophy, X, TrendingUp,
} from 'lucide-react';
import Card from '../components/Card';
import RestTimer from '../components/RestTimer';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import {
  getSchedule, getOverloadPlan, logBulkSession, logBodyMetric, getTracker,
} from '../api/client';

/**
 * Transform the nested schedule response into a flat sessions array for a given week.
 * Backend returns: { schedule: { weekNum: { sessionName: [exercises] } } }
 * We need: [{ session_name, exercises: [...] }]
 */
function flattenScheduleForWeek(scheduleResponse, week) {
  const schedule = scheduleResponse?.schedule || {};
  const weekData = schedule[week] || schedule[String(week)] || {};
  return Object.entries(weekData).map(([sessionName, exercises]) => ({
    session_name: sessionName,
    exercises,
  }));
}

export default function Logger() {
  const { activeProgram, unitLabel, units, convert } = useApp();
  const [sessions, setSessions] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [selectedSession, setSelectedSession] = useState(null);
  const [overload, setOverload] = useState(null);
  const [sets, setSets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('workout'); // workout | metrics
  const [scheduleData, setScheduleData] = useState(null);
  const [prList, setPrList] = useState([]);
  const [restTimerTriggers, setRestTimerTriggers] = useState({});

  // Body metrics state
  const [metrics, setMetrics] = useState({
    bodyweight_kg: '', body_fat_pct: '', sleep_hours: '',
    stress_level: '', soreness_level: '',
  });
  const [metricsSaved, setMetricsSaved] = useState(false);

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
    getOverloadPlan(activeProgram.id, currentWeek, selectedSession.session_name)
      .then(setOverload)
      .catch(() => setOverload(null));
  }, [activeProgram, selectedSession, currentWeek]);

  // Initialize sets when session or overload changes
  useEffect(() => {
    if (!selectedSession) return;
    const exercises = selectedSession.exercises || [];
    const newSets = [];
    exercises.forEach((ex) => {
      const exName = ex.exercise_name || ex.exercise_name_canonical;
      const suggestion = overload?.exercises?.find(
        (o) => o.exercise_name === exName
      );
      const suggestedLoad = suggestion?.suggested_load_kg;
      // Convert suggested load for display if in lbs mode
      const displayLoad = suggestedLoad != null
        ? (units === 'lbs' ? +(suggestedLoad * 2.20462).toFixed(1) : suggestedLoad)
        : '';

      // Parse prescribed reps — handle ranges like "8-10"
      const repsStr = ex.prescribed_reps || '';
      const repsMatch = repsStr.match(/(\d+)/);
      const defaultReps = repsMatch ? parseInt(repsMatch[1], 10) : 8;

      for (let s = 1; s <= (ex.working_sets || 3); s++) {
        newSets.push({
          program_exercise_id: ex.id,
          exercise_name: exName,
          set_number: s,
          load_kg: displayLoad,
          reps_completed: defaultReps,
          rpe_actual: ex.prescribed_rpe || '',
          rest_period: ex.rest_period || '',
          is_bodyweight: false,
          is_dropset: false,
          dropset_load_kg: '',
          dropset_reps: '',
          is_superset: ex.is_superset || false,
          superset_group: ex.superset_group || null,
        });
      }
    });
    setSets(newSets);
  }, [selectedSession, overload, units]);

  const updateSet = (idx, field, value) => {
    setSets((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    if (!activeProgram || !selectedSession || !sets.length) return;
    setSaving(true);
    try {
      const payload = {
        program_id: activeProgram.id,
        week: currentWeek,
        session_name: selectedSession.session_name,
        date: new Date().toISOString().split('T')[0],
        sets: sets.filter((s) => s.load_kg > 0).map((s) => ({
          program_exercise_id: s.program_exercise_id,
          set_number: s.set_number,
          load_kg: units === 'lbs' ? +(s.load_kg / 2.20462).toFixed(1) : +s.load_kg,
          reps_completed: +s.reps_completed,
          rpe_actual: s.rpe_actual ? +s.rpe_actual : null,
          is_bodyweight: s.is_bodyweight,
          is_dropset: s.is_dropset,
          dropset_load_kg: s.is_dropset && s.dropset_load_kg
            ? (units === 'lbs' ? +(s.dropset_load_kg / 2.20462).toFixed(1) : +s.dropset_load_kg)
            : null,
        })),
      };
      const result = await logBulkSession(payload);
      setSaved(true);
      if (result.prs && result.prs.length > 0) {
        setPrList(result.prs);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMetricsSave = async () => {
    const data = {
      date: new Date().toISOString().split('T')[0],
      bodyweight_kg: units === 'lbs' ? +(metrics.bodyweight_kg / 2.20462).toFixed(1) : +metrics.bodyweight_kg,
    };
    if (metrics.body_fat_pct) data.body_fat_pct = +metrics.body_fat_pct;
    if (metrics.sleep_hours) data.sleep_hours = +metrics.sleep_hours;
    if (metrics.stress_level) data.stress_level = +metrics.stress_level;
    if (metrics.soreness_level) data.soreness_level = +metrics.soreness_level;

    try {
      await logBodyMetric(data);
      setMetricsSaved(true);
    } catch (err) {
      alert(err.message);
    }
  };

  // Change displayed week
  const changeWeek = (newWeek) => {
    if (!scheduleData || newWeek < 1 || newWeek > (activeProgram?.total_weeks || 12)) return;
    setCurrentWeek(newWeek);
    const flatSessions = flattenScheduleForWeek(scheduleData, newWeek);
    setSessions(flatSessions);
    if (flatSessions.length) setSelectedSession(flatSessions[0]);
    setSaved(false);
  };

  if (loading) return <LoadingSpinner />;

  if (!activeProgram) return (
    <div className="text-center py-12 text-text-muted">
      No active program. Import one from the Dashboard.
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
        <h2 className="text-xl sm:text-2xl font-bold">Log Workout</h2>
        <div className="flex gap-1 bg-surface-light rounded-lg p-1">
          <button onClick={() => setTab('workout')}
            className={`px-3 py-2 sm:px-4 rounded text-xs sm:text-sm font-medium touch-manipulation ${tab === 'workout' ? 'bg-primary text-white' : 'text-text-muted'}`}>
            Workout
          </button>
          <button onClick={() => setTab('metrics')}
            className={`px-3 py-2 sm:px-4 rounded text-xs sm:text-sm font-medium touch-manipulation ${tab === 'metrics' ? 'bg-primary text-white' : 'text-text-muted'}`}>
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
              <MetricInput label={`Bodyweight (${unitLabel})`} value={metrics.bodyweight_kg}
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
                className="w-full py-3 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary-dark transition-colors touch-manipulation">
                Save Metrics
              </button>
            </div>
          )}
        </Card>
      )}

      {tab === 'workout' && (
        <>
          {/* Week selector */}
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => changeWeek(currentWeek - 1)} disabled={currentWeek <= 1}
              className="p-2.5 rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-30 touch-manipulation">
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium min-w-[5rem] text-center">Week {currentWeek}</span>
            <button onClick={() => changeWeek(currentWeek + 1)} disabled={currentWeek >= (activeProgram?.total_weeks || 12)}
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
                      ? 'bg-primary text-white' : 'bg-surface-light text-text-muted hover:text-text'
                  }`}
                >
                  {s.session_name}
                </button>
              ))}
            </div>
          )}

          {/* Overload suggestions banner */}
          {overload?.exercises?.length > 0 && !saved && (
            <div className="bg-primary/10 border border-primary/25 rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-primary-light" />
                <span className="text-xs font-semibold text-primary-light uppercase tracking-wider">Progressive Overload</span>
              </div>
              <div className="space-y-1">
                {overload.exercises.map((ex) => {
                  const displayLoad = ex.suggested_load_kg != null
                    ? (units === 'lbs' ? +(ex.suggested_load_kg * 2.20462).toFixed(1) : ex.suggested_load_kg)
                    : null;
                  return (
                    <div key={ex.exercise_name} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted truncate mr-2">{ex.exercise_name}</span>
                      {displayLoad != null && (
                        <span className="text-primary-light font-medium whitespace-nowrap">
                          {displayLoad} {unitLabel} · {ex.method}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {saved ? (
            <Card>
              <div className="text-center py-8">
                <Check className="text-success mx-auto mb-3" size={40} />
                <p className="text-lg font-medium">Session Logged!</p>
                <p className="text-sm text-text-muted mt-1">
                  {sets.filter((s) => s.load_kg > 0).length} sets recorded for Week {currentWeek}
                </p>
                <button onClick={() => setSaved(false)}
                  className="mt-4 py-2 px-4 text-sm text-primary hover:text-primary-light touch-manipulation">
                  Log another session
                </button>
              </div>
            </Card>
          ) : (
            <>
              {displayGroups.map((dg, dgIdx) => (
                <div key={dgIdx}>
                  {dg.type === 'superset' && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-primary-light font-semibold bg-primary/10 px-2 py-0.5 rounded">
                        Superset {dg.group}
                      </span>
                    </div>
                  )}
                  <div className={dg.type === 'superset' ? 'border border-primary/20 rounded-xl p-2 sm:p-3 space-y-3' : ''}>
                    {dg.exercises.map((group) => (
                      <Card key={group.name} className="!p-3 sm:!p-5">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <Dumbbell size={14} className="text-primary-light shrink-0" />
                          <span className="truncate">{group.name}</span>
                          {group.rest_period && group.rest_period !== '0 MINS' && (
                            <span className="ml-auto text-[10px] text-text-muted flex items-center gap-1 shrink-0">
                              <Timer size={10} /> {group.rest_period}
                            </span>
                          )}
                        </h4>
                        <div className="space-y-2">
                          {/* Set rows */}
                          {group.sets.map((s) => {
                            const triggerTimer = () => setRestTimerTriggers((prev) => ({
                              ...prev, [group.name]: (prev[group.name] || 0) + 1,
                            }));
                            return (
                            <div key={s.idx} className="space-y-1.5">
                              <div className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem_2rem] sm:grid-cols-[2rem_1fr_1fr_5rem_2.5rem] gap-1.5 sm:gap-2 items-end">
                                <span className="text-xs text-text-muted text-center pb-2">{s.set_number}</span>
                                <div className="relative">
                                  <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">{unitLabel}</label>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={s.load_kg}
                                    onChange={(e) => updateSet(s.idx, 'load_kg', e.target.value)}
                                    className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-primary outline-none min-w-0"
                                    placeholder="0"
                                  />
                                </div>
                                <div className="relative">
                                  <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">Reps</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={s.reps_completed}
                                    onChange={(e) => updateSet(s.idx, 'reps_completed', e.target.value)}
                                    onBlur={triggerTimer}
                                    className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-primary outline-none min-w-0"
                                    placeholder="0"
                                  />
                                </div>
                                <div className="relative">
                                  <label className="absolute top-1 left-1.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">RPE</label>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.5"
                                    value={s.rpe_actual}
                                    onChange={(e) => updateSet(s.idx, 'rpe_actual', e.target.value)}
                                    onBlur={triggerTimer}
                                    className="bg-surface-light border border-surface-lighter rounded-lg px-1.5 sm:px-2 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-primary outline-none min-w-0"
                                    placeholder="--"
                                  />
                                </div>
                                <button
                                  onClick={() => updateSet(s.idx, 'is_dropset', !s.is_dropset)}
                                  title="Drop set"
                                  className={`pb-1.5 pt-1 text-[10px] font-bold rounded-lg border transition-colors touch-manipulation ${
                                    s.is_dropset
                                      ? 'border-warning bg-warning/15 text-warning'
                                      : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text'
                                  }`}
                                >
                                  DS
                                </button>
                              </div>
                              {s.is_dropset && (
                                <div className="grid grid-cols-[1.5rem_1fr_1fr] sm:grid-cols-[2rem_1fr_1fr] gap-1.5 sm:gap-2 items-end ml-0">
                                  <span className="text-[9px] text-warning text-center pb-2">↳</span>
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
                          {group.rest_period && group.rest_period !== '0 MINS' && (
                            <div className="mt-2">
                              <RestTimer
                                key={`${group.name}-${restTimerTriggers[group.name] || 0}`}
                                restPeriod={group.rest_period}
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
                  disabled={saving || !sets.some((s) => s.load_kg > 0)}
                  className="w-full py-3.5 rounded-xl bg-primary text-white font-medium disabled:opacity-50 hover:bg-primary-dark transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary/20 touch-manipulation"
                >
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save Session'}
                </button>
              </div>
            </>
          )}
        </>
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
        className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-base text-text focus:ring-1 focus:ring-primary outline-none"
      />
    </div>
  );
}
