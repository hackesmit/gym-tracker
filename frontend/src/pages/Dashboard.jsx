import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, TrendingUp, Dumbbell, Heart, Trophy, Target,
  ArrowRight, Upload, Calendar, AlertTriangle,
} from 'lucide-react';
import Card from '../components/Card';
import ProgramUpload from '../components/ProgramUpload';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { getSummary, getTracker, getDeloadCheck, getWorkoutToday } from '../api/client';

export default function Dashboard() {
  const { activeProgram, programs, convert, unitLabel } = useApp();
  const [summary, setSummary] = useState(null);
  const [tracker, setTracker] = useState(null);
  const [deload, setDeload] = useState(null);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, t, d, tw] = await Promise.all([
          getSummary().catch(() => null),
          activeProgram ? getTracker(activeProgram.id).catch(() => null) : null,
          getDeloadCheck().catch(() => null),
          getWorkoutToday().catch(() => null),
        ]);
        setSummary(s);
        setTracker(t);
        setDeload(d);
        setTodayWorkout(tw);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeProgram]);

  if (loading) return <LoadingSpinner />;

  if (!programs.length) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card title="Get Started">
          <p className="text-text-muted text-sm mb-4">
            Import your training program spreadsheet to begin tracking.
          </p>
          <ProgramUpload />
        </Card>
      </div>
    );
  }

  // Backend returns fields flat at top level (current_week, completed, etc.)
  const completionPct = tracker?.completed != null
    ? Math.round((tracker.completed / (tracker.total_sessions || 1)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-text-muted text-sm mt-1">
            {activeProgram?.name || 'No active program'}
          </p>
        </div>
        <Link to="/log" className="flex items-center gap-2 px-4 py-2.5 bg-primary rounded-lg text-sm font-medium text-white hover:bg-primary-dark transition-colors">
          <Dumbbell size={16} /> Log Workout
        </Link>
      </div>

      {/* Today's Workout hero card */}
      {todayWorkout && (
        <div className="bg-primary/10 border border-primary/25 rounded-xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-primary-light font-semibold mb-1">Today's Workout</p>
              <h3 className="text-lg font-bold text-text truncate">{todayWorkout.session_name}</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Week {todayWorkout.week} · {todayWorkout.exercises?.length || 0} exercises
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {todayWorkout.exercises?.slice(0, 5).map((ex, i) => (
                  <span key={i} className="text-[10px] bg-surface-light px-2 py-0.5 rounded text-text-muted">
                    {ex.exercise_name || ex.exercise_name_canonical}
                  </span>
                ))}
                {todayWorkout.exercises?.length > 5 && (
                  <span className="text-[10px] text-text-muted">+{todayWorkout.exercises.length - 5} more</span>
                )}
              </div>
            </div>
            <Link to="/log" className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-primary rounded-lg text-sm font-medium text-white hover:bg-primary-dark transition-colors">
              <Dumbbell size={16} /> Start
            </Link>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Dumbbell size={18} />}
          label="Sets Logged"
          value={summary?.total_sets_logged ?? 0}
          color="text-primary-light"
        />
        <KpiCard
          icon={<Target size={18} />}
          label="Exercises"
          value={summary?.unique_exercises_logged ?? 0}
          color="text-info"
        />
        <KpiCard
          icon={<Heart size={18} />}
          label="Recovery"
          value={summary?.recovery_score != null ? `${Math.round(summary.recovery_score)}%` : '--'}
          color={
            summary?.recovery_score >= 70 ? 'text-success' :
            summary?.recovery_score >= 40 ? 'text-warning' : 'text-danger'
          }
        />
        <KpiCard
          icon={<Trophy size={18} />}
          label="Recent PRs"
          value={summary?.recent_prs?.length ?? 0}
          color="text-warning"
        />
      </div>

      {/* Deload warning */}
      {deload?.deload_recommended && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-warning mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-warning uppercase tracking-wider mb-2">
                Deload Recommended
              </h3>
              <ul className="text-sm text-text-muted space-y-1 mb-3">
                {deload.reasons?.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
              {deload.stagnated_exercises?.length > 0 && (
                <p className="text-xs text-text-muted mb-2">
                  Stagnated: {deload.stagnated_exercises.join(', ')}
                </p>
              )}
              {deload.suggestion && (
                <p className="text-sm font-medium">{deload.suggestion}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Program progress */}
      {activeProgram && tracker && (
        <Card title="Program Progress">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm">
              Week {tracker.current_week} of {tracker.total_weeks || activeProgram.total_weeks}
            </span>
            <span className="text-sm font-medium text-primary-light">{completionPct}%</span>
          </div>
          <div className="w-full bg-surface-lighter rounded-full h-3">
            <div
              className="bg-primary rounded-full h-3 transition-all"
              style={{ width: `${Math.min(completionPct, 100)}%` }}
            />
          </div>
          <div className="mt-3 flex gap-4 text-xs text-text-muted">
            <span>{tracker.completed} sessions completed</span>
            {tracker.current_streak > 0 && (
              <span className="text-success">{tracker.current_streak} session streak</span>
            )}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent PRs */}
        <Card title="Recent PRs" action={
          <Link to="/progress" className="text-xs text-primary hover:text-primary-light flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        }>
          {summary?.recent_prs?.length ? (
            <div className="space-y-2">
              {summary.recent_prs.map((pr, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-sm">{pr.exercise}</span>
                  <span className="text-sm font-medium text-warning">
                    {convert(pr.e1rm)} {unitLabel} e1RM
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-sm">No recent PRs yet. Keep training!</p>
          )}
        </Card>

        {/* Recovery snapshot */}
        <Card title="Recovery Status" action={
          <Link to="/recovery" className="text-xs text-primary hover:text-primary-light flex items-center gap-1">
            Details <ArrowRight size={12} />
          </Link>
        }>
          <div className="text-center py-4">
            <div className={`text-4xl font-bold ${
              summary?.recovery_score >= 70 ? 'text-success' :
              summary?.recovery_score >= 40 ? 'text-warning' : 'text-danger'
            }`}>
              {summary?.recovery_score != null ? Math.round(summary.recovery_score) : '--'}
            </div>
            <p className="text-xs text-text-muted mt-2">
              {summary?.recovery_recommendation || 'Log body metrics for recovery insights'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`${color} opacity-70`}>{icon}</div>
        <div>
          <div className="text-lg font-bold">{value}</div>
          <div className="text-xs text-text-muted">{label}</div>
        </div>
      </div>
    </Card>
  );
}
