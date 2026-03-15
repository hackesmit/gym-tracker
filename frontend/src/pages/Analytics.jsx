import { useEffect, useState } from 'react';
import {
  BarChart3, Target, Activity, Scale, Download,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Legend, ReferenceLine,
} from 'recharts';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { useApp } from '../context/AppContext';
import {
  getVolume, getMuscleBalance, getStrengthStandards, getBodyMetrics, getTonnage,
} from '../api/client';
import { exportToCSV } from '../utils/export';

const MUSCLE_COLORS = {
  chest: '#ef4444', back: '#3b82f6', shoulders: '#eab308',
  biceps: '#22c55e', triceps: '#a855f7', quads: '#f97316',
  hamstrings: '#06b6d4', glutes: '#ec4899', calves: '#64748b',
  core: '#14b8a6', forearms: '#84cc16', traps: '#6366f1',
};

export default function Analytics() {
  const { convert, unitLabel } = useApp();
  const [volume, setVolume] = useState(null);
  const [balance, setBalance] = useState(null);
  const [strength, setStrength] = useState(null);
  const [bodyMetrics, setBodyMetrics] = useState(null);
  const [tonnage, setTonnage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weeksBack, setWeeksBack] = useState(8);
  const [selectedMuscle, setSelectedMuscle] = useState('all');

  useEffect(() => {
    const load = async () => {
      const [v, b, s, bm, t] = await Promise.all([
        getVolume(weeksBack).catch(() => null),
        getMuscleBalance().catch(() => null),
        getStrengthStandards().catch(() => null),
        getBodyMetrics().catch(() => null),
        getTonnage(weeksBack).catch(() => null),
      ]);
      setVolume(v);
      setBalance(b);
      setStrength(s);
      setBodyMetrics(bm);
      setTonnage(t);
      setLoading(false);
    };
    load();
  }, [weeksBack]);

  if (loading) return <LoadingSpinner />;

  // Volume chart data
  const volumeData = volume?.weeks?.map((w) => {
    const entry = { week: w.week_start };
    Object.entries(w.muscle_groups || {}).forEach(([muscle, d]) => {
      entry[muscle] = d.sets || 0;
    });
    return entry;
  }) || [];

  const allMuscles = new Set();
  volumeData.forEach((d) => Object.keys(d).filter((k) => k !== 'week').forEach((k) => allMuscles.add(k)));

  // Strength radar data
  const radarData = strength?.lifts
    ? Object.entries(strength.lifts).map(([lift, d]) => ({
        lift: lift.charAt(0).toUpperCase() + lift.slice(1),
        percentile: d.percentile_estimate || 0,
        classification: d.classification || 'N/A',
      }))
    : [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics</h2>

      {/* Volume chart */}
      <Card title="Weekly Volume by Muscle Group" action={
        <div className="flex items-center gap-2">
          {volumeData.length > 0 && (
            <button
              onClick={() => exportToCSV(volumeData, `volume_${weeksBack}w`)}
              className="text-xs text-primary hover:text-primary-light flex items-center gap-1"
            >
              <Download size={12} />
              Export
            </button>
          )}
          <div className="flex gap-1">
            {[4, 8, 12].map((w) => (
              <button key={w} onClick={() => setWeeksBack(w)}
                className={`px-2 py-1 rounded text-[10px] font-medium ${
                  weeksBack === w ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
                }`}>
                {w}w
              </button>
            ))}
          </div>
        </div>
      }>
        {/* Muscle group selector pills */}
        {volumeData.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-4">
            <button
              onClick={() => setSelectedMuscle('all')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                selectedMuscle === 'all'
                  ? 'bg-primary text-white'
                  : 'bg-surface-lighter text-text-muted hover:text-text'
              }`}
            >
              All
            </button>
            {[...allMuscles].sort().map((muscle) => (
              <button
                key={muscle}
                onClick={() => setSelectedMuscle(muscle)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium capitalize transition-colors ${
                  selectedMuscle === muscle
                    ? 'text-white'
                    : 'bg-surface-lighter text-text-muted hover:text-text'
                }`}
                style={selectedMuscle === muscle ? { backgroundColor: MUSCLE_COLORS[muscle] || '#6366f1' } : undefined}
              >
                {muscle}
              </button>
            ))}
          </div>
        )}

        {volumeData.length ? (
          selectedMuscle === 'all' ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#363650" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Sets', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #363650', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {[...allMuscles].map((muscle) => (
                  <Bar key={muscle} dataKey={muscle} stackId="a"
                    fill={MUSCLE_COLORS[muscle] || '#6366f1'} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={volumeData} margin={{ top: 5, right: 60, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#363650" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Sets', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #363650', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey={selectedMuscle} fill={MUSCLE_COLORS[selectedMuscle] || '#6366f1'} radius={[4, 4, 0, 0]} />
                {volume?.volume_landmarks?.[selectedMuscle] && (
                  <>
                    <ReferenceLine y={volume.volume_landmarks[selectedMuscle].mev} stroke="#ef4444" strokeDasharray="6 3" label={{ value: 'MEV', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                    <ReferenceLine y={volume.volume_landmarks[selectedMuscle].mav_low} stroke="#22c55e" strokeDasharray="6 3" label={{ value: 'MAV low', position: 'right', fontSize: 10, fill: '#22c55e' }} />
                    <ReferenceLine y={volume.volume_landmarks[selectedMuscle].mav_high} stroke="#eab308" strokeDasharray="6 3" label={{ value: 'MAV high', position: 'right', fontSize: 10, fill: '#eab308' }} />
                    <ReferenceLine y={volume.volume_landmarks[selectedMuscle].mrv} stroke="#dc2626" strokeDasharray="6 3" strokeWidth={2} label={{ value: 'MRV', position: 'right', fontSize: 10, fill: '#dc2626', fontWeight: 600 }} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          )
        ) : (
          <p className="text-text-muted text-sm text-center py-8">No volume data yet.</p>
        )}
      </Card>

      {/* Tonnage trend */}
      <Card title="Weekly Tonnage">
        {tonnage?.weeks?.length ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={tonnage.weeks.map((w) => ({
              week: w.week_start,
              tonnage: Math.round(w.tonnage_kg),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#363650" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'kg', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid #363650', borderRadius: 8, fontSize: 11 }}
                formatter={(value) => [`${value.toLocaleString()} kg`, 'Tonnage']}
              />
              <Line type="monotone" dataKey="tonnage" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} name="Tonnage" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-text-muted text-sm text-center py-8">No tonnage data yet.</p>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Strength radar */}
        <Card title="Strength Standards">
          {radarData.length ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#363650" />
                  <PolarAngleAxis dataKey="lift" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Radar name="Percentile" dataKey="percentile" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1">
                {Object.entries(strength?.lifts || {}).map(([lift, d]) => (
                  d.classification && (
                    <div key={lift} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted capitalize">{lift}</span>
                      <span>
                        {d.best_e1rm ? `${convert(d.best_e1rm)} ${unitLabel}` : '--'}
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                          d.classification === 'advanced' || d.classification === 'elite' ? 'bg-success/20 text-success' :
                          d.classification === 'intermediate' ? 'bg-info/20 text-info' :
                          'bg-surface-lighter text-text-muted'
                        }`}>
                          {d.classification}
                        </span>
                      </span>
                    </div>
                  )
                ))}
              </div>
              {strength?.overall_classification && (
                <p className="text-xs text-text-muted mt-3 text-center">
                  Overall: <span className="font-medium text-primary-light capitalize">{strength.overall_classification}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-text-muted text-sm text-center py-8">
              {strength ? 'Set bodyweight in Body Metrics to see standards.' : 'Log compound lifts to see strength standards.'}
            </p>
          )}
        </Card>

        {/* DOTS Score */}
        {strength?.dots && (
          <Card title="DOTS Score">
            <div className="flex flex-col items-center py-4">
              <span className="text-4xl font-bold text-primary-light">
                {strength.dots.score}
              </span>
              <span className={`mt-2 px-3 py-1 rounded-full text-xs font-semibold ${
                strength.dots.classification === 'Elite' ? 'bg-yellow-500/20 text-yellow-400' :
                strength.dots.classification === 'Master' ? 'bg-success/20 text-success' :
                strength.dots.classification === 'Class I' ? 'bg-info/20 text-info' :
                'bg-surface-lighter text-text-muted'
              }`}>
                {strength.dots.classification}
              </span>
              <div className="mt-4 w-full space-y-1.5 text-xs text-text-muted">
                <div className="flex justify-between">
                  <span>Est. Total</span>
                  <span className="text-text">{convert(strength.dots.total_kg)} {unitLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bodyweight</span>
                  <span className="text-text">{convert(strength.bodyweight_kg)} {unitLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span>Lifts used</span>
                  <span className="text-text capitalize">{strength.dots.lifts_included?.join(', ')}</span>
                </div>
              </div>
              {strength.dots.note && (
                <p className="mt-3 text-[10px] text-warning text-center">{strength.dots.note}</p>
              )}
            </div>
          </Card>
        )}

        {/* Muscle balance */}
        <Card title="Muscle Balance">
          {balance ? (
            <div className="space-y-6 py-4">
              <BalanceGauge
                label="Push : Pull"
                ratio={balance.push_pull_ratio}
                target={1.0}
                left={`Push ${balance.push_sets}s`}
                right={`Pull ${balance.pull_sets}s`}
                assessment={balance.assessment?.push_pull}
              />
              <BalanceGauge
                label="Quad : Ham"
                ratio={balance.quad_ham_ratio}
                target={0.7}
                left={`Quad ${balance.quad_sets}s`}
                right={`Ham ${balance.ham_sets}s`}
                assessment={balance.assessment?.quad_ham}
              />
            </div>
          ) : (
            <p className="text-text-muted text-sm text-center py-8">No balance data yet.</p>
          )}
        </Card>
      </div>

      {/* Bodyweight trend */}
      {bodyMetrics?.length > 0 && (
        <Card title="Bodyweight Trend">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[...(bodyMetrics || [])].reverse().map((m) => ({
              date: m.date,
              weight: convert(m.bodyweight_kg),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#363650" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={['dataMin - 2', 'dataMax + 2']} unit={` ${unitLabel}`} />
              <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #363650', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="weight" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

function BalanceGauge({ label, ratio, target, left, right, assessment }) {
  const pct = ratio > 0 ? Math.min((ratio / (target * 2)) * 100, 100) : 50;
  const isBalanced = assessment === 'balanced' || assessment === 'good';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted">{left}</span>
        <span className="text-xs font-medium">{label}: {ratio > 0 ? ratio.toFixed(2) : '--'}</span>
        <span className="text-xs text-text-muted">{right}</span>
      </div>
      <div className="w-full bg-surface-lighter rounded-full h-2.5 relative">
        <div
          className={`h-2.5 rounded-full transition-all ${isBalanced ? 'bg-success' : 'bg-warning'}`}
          style={{ width: `${pct}%` }}
        />
        {/* Target marker */}
        <div className="absolute top-0 h-full w-0.5 bg-text-muted" style={{ left: '50%' }} />
      </div>
      {assessment && assessment !== 'insufficient_data' && (
        <p className={`text-[10px] mt-1 text-center ${isBalanced ? 'text-success' : 'text-warning'}`}>
          {assessment.replace(/_/g, ' ')}
        </p>
      )}
    </div>
  );
}
