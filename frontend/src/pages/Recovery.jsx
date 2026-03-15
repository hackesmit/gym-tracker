import { useEffect, useState } from 'react';
import { Heart, Moon, Frown, Brain, Clock, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { getRecovery, getBodyMetrics } from '../api/client';
import { exportToCSV } from '../utils/export';

const FATIGUE_STATUS = {
  green: { color: 'text-success', bg: 'bg-success/15', label: 'Fresh' },
  yellow: { color: 'text-warning', bg: 'bg-warning/15', label: 'Moderate' },
  red: { color: 'text-danger', bg: 'bg-danger/15', label: 'Fatigued' },
};

export default function Recovery() {
  const [recovery, setRecovery] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getRecovery().catch(() => null),
      getBodyMetrics().catch(() => null),
    ]).then(([r, m]) => {
      setRecovery(r);
      setMetrics(m);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const score = recovery?.overall_score;
  const components = recovery?.components || {};
  const fatigue = recovery?.muscle_fatigue || {};

  // Build metrics trend for chart
  const trend = metrics?.length
    ? [...metrics].reverse().map((m) => ({
        date: m.date,
        sleep: m.sleep_hours,
        stress: m.stress_level,
        soreness: m.soreness_level,
      }))
    : [];

  const scoreColor =
    score >= 70 ? 'text-success' :
    score >= 40 ? 'text-warning' : 'text-danger';

  const scoreLabel =
    score >= 80 ? 'Fully Recovered' :
    score >= 60 ? 'Mostly Recovered' :
    score >= 40 ? 'Partially Recovered' : 'Under-recovered';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Recovery</h2>

      {/* Score display */}
      <Card>
        <div className="text-center py-6">
          <div className={`text-6xl font-bold ${scoreColor}`}>
            {score != null ? Math.round(score) : '--'}
          </div>
          <p className="text-sm text-text-muted mt-2">{score != null ? scoreLabel : 'No data'}</p>
          {recovery?.recommendation && (
            <p className="text-xs text-text-muted mt-3 max-w-md mx-auto">
              {recovery.recommendation}
            </p>
          )}
        </div>

        {/* Component bars */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <ComponentBar icon={<Moon size={14} />} label="Sleep" value={components.sleep} max={30} />
          <ComponentBar icon={<Frown size={14} />} label="Soreness" value={components.soreness} max={25} />
          <ComponentBar icon={<Brain size={14} />} label="Stress" value={components.stress} max={20} />
          <ComponentBar icon={<Clock size={14} />} label="Rest" value={components.rest} max={25} />
        </div>
      </Card>

      {/* Muscle fatigue */}
      <Card title="Muscle Group Fatigue">
        {Object.keys(fatigue).length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(fatigue).map(([muscle, data]) => {
              const st = FATIGUE_STATUS[data.status] || FATIGUE_STATUS.green;
              return (
                <div key={muscle} className={`${st.bg} rounded-lg p-3`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium capitalize">{muscle}</span>
                    <span className={`text-[10px] ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="text-xs text-text-muted">
                    {data.sets_last_7d} sets / 7d
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {data.days_since_last != null
                      ? `${data.days_since_last}d since last`
                      : 'No recent sessions'}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-text-muted text-sm text-center py-6">
            Log workouts to see muscle fatigue status.
          </p>
        )}
      </Card>

      {/* Trends chart */}
      {trend.length > 1 && (
        <Card title="Recovery Trends" action={
          <button
            onClick={() => exportToCSV(trend, 'recovery_trends', ['date', 'sleep', 'stress', 'soreness'])}
            className="text-xs text-primary hover:text-primary-light flex items-center gap-1"
          >
            <Download size={12} />
            Export
          </button>
        }>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#363650" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #363650', borderRadius: 8, fontSize: 11 }} />
              {trend.some((t) => t.sleep != null) && (
                <Line type="monotone" dataKey="sleep" stroke="#3b82f6" name="Sleep (hrs)" dot={{ r: 2 }} />
              )}
              {trend.some((t) => t.stress != null) && (
                <Line type="monotone" dataKey="stress" stroke="#eab308" name="Stress (1-5)" dot={{ r: 2 }} />
              )}
              {trend.some((t) => t.soreness != null) && (
                <Line type="monotone" dataKey="soreness" stroke="#ef4444" name="Soreness (1-5)" dot={{ r: 2 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Tips based on score */}
      <Card title="Recommendations">
        <div className="space-y-2">
          {score >= 80 && (
            <Tip icon={<CheckCircle2 size={14} />} color="text-success"
              text="You're well recovered. Great time to push intensity or attempt PRs." />
          )}
          {score >= 40 && score < 80 && (
            <Tip icon={<AlertTriangle size={14} />} color="text-warning"
              text="Moderate recovery. Consider reducing volume by 1 set per exercise or lowering RPE by 1." />
          )}
          {score != null && score < 40 && (
            <Tip icon={<AlertTriangle size={14} />} color="text-danger"
              text="Under-recovered. Consider a deload day or active recovery session." />
          )}
          {components.sleep < 15 && (
            <Tip icon={<Moon size={14} />} color="text-info"
              text="Sleep quality is low. Aim for 7-9 hours of sleep for optimal recovery." />
          )}
        </div>
      </Card>
    </div>
  );
}

function ComponentBar({ icon, label, value, max }) {
  const pct = value != null ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-text-muted">{icon}</span>
        <span className="text-xs text-text-muted">{label}</span>
        <span className="text-xs font-medium ml-auto">{value != null ? `${Math.round(value)}/${max}` : '--'}</span>
      </div>
      <div className="w-full bg-surface-lighter rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${pct >= 60 ? 'bg-success' : pct >= 30 ? 'bg-warning' : 'bg-danger'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Tip({ icon, color, text }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={color}>{icon}</span>
      <span className="text-xs text-text-muted">{text}</span>
    </div>
  );
}
