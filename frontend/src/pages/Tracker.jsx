import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, SkipForward, Circle, XCircle, Calendar as CalIcon,
  Grid3X3, ChevronRight, Dumbbell, Download,
} from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { useApp } from '../context/AppContext';
import { getTracker, getCalendar, getAdherence } from '../api/client';
import { exportToCSV } from '../utils/export';

const STATUS_ICONS = {
  completed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/20' },
  partial: { icon: CheckCircle2, color: 'text-warning', bg: 'bg-warning/20' },
  skipped: { icon: SkipForward, color: 'text-warning', bg: 'bg-warning/20' },
  missed: { icon: XCircle, color: 'text-danger', bg: 'bg-danger/20' },
  pending: { icon: Circle, color: 'text-text-muted', bg: 'bg-surface-lighter' },
  upcoming: { icon: Circle, color: 'text-text-muted', bg: 'bg-surface-lighter' },
};

export default function Tracker() {
  const { activeProgram } = useApp();
  const [tracker, setTracker] = useState(null);
  const [adherence, setAdherence] = useState(null);
  const [view, setView] = useState('grid'); // grid | calendar
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeProgram) { setLoading(false); return; }
    const load = async () => {
      try {
        const [t, a] = await Promise.all([
          getTracker(activeProgram.id),
          getAdherence(activeProgram.id),
        ]);
        setTracker(t);
        setAdherence(a);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeProgram]);

  if (loading) return <LoadingSpinner />;
  if (!activeProgram) return (
    <div className="text-center py-12">
      <p className="text-text-muted">No active program. Import one from the Dashboard.</p>
      <Link to="/" className="text-primary text-sm mt-2 inline-block">Go to Dashboard</Link>
    </div>
  );
  if (error) return <ErrorMessage message={error} />;

  // Backend returns weeks as { "1": [...], "2": [...] } object and flat fields
  const currentWeek = tracker?.current_week;
  const weeksObj = tracker?.weeks || {};
  const weeks = Object.entries(weeksObj)
    .map(([num, sessions]) => ({ week_number: parseInt(num, 10), sessions }))
    .sort((a, b) => a.week_number - b.week_number);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Program Tracker</h2>
          <p className="text-text-muted text-sm mt-1">{activeProgram.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {weeks.length > 0 && (
            <button
              onClick={() => {
                const rows = weeks.flatMap((w) =>
                  w.sessions.map((s) => ({
                    week: w.week_number,
                    session_name: s.session_name,
                    status: s.status,
                    date: s.date || '',
                  }))
                );
                exportToCSV(rows, `tracker_${activeProgram.name.replace(/\s+/g, '_')}`, ['week', 'session_name', 'status', 'date']);
              }}
              className="text-xs text-primary hover:text-primary-light flex items-center gap-1"
            >
              <Download size={12} />
              Export
            </button>
          )}
        <div className="flex gap-1 bg-surface-light rounded-lg p-1">
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              view === 'grid' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            <Grid3X3 size={14} />
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              view === 'calendar' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            <CalIcon size={14} />
          </button>
        </div>
        </div>
      </div>

      {/* Adherence stats */}
      {adherence && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Completion" value={`${Math.round(adherence.completion_rate || 0)}%`} />
          <StatCard label="Sessions Done" value={adherence.total_completed ?? 0} />
          <StatCard label="Current Streak" value={adherence.current_streak ?? 0} />
          <StatCard label="Longest Streak" value={adherence.longest_streak ?? 0} />
        </div>
      )}

      {/* Week grid */}
      {view === 'grid' && (
        <div className="space-y-3">
          {weeks.map((week) => (
            <Card key={week.week_number} className={
              week.week_number === currentWeek ? 'ring-1 ring-primary/50' : ''
            }>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">
                  Week {week.week_number}
                  {week.week_number === currentWeek && (
                    <span className="ml-2 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">Current</span>
                  )}
                </h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {week.sessions.map((session, idx) => {
                  const st = STATUS_ICONS[session.status] || STATUS_ICONS.pending;
                  const Icon = st.icon;
                  return (
                    <div key={idx} className={`${st.bg} rounded-lg p-3 flex items-center gap-2`}>
                      <Icon size={16} className={st.color} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{session.session_name}</p>
                        {session.date && <p className="text-[10px] text-text-muted">{session.date}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Calendar view */}
      {view === 'calendar' && (
        <CalendarView programId={activeProgram.id} />
      )}
    </div>
  );
}

function CalendarView({ programId }) {
  const [cal, setCal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCalendar(programId)
      .then(setCal)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [programId]);

  if (loading) return <LoadingSpinner />;
  const sessions = cal?.calendar || [];
  if (!sessions.length) return <p className="text-text-muted text-sm text-center py-8">No session dates recorded yet.</p>;

  return (
    <Card title="Session Calendar">
      <div className="space-y-2">
        {sessions.map((s, i) => {
          const st = STATUS_ICONS[s.status] || STATUS_ICONS.pending;
          const Icon = st.icon;
          return (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <Icon size={14} className={st.color} />
              <span className="text-xs text-text-muted w-20">{s.date}</span>
              <span className="text-sm">{s.session_name}</span>
              <span className={`ml-auto text-xs ${st.color}`}>{s.status}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StatCard({ label, value }) {
  return (
    <Card>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </Card>
  );
}
