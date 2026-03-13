import { useEffect, useState } from 'react';
import {
  Dumbbell, ChevronLeft, ChevronRight, Check, Timer,
  Plus, Minus, Save,
} from 'lucide-react';
import Card from '../components/Card';
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
  const { activeProgram, convert, unitLabel, units } = useApp();
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
        })),
      };
      await logBulkSession(payload);
      setSaved(true);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Log Workout</h2>
        <div className="flex gap-1 bg-surface-light rounded-lg p-1">
          <button onClick={() => setTab('workout')}
            className={`px-3 py-1.5 rounded text-xs font-medium ${tab === 'workout' ? 'bg-primary text-white' : 'text-text-muted'}`}>
            Workout
          </button>
          <button onClick={() => setTab('metrics')}
            className={`px-3 py-1.5 rounded text-xs font-medium ${tab === 'metrics' ? 'bg-primary text-white' : 'text-text-muted'}`}>
            Body Metrics
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
            <div className="space-y-3">
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
                className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary-dark transition-colors">
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
              className="p-1.5 rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium">Week {currentWeek}</span>
            <button onClick={() => changeWeek(currentWeek + 1)} disabled={currentWeek >= (activeProgram?.total_weeks || 12)}
              className="p-1.5 rounded-lg bg-surface-light text-text-muted hover:text-text disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Session selector */}
          {sessions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {sessions.map((s) => (
                <button
                  key={s.session_name}
                  onClick={() => { setSelectedSession(s); setSaved(false); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedSession?.session_name === s.session_name
                      ? 'bg-primary text-white' : 'bg-surface-light text-text-muted hover:text-text'
                  }`}
                >
                  {s.session_name}
                </button>
              ))}
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
                  className="mt-4 text-sm text-primary hover:text-primary-light">
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
                  <div className={dg.type === 'superset' ? 'border border-primary/20 rounded-xl p-3 space-y-3' : ''}>
                    {dg.exercises.map((group) => (
                      <Card key={group.name}>
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <Dumbbell size={14} className="text-primary-light" />
                          {group.name}
                          {group.rest_period && group.rest_period !== '0 MINS' && (
                            <span className="ml-auto text-[10px] text-text-muted flex items-center gap-1">
                              <Timer size={10} /> {group.rest_period}
                            </span>
                          )}
                        </h4>
                        <div className="space-y-2">
                          <div className="grid grid-cols-[auto_1fr_1fr_80px] gap-2 text-[10px] text-text-muted uppercase tracking-wider px-1">
                            <span>Set</span>
                            <span>{unitLabel}</span>
                            <span>Reps</span>
                            <span>RPE</span>
                          </div>
                          {group.sets.map((s) => (
                            <div key={s.idx} className="grid grid-cols-[auto_1fr_1fr_80px] gap-2 items-center">
                              <span className="text-xs text-text-muted w-6 text-center">{s.set_number}</span>
                              <input
                                type="number"
                                value={s.load_kg}
                                onChange={(e) => updateSet(s.idx, 'load_kg', e.target.value)}
                                className="bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm text-text w-full focus:ring-1 focus:ring-primary outline-none"
                                placeholder="0"
                              />
                              <input
                                type="number"
                                value={s.reps_completed}
                                onChange={(e) => updateSet(s.idx, 'reps_completed', e.target.value)}
                                className="bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm text-text w-full focus:ring-1 focus:ring-primary outline-none"
                                placeholder="0"
                              />
                              <input
                                type="number"
                                step="0.5"
                                value={s.rpe_actual}
                                onChange={(e) => updateSet(s.idx, 'rpe_actual', e.target.value)}
                                className="bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm text-text w-full focus:ring-1 focus:ring-primary outline-none"
                                placeholder="--"
                              />
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}

              <button
                onClick={handleSave}
                disabled={saving || !sets.some((s) => s.load_kg > 0)}
                className="w-full py-3 rounded-xl bg-primary text-white font-medium disabled:opacity-50 hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Session'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function MetricInput({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-text-muted mb-1 block">{label}</label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm text-text focus:ring-1 focus:ring-primary outline-none"
      />
    </div>
  );
}
