import { useEffect, useState } from 'react';
import { displayToKg } from '../utils/units';
import { Calendar, ChevronDown, ChevronUp, Clock, Dumbbell, Trophy, Trash2, Pencil, Check, X } from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getCalendar, getTrackerWeek, undoSession, updateSessionDate, updateSet } from '../api/client';
import { Chronicle as ChronicleIcon } from '../components/LotrIcons';

const STATUS_STYLES = {
  completed: 'bg-success/20 text-success',
  partial: 'bg-warning/20 text-warning',
  skipped: 'bg-error/20 text-error',
};

const STATUS_LABELS = {
  completed: 'Completed',
  partial: 'Partial',
  skipped: 'Skipped',
};

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function groupByDate(sessions) {
  const groups = {};
  for (const s of sessions) {
    if (!s.date) continue;
    if (!groups[s.date]) groups[s.date] = [];
    groups[s.date].push(s);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

export default function History() {
  const { activeProgram, convert, unitLabel, units } = useApp();
  const { addToast } = useToast();
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [sessionDetails, setSessionDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});

  // Edit state
  const [editingDate, setEditingDate] = useState(null); // session key being date-edited
  const [dateValue, setDateValue] = useState('');
  const [editingSet, setEditingSet] = useState(null); // { logId, load, reps, rpe }
  const [deleteConfirm, setDeleteConfirm] = useState(null); // session key pending delete

  const reload = () => {
    if (!activeProgram) return;
    setLoading(true);
    getCalendar(activeProgram.id)
      .then((res) => setCalendar(res))
      .catch(() => setCalendar(null))
      .finally(() => setLoading(false));
    setSessionDetails({});
    setExpandedKey(null);
  };

  useEffect(() => {
    if (!activeProgram) {
      setLoading(false);
      return;
    }
    getCalendar(activeProgram.id)
      .then((res) => setCalendar(res))
      .catch(() => setCalendar(null))
      .finally(() => setLoading(false));
  }, [activeProgram]);

  const toggleExpand = async (session) => {
    const key = `${session.date}-${session.session_name}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    setEditingSet(null);
    setEditingDate(null);
    setDeleteConfirm(null);

    if (sessionDetails[key]) return;

    setDetailLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const weekData = await getTrackerWeek(activeProgram.id, session.week);
      const match = weekData.sessions?.find(
        (s) => s.session_name === session.session_name
      );
      setSessionDetails((prev) => ({ ...prev, [key]: match || null }));
    } catch {
      setSessionDetails((prev) => ({ ...prev, [key]: null }));
    } finally {
      setDetailLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleDateSave = async (session) => {
    const sessionLogId = session.id || sessionDetails[`${session.date}-${session.session_name}`]?.session_log_id;
    if (!sessionLogId || !dateValue) return;
    try {
      await updateSessionDate(sessionLogId, dateValue);
      setEditingDate(null);
      reload();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleSetSave = async () => {
    if (!editingSet) return;
    const loadKg = displayToKg(editingSet.load, units);
    try {
      await updateSet(editingSet.logId, {
        load_kg: loadKg,
        reps_completed: +editingSet.reps,
        rpe_actual: editingSet.rpe ? +editingSet.rpe : null,
      });
      // Refresh the expanded session details
      const key = expandedKey;
      setSessionDetails((prev) => ({ ...prev, [key]: undefined }));
      setEditingSet(null);
      // Re-fetch
      const session = calendar.calendar.find(
        (s) => `${s.date}-${s.session_name}` === key
      );
      if (session) {
        const weekData = await getTrackerWeek(activeProgram.id, session.week);
        const match = weekData.sessions?.find(
          (s) => s.session_name === session.session_name
        );
        setSessionDetails((prev) => ({ ...prev, [key]: match || null }));
      }
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (session) => {
    const sessionLogId = session.id || sessionDetails[`${session.date}-${session.session_name}`]?.session_log_id;
    if (!sessionLogId) return;
    try {
      await undoSession(sessionLogId);
      setDeleteConfirm(null);
      reload();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!activeProgram) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ChronicleIcon size={24} className="text-accent" />
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Chronicle</h2>
        </div>
        <Card>
          <p className="text-text-muted text-sm text-center py-8">
            No active program found. Import a program to get started.
          </p>
        </Card>
      </div>
    );
  }

  const entries = calendar?.calendar || [];
  const loggedSessions = entries.filter(
    (s) => s.status === 'completed' || s.status === 'partial' || s.status === 'skipped'
  );

  if (loggedSessions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ChronicleIcon size={24} className="text-accent" />
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Chronicle</h2>
        </div>
        <Card>
          <div className="text-center py-12">
            <Calendar size={40} className="mx-auto text-text-muted mb-3" />
            <p className="text-text-muted text-sm">
              No workout sessions logged yet. Start logging to see your history here.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const grouped = groupByDate(loggedSessions);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Workout History</h2>

      <p className="text-sm text-text-muted">
        {loggedSessions.length} session{loggedSessions.length !== 1 ? 's' : ''} logged
      </p>

      <div className="space-y-4">
        {grouped.map(([date, sessions]) => (
          <Card key={date}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={14} className="text-accent-light" />
              <span className="text-sm font-semibold text-text">
                {formatDate(date)}
              </span>
            </div>

            <div className="space-y-2">
              {sessions.map((session) => {
                const key = `${session.date}-${session.session_name}`;
                const isExpanded = expandedKey === key;
                const detail = sessionDetails[key];
                const isDetailLoading = detailLoading[key];
                const isEditingThisDate = editingDate === key;
                const isDeleteConfirm = deleteConfirm === key;

                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleExpand(session)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-surface-light hover:bg-surface-lighter transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-text truncate">
                            {session.session_name}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              STATUS_STYLES[session.status] || 'bg-surface-lighter text-text-muted'
                            }`}
                          >
                            {STATUS_LABELS[session.status] || session.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-text-muted flex items-center gap-1">
                            <Clock size={10} />
                            Week {session.week}
                          </span>
                          {session.has_pr && (
                            <span className="text-[10px] text-accent flex items-center gap-1">
                              <Trophy size={10} /> A new record was forged
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-text-muted shrink-0" />
                      ) : (
                        <ChevronDown size={16} className="text-text-muted shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 ml-3 pl-3 border-l-2 border-surface-lighter">
                        {/* Session actions bar */}
                        <div className="flex items-center gap-2 py-2 flex-wrap">
                          {isEditingThisDate ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="date"
                                value={dateValue}
                                onChange={(e) => setDateValue(e.target.value)}
                                className="text-xs px-2 py-1 rounded bg-surface border border-surface-lighter text-text"
                              />
                              <button
                                onClick={() => handleDateSave(session)}
                                className="p-1 rounded hover:bg-success/20 text-success"
                                title="Save date"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setEditingDate(null)}
                                className="p-1 rounded hover:bg-error/20 text-error"
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingDate(key);
                                setDateValue(session.date);
                              }}
                              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent px-2 py-1 rounded hover:bg-surface-light transition-colors"
                              title="Edit date"
                            >
                              <Pencil size={10} /> Edit Date
                            </button>
                          )}

                          {isDeleteConfirm ? (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-error">Delete this session?</span>
                              <button
                                onClick={() => handleDelete(session)}
                                className="px-2 py-0.5 rounded bg-error/20 text-error hover:bg-error/30 font-medium"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-2 py-0.5 rounded bg-surface-lighter text-text-muted hover:bg-surface-light"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(key);
                              }}
                              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-error px-2 py-1 rounded hover:bg-surface-light transition-colors"
                              title="Delete session"
                            >
                              <Trash2 size={10} /> Delete
                            </button>
                          )}
                        </div>

                        {isDetailLoading ? (
                          <div className="py-4 flex items-center gap-2 text-text-muted text-xs">
                            <div className="w-3 h-3 border-2 border-accent-light border-t-transparent rounded-full animate-spin" />
                            Loading sets...
                          </div>
                        ) : detail?.exercises?.length > 0 ? (
                          <div className="space-y-3 py-2">
                            {detail.exercises.map((exercise, idx) => (
                              <div key={idx}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Dumbbell size={12} className="text-accent-light" />
                                  <span className="text-xs font-semibold text-text">
                                    {exercise.exercise_name}
                                  </span>
                                  <span className="text-[10px] text-text-muted">
                                    ({exercise.prescribed.sets} x {exercise.prescribed.reps}
                                    {exercise.prescribed.rpe
                                      ? ` @RPE ${exercise.prescribed.rpe}`
                                      : ''}
                                    )
                                  </span>
                                </div>
                                {exercise.logged.length > 0 ? (
                                  <div className="ml-5 space-y-0.5">
                                    {exercise.logged.map((set) => {
                                      const isEditingThis = editingSet?.logId === set.id;
                                      if (isEditingThis) {
                                        return (
                                          <div
                                            key={set.set_number}
                                            className="flex items-center gap-2 text-xs py-0.5"
                                          >
                                            <span className="w-12 text-[10px] text-text-muted">
                                              Set {set.set_number}
                                            </span>
                                            <input
                                              type="number"
                                              value={editingSet.load}
                                              onChange={(e) => setEditingSet((prev) => ({ ...prev, load: e.target.value }))}
                                              className="w-16 px-1.5 py-0.5 rounded bg-surface border border-surface-lighter text-text text-xs"
                                              step="any"
                                            />
                                            <span className="text-[10px] text-text-muted">{unitLabel}</span>
                                            <span className="text-text-muted">x</span>
                                            <input
                                              type="number"
                                              value={editingSet.reps}
                                              onChange={(e) => setEditingSet((prev) => ({ ...prev, reps: e.target.value }))}
                                              className="w-12 px-1.5 py-0.5 rounded bg-surface border border-surface-lighter text-text text-xs"
                                            />
                                            <span className="text-[10px] text-text-muted">@</span>
                                            <input
                                              type="number"
                                              value={editingSet.rpe}
                                              onChange={(e) => setEditingSet((prev) => ({ ...prev, rpe: e.target.value }))}
                                              className="w-12 px-1.5 py-0.5 rounded bg-surface border border-surface-lighter text-text text-xs"
                                              step="0.5"
                                            />
                                            <button
                                              onClick={handleSetSave}
                                              className="p-0.5 rounded hover:bg-success/20 text-success"
                                            >
                                              <Check size={12} />
                                            </button>
                                            <button
                                              onClick={() => setEditingSet(null)}
                                              className="p-0.5 rounded hover:bg-error/20 text-error"
                                            >
                                              <X size={12} />
                                            </button>
                                          </div>
                                        );
                                      }
                                      return (
                                        <div
                                          key={set.set_number}
                                          className="flex items-center gap-3 text-xs text-text-muted group"
                                        >
                                          <span className="w-12 text-[10px] text-text-muted">
                                            Set {set.set_number}
                                          </span>
                                          <span className="text-text font-medium">
                                            {convert(set.load_kg)} {unitLabel}
                                          </span>
                                          <span>x {set.reps} reps</span>
                                          {set.rpe != null && (
                                            <span className="text-accent-light">
                                              @{set.rpe}
                                            </span>
                                          )}
                                          <button
                                            onClick={() => setEditingSet({
                                              logId: set.id,
                                              load: convert(set.load_kg),
                                              reps: set.reps,
                                              rpe: set.rpe || '',
                                            })}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-lighter text-text-muted hover:text-accent transition-opacity"
                                            title="Edit set"
                                          >
                                            <Pencil size={10} />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="ml-5 text-[10px] text-text-muted italic">
                                    No sets logged
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="py-3 text-xs text-text-muted italic">
                            No exercise details available for this session.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
