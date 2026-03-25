import { useEffect, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Clock, Dumbbell } from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { getCalendar, getTrackerWeek } from '../api/client';

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
  // Sort dates descending (most recent first)
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

export default function History() {
  const { activeProgram, convert, unitLabel } = useApp();
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);
  const [sessionDetails, setSessionDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});

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

    // Already fetched
    if (sessionDetails[key]) return;

    // Fetch week detail to get exercises + logged sets
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

  if (loading) return <LoadingSpinner />;

  if (!activeProgram) {
    return (
      <div className="space-y-6">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Workout History</h2>
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
        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Workout History</h2>
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
                                    {exercise.logged.map((set) => (
                                      <div
                                        key={set.set_number}
                                        className="flex items-center gap-3 text-xs text-text-muted"
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
                                      </div>
                                    ))}
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
