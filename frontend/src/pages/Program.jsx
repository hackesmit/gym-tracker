import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, Pause, Play, XCircle, CheckCircle2, Eye,
  Dumbbell, Clock, Hash, Gauge, MessageSquare, ArrowLeftRight,
  Link as LinkIcon, AlertCircle, Circle, SkipForward, Loader2,
  Share2, Upload,
} from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import ProgramBuilder from '../components/ProgramBuilder';
import ProgramUpload from '../components/ProgramUpload';
import ProgramShareModal from '../components/ProgramShareModal';
import ImportSharedProgram from '../components/ImportSharedProgram';
import { useApp } from '../context/AppContext';
import { getSchedule, getTracker, getTrackerWeek, updateProgramStatus } from '../api/client';
import { useT } from '../i18n';

const STATUS_STYLES = {
  active: 'bg-success/15 text-success',
  paused: 'bg-warning/15 text-warning',
  completed: 'bg-accent/15 text-accent-light',
  abandoned: 'bg-danger/15 text-danger',
};

export default function Program() {
  const { activeProgram, refreshPrograms } = useApp();
  const t = useT();
  const [schedule, setSchedule] = useState(null);
  const [tracker, setTracker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [weekLogs, setWeekLogs] = useState({});       // { weekNum: { sessions: [...] } }
  const [weekLogsLoading, setWeekLogsLoading] = useState({}); // { weekNum: bool }
  const [updating, setUpdating] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

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
        // Auto-expand current week and fetch its logs
        if (t?.current_week) {
          setExpandedWeeks({ [t.current_week]: true });
          // Fetch week logs for current week
          getTrackerWeek(activeProgram.id, t.current_week)
            .then((data) => setWeekLogs((prev) => ({ ...prev, [t.current_week]: data })))
            .catch(() => {});
        }
      } catch (err) {
        setError(err.message || 'Failed to load program');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeProgram]);

  const fetchWeekLogs = useCallback(async (weekNum) => {
    if (!activeProgram || weekLogs[weekNum] || weekLogsLoading[weekNum]) return;
    setWeekLogsLoading((prev) => ({ ...prev, [weekNum]: true }));
    try {
      const data = await getTrackerWeek(activeProgram.id, weekNum);
      setWeekLogs((prev) => ({ ...prev, [weekNum]: data }));
    } catch {
      // Silently fail — user just won't see logged data
      setWeekLogs((prev) => ({ ...prev, [weekNum]: null }));
    } finally {
      setWeekLogsLoading((prev) => ({ ...prev, [weekNum]: false }));
    }
  }, [activeProgram, weekLogs, weekLogsLoading]);

  const toggleWeek = (week) => {
    const willExpand = !expandedWeeks[week];
    setExpandedWeeks((prev) => ({ ...prev, [week]: willExpand }));
    if (willExpand) {
      fetchWeekLogs(week);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!activeProgram || updating) return;
    const confirmMsg = {
      paused: 'Pause this program?',
      active: 'Resume this program?',
      completed: 'Complete this program? This cannot be undone.',
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
      <div className="max-w-xl mx-auto mt-6 space-y-4">
        <Card title={t('program.noActive')}>
          <p className="text-text-muted text-sm mb-4">
            {t('program.importDesc')}
          </p>
          <button
            onClick={() => setShowBuilder(true)}
            className="w-full py-3 rounded-lg bg-accent text-surface font-semibold text-sm mb-3"
          >
            {t('program.createCustom')}
          </button>
          <div className="pt-3 border-t border-surface-lighter">
            <p className="text-xs text-text-muted mb-2">{t('program.importTitle')}</p>
            <ProgramUpload onUploaded={() => { refreshPrograms(); }} />
          </div>
          <div className="pt-3 mt-3 border-t border-surface-lighter">
            <p className="text-xs text-text-muted mb-2">Import a shared program</p>
            <ImportSharedProgram onImported={() => refreshPrograms()} />
          </div>
        </Card>

        {showBuilder && (
          <ProgramBuilder
            onClose={() => setShowBuilder(false)}
            onCreated={() => { setShowBuilder(false); refreshPrograms(); }}
          />
        )}
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
      {showBuilder && (
        <ProgramBuilder
          onClose={() => setShowBuilder(false)}
          onCreated={() => { setShowBuilder(false); refreshPrograms(); }}
        />
      )}
      {showShare && (
        <ProgramShareModal
          program={activeProgram}
          onClose={() => setShowShare(false)}
          onChange={() => refreshPrograms()}
        />
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">{schedule?.program_name || activeProgram.name}</h2>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[currentStatus] || STATUS_STYLES.active}`}>
              {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
            </span>
          </div>
          <p className="text-text-muted text-sm mt-1">
            {schedule?.frequency || activeProgram.frequency}x per week
            {tracker && ` \u00B7 Week ${tracker.current_week} of ${tracker.total_weeks}`}
          </p>
          <p className="text-text-muted text-[11px] mt-1.5 flex items-center gap-1.5">
            <AlertCircle size={12} className="shrink-0 text-info" />
            To change training frequency, re-import your program or create a new custom one.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => setShowBuilder(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10"
            >
              {t('program.createAnother')}
            </button>
            <button
              onClick={() => setShowUpload((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 flex items-center gap-1"
            >
              <Upload size={12} /> {showUpload ? 'Hide re-import' : 'Re-import from Excel'}
            </button>
            <button
              onClick={() => setShowShare(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 flex items-center gap-1"
            >
              <Share2 size={12} /> {activeProgram.share_code ? 'Sharing on' : 'Share'}
            </button>
          </div>
          {showUpload && (
            <div className="mt-3 max-w-md stone-panel p-3">
              <p className="text-xs text-text-muted mb-2">
                Uploading a new spreadsheet will pause this program and activate the new one.
              </p>
              <ProgramUpload />
            </div>
          )}
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
                onClick={() => handleStatusChange('completed')}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-surface-light text-accent-light hover:bg-surface-lighter transition-colors disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> Complete
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
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-dark transition-colors disabled:opacity-50"
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
          {(currentStatus === 'completed' || currentStatus === 'abandoned') && (
            <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-surface-light text-text-muted">
              <Eye size={14} /> View Only
            </span>
          )}
        </div>
      </div>

      {/* Adherence bar */}
      {tracker && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-muted">Program Adherence</span>
            <span className="text-sm font-medium text-accent-light">
              {tracker.adherence_pct != null ? `${Math.round(tracker.adherence_pct)}%` : '--'}
            </span>
          </div>
          <div className="w-full bg-surface-lighter rounded-full h-2.5">
            <div
              className="bg-accent rounded-full h-2.5 transition-all"
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
          const sessions = schedule?.schedule?.[weekNum];

          return (
            <div
              key={weekNum}
              className={`rounded-xl border transition-colors ${
                isCurrentWeek
                  ? 'border-accent/40 bg-accent/5'
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
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent-light">
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
                  {weekLogsLoading[weekNum] && (
                    <div className="flex items-center justify-center py-3 gap-2 text-text-muted text-sm">
                      <Loader2 size={14} className="animate-spin" />
                      Loading logged data...
                    </div>
                  )}
                  {Object.entries(sessions).map(([sessionName, exercises]) => {
                    // Find matching session log data
                    const weekData = weekLogs[weekNum];
                    const sessionLog = weekData?.sessions?.find(
                      (s) => s.session_name === sessionName
                    );
                    return (
                      <SessionBlock
                        key={sessionName}
                        sessionName={sessionName}
                        exercises={exercises}
                        sessionLog={sessionLog}
                      />
                    );
                  })}
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

const SESSION_STATUS_CONFIG = {
  completed: { icon: CheckCircle2, color: 'text-success', label: 'Completed' },
  partial: { icon: CheckCircle2, color: 'text-warning', label: 'Partial' },
  skipped: { icon: SkipForward, color: 'text-warning', label: 'Skipped' },
  missed: { icon: XCircle, color: 'text-danger', label: 'Missed' },
  pending: { icon: Circle, color: 'text-text-muted', label: 'Pending' },
};

function SessionBlock({ sessionName, exercises, sessionLog }) {
  // Group exercises by superset_group
  const grouped = useMemo(() => {
    const groups = [];
    let currentSuperset = null;

    (exercises || [])
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

  // Build a lookup of logged data by exercise name
  const loggedByExercise = useMemo(() => {
    if (!sessionLog?.exercises) return {};
    const map = {};
    for (const ex of sessionLog.exercises) {
      map[ex.exercise_name] = ex.logged || [];
    }
    return map;
  }, [sessionLog]);

  const status = sessionLog?.status;
  const statusConfig = SESSION_STATUS_CONFIG[status] || null;
  const StatusIcon = statusConfig?.icon;

  return (
    <div className="bg-surface-light rounded-lg border border-surface-lighter">
      <div className="px-4 py-3 border-b border-surface-lighter flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-text-muted flex items-center gap-2">
          <Dumbbell size={14} />
          {sessionName}
        </h4>
        {statusConfig && (
          <div className={`flex items-center gap-1.5 text-xs font-medium ${statusConfig.color}`}>
            <StatusIcon size={14} />
            <span>{statusConfig.label}</span>
            {sessionLog?.date && (
              <span className="text-text-muted ml-1">{sessionLog.date}</span>
            )}
          </div>
        )}
      </div>
      <div className="divide-y divide-surface-lighter">
        {grouped.map((entry, i) => {
          if (entry.type === 'superset') {
            return (
              <div key={i} className="relative">
                <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-accent/30 rounded-full" />
                <div className="pl-1">
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-accent-light flex items-center gap-1">
                      <LinkIcon size={10} /> Superset
                    </span>
                  </div>
                  {entry.data.items.map((ex) => (
                    <ExerciseRow
                      key={ex.id}
                      exercise={ex}
                      loggedSets={loggedByExercise[ex.exercise_name_canonical || ex.exercise_name] || []}
                    />
                  ))}
                </div>
              </div>
            );
          }
          return (
            <ExerciseRow
              key={entry.data.id}
              exercise={entry.data}
              loggedSets={loggedByExercise[entry.data.exercise_name_canonical || entry.data.exercise_name] || []}
            />
          );
        })}
      </div>
    </div>
  );
}

function ExerciseRow({ exercise, loggedSets = [] }) {
  const [showDetails, setShowDetails] = useState(false);

  const ex = exercise;
  const hasSubs = ex.substitution_1 || ex.substitution_2;
  const hasNotes = ex.notes;
  const hasLogged = loggedSets.length > 0;
  const hasExtra = hasSubs || hasNotes || hasLogged;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-mono w-5 shrink-0">
              {ex.exercise_order}.
            </span>
            <span className="text-sm font-medium truncate">{ex.exercise_name}</span>
            {hasLogged && (
              <CheckCircle2 size={12} className="text-success shrink-0" />
            )}
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
          {/* Logged sets */}
          {hasLogged && (
            <div className="mt-1 mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-success mb-1.5">
                Logged Sets
              </div>
              <div className="grid gap-1">
                {loggedSets.map((set) => (
                  <div
                    key={set.set_number}
                    className="flex items-center gap-3 bg-success/5 border border-success/10 rounded-md px-3 py-1.5"
                  >
                    <span className="text-[10px] text-text-muted font-mono w-6">
                      S{set.set_number}
                    </span>
                    {set.load_kg != null && (
                      <span className="text-xs font-medium text-text">
                        {set.load_kg} kg
                      </span>
                    )}
                    {set.reps != null && (
                      <span className="text-xs text-text-muted">
                        {set.reps} reps
                      </span>
                    )}
                    {set.rpe != null && (
                      <span className="text-xs text-text-muted">
                        RPE {set.rpe}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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
