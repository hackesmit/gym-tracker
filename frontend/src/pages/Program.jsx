import { useEffect, useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, Pause, Play, XCircle,
  Dumbbell, Clock, Hash, Gauge, MessageSquare, ArrowLeftRight,
  Link as LinkIcon, AlertCircle,
} from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { getSchedule, getTracker, updateProgramStatus } from '../api/client';

const STATUS_STYLES = {
  active: 'bg-success/15 text-success',
  paused: 'bg-warning/15 text-warning',
  completed: 'bg-primary/15 text-primary-light',
  abandoned: 'bg-danger/15 text-danger',
};

export default function Program() {
  const { activeProgram, refreshPrograms } = useApp();
  const [schedule, setSchedule] = useState(null);
  const [tracker, setTracker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!activeProgram) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, t] = await Promise.all([
          getSchedule(activeProgram.id),
          getTracker(activeProgram.id).catch(() => null),
        ]);
        setSchedule(s);
        setTracker(t);
        // Auto-expand current week
        if (t?.current_week) {
          setExpandedWeeks({ [t.current_week]: true });
        }
      } catch (err) {
        setError(err.message || 'Failed to load program');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeProgram]);

  const toggleWeek = (week) => {
    setExpandedWeeks((prev) => ({ ...prev, [week]: !prev[week] }));
  };

  const handleStatusChange = async (newStatus) => {
    if (!activeProgram || updating) return;
    const confirmMsg = {
      paused: 'Pause this program?',
      active: 'Resume this program?',
      abandoned: 'Abandon this program? This cannot be undone.',
    }[newStatus];
    if (!window.confirm(confirmMsg)) return;

    setUpdating(true);
    try {
      await updateProgramStatus(activeProgram.id, newStatus);
      await refreshPrograms();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const weekNumbers = useMemo(() => {
    if (!schedule?.schedule) return [];
    return Object.keys(schedule.schedule)
      .map(Number)
      .sort((a, b) => a - b);
  }, [schedule]);

  const currentStatus = schedule?.status || activeProgram?.status || 'active';

  if (loading) return <LoadingSpinner text="Loading program..." />;

  if (!activeProgram) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card title="No Program">
          <p className="text-text-muted text-sm">
            No active program found. Import a program from the Dashboard to get started.
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card>
          <div className="flex items-center gap-3 text-danger">
            <AlertCircle size={20} />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{schedule?.program_name || activeProgram.name}</h2>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[currentStatus] || STATUS_STYLES.active}`}>
              {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
            </span>
          </div>
          <p className="text-text-muted text-sm mt-1">
            {schedule?.frequency || activeProgram.frequency}x per week
            {tracker && ` \u00B7 Week ${tracker.current_week} of ${tracker.total_weeks}`}
          </p>
        </div>

        {/* Lifecycle buttons */}
        <div className="flex items-center gap-2">
          {currentStatus === 'active' && (
            <>
              <button
                onClick={() => handleStatusChange('paused')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-surface-light text-warning hover:bg-surface-lighter transition-colors disabled:opacity-50"
              >
                <Pause size={14} /> Pause
              </button>
              <button
                onClick={() => handleStatusChange('abandoned')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-surface-light text-danger hover:bg-surface-lighter transition-colors disabled:opacity-50"
              >
                <XCircle size={14} /> Abandon
              </button>
            </>
          )}
          {currentStatus === 'paused' && (
            <>
              <button
                onClick={() => handleStatusChange('active')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                <Play size={14} /> Resume
              </button>
              <button
                onClick={() => handleStatusChange('abandoned')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-surface-light text-danger hover:bg-surface-lighter transition-colors disabled:opacity-50"
              >
                <XCircle size={14} /> Abandon
              </button>
            </>
          )}
        </div>
      </div>

      {/* Adherence bar */}
      {tracker && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-muted">Program Adherence</span>
            <span className="text-sm font-medium text-primary-light">
              {tracker.adherence_pct != null ? `${Math.round(tracker.adherence_pct)}%` : '--'}
            </span>
          </div>
          <div className="w-full bg-surface-lighter rounded-full h-2.5">
            <div
              className="bg-primary rounded-full h-2.5 transition-all"
              style={{ width: `${Math.min(tracker.adherence_pct || 0, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-text-muted">
            <span>{tracker.completed} / {tracker.total_sessions} sessions completed</span>
          </div>
        </Card>
      )}

      {/* Week accordions */}
      <div className="space-y-3">
        {weekNumbers.map((weekNum) => {
          const isCurrentWeek = tracker?.current_week === weekNum;
          const isExpanded = expandedWeeks[weekNum];
          const sessions = schedule.schedule[weekNum];

          return (
            <div
              key={weekNum}
              className={`rounded-xl border transition-colors ${
                isCurrentWeek
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-surface-lighter bg-surface'
              }`}
            >
              {/* Week header */}
              <button
                onClick={() => toggleWeek(weekNum)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown size={18} className="text-text-muted" />
                  ) : (
                    <ChevronRight size={18} className="text-text-muted" />
                  )}
                  <span className="font-semibold">Week {weekNum}</span>
                  {isCurrentWeek && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary-light">
                      Current
                    </span>
                  )}
                </div>
                <span className="text-xs text-text-muted">
                  {Object.keys(sessions).length} session{Object.keys(sessions).length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Week content */}
              {isExpanded && (
                <div className="px-5 pb-5 space-y-4">
                  {Object.entries(sessions).map(([sessionName, exercises]) => (
                    <SessionBlock
                      key={sessionName}
                      sessionName={sessionName}
                      exercises={exercises}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {weekNumbers.length === 0 && (
        <Card>
          <p className="text-text-muted text-sm text-center py-4">
            No schedule data available for this program.
          </p>
        </Card>
      )}
    </div>
  );
}

function SessionBlock({ sessionName, exercises }) {
  // Group exercises by superset_group
  const grouped = useMemo(() => {
    const groups = [];
    let currentSuperset = null;

    exercises
      .slice()
      .sort((a, b) => a.exercise_order - b.exercise_order)
      .forEach((ex) => {
        if (ex.is_superset && ex.superset_group) {
          if (currentSuperset && currentSuperset.group === ex.superset_group) {
            currentSuperset.items.push(ex);
          } else {
            currentSuperset = { group: ex.superset_group, items: [ex] };
            groups.push({ type: 'superset', data: currentSuperset });
          }
        } else {
          currentSuperset = null;
          groups.push({ type: 'single', data: ex });
        }
      });

    return groups;
  }, [exercises]);

  return (
    <div className="bg-surface-light rounded-lg border border-surface-lighter">
      <div className="px-4 py-3 border-b border-surface-lighter">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-muted flex items-center gap-2">
          <Dumbbell size={14} />
          {sessionName}
        </h4>
      </div>
      <div className="divide-y divide-surface-lighter">
        {grouped.map((entry, i) => {
          if (entry.type === 'superset') {
            return (
              <div key={i} className="relative">
                <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-primary/30 rounded-full" />
                <div className="pl-1">
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-primary-light flex items-center gap-1">
                      <LinkIcon size={10} /> Superset
                    </span>
                  </div>
                  {entry.data.items.map((ex) => (
                    <ExerciseRow key={ex.id} exercise={ex} />
                  ))}
                </div>
              </div>
            );
          }
          return <ExerciseRow key={entry.data.id} exercise={entry.data} />;
        })}
      </div>
    </div>
  );
}

function ExerciseRow({ exercise }) {
  const [showDetails, setShowDetails] = useState(false);

  const ex = exercise;
  const hasSubs = ex.substitution_1 || ex.substitution_2;
  const hasNotes = ex.notes;
  const hasExtra = hasSubs || hasNotes;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-mono w-5 shrink-0">
              {ex.exercise_order}.
            </span>
            <span className="text-sm font-medium truncate">{ex.exercise_name}</span>
          </div>
          {/* Compact stats row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 ml-7">
            {ex.warm_up_sets && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Hash size={10} /> {ex.warm_up_sets} warm-up
              </span>
            )}
            <span className="text-xs text-text-muted flex items-center gap-1">
              <Hash size={10} /> {ex.working_sets} x {ex.prescribed_reps}
            </span>
            {ex.prescribed_rpe && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Gauge size={10} /> RPE {ex.prescribed_rpe}
              </span>
            )}
            {ex.rest_period && (
              <span className="text-xs text-text-muted flex items-center gap-1">
                <Clock size={10} /> {ex.rest_period}
              </span>
            )}
          </div>
        </div>

        {hasExtra && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-text-muted hover:text-text transition-colors shrink-0 mt-0.5"
            title="Show details"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${showDetails ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Expandable details */}
      {showDetails && hasExtra && (
        <div className="mt-2 ml-7 space-y-1.5">
          {hasNotes && (
            <div className="flex items-start gap-1.5 text-xs text-text-muted">
              <MessageSquare size={10} className="mt-0.5 shrink-0" />
              <span>{ex.notes}</span>
            </div>
          )}
          {hasSubs && (
            <div className="flex items-start gap-1.5 text-xs text-text-muted">
              <ArrowLeftRight size={10} className="mt-0.5 shrink-0" />
              <span>
                Subs: {[ex.substitution_1, ex.substitution_2].filter(Boolean).join(' / ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
