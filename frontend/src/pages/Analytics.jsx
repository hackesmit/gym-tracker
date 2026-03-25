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
  chest: '#ef4444', back: '#60a5fa', shoulders: '#f59e0b',
  biceps: '#84cc16', triceps: '#a855f7', quads: '#f97316',
  hamstrings: '#06b6d4', glutes: '#ec4899', calves: '#64748b',
  core: '#14b8a6', forearms: '#84cc16', traps: '#c084fc',
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
    let stale = false;
    const load = async () => {
      const [v, b, s, bm, t] = await Promise.all([
        getVolume(weeksBack).catch(() => null),
        getMuscleBalance().catch(() => null),
        getStrengthStandards().catch(() => null),
        getBodyMetrics().catch(() => null),
        getTonnage(weeksBack).catch(() => null),
      ]);
      if (stale) return;
      setVolume(v);
      setBalance(b);
      setStrength(s);
      setBodyMetrics(bm);
      setTonnage(t);
      setLoading(false);
    };
    load();
    return () => { stale = true; };
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

  // Strength radar data — null categories show as 0
  const radarData = strength?.lifts
    ? Object.entries(strength.lifts).map(([lift, d]) => ({
        lift: lift.charAt(0).toUpperCase() + lift.slice(1),
        percentile: d?.percentile_estimate || 0,
        hasData: d !== null,
      }))
    : [];

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Strength of the Age</h2>

      {/* Volume chart */}
      <Card title="Weekly Volume by Muscle Group" action={
        <div className="flex items-center gap-2">
          {volumeData.length > 0 && (
            <button
              onClick={() => exportToCSV(volumeData, `volume_${weeksBack}w`)}
              className="text-xs text-accent hover:text-accent-light flex items-center gap-1"
            >
              <Download size={12} />
              Export
            </button>
          )}
          <div className="flex gap-1">
            {[4, 8, 12].map((w) => (
              <button key={w} onClick={() => setWeeksBack(w)}
                className={`px-2 py-1 rounded text-[10px] font-medium ${
                  weeksBack === w ? 'bg-accent text-surface-dark' : 'text-text-muted hover:text-text'
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
                  ? 'bg-accent text-surface-dark'
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
                style={selectedMuscle === muscle ? { backgroundColor: MUSCLE_COLORS[muscle] || '#f59e0b' } : undefined}
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-lighter)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} label={{ value: 'Sets', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-lighter)', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {[...allMuscles].map((muscle) => (
                  <Bar key={muscle} dataKey={muscle} stackId="a"
                    fill={MUSCLE_COLORS[muscle] || '#f59e0b'} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={volumeData} margin={{ top: 5, right: 60, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-lighter)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} label={{ value: 'Sets', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--color-text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-lighter)', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey={selectedMuscle} fill={MUSCLE_COLORS[selectedMuscle] || '#f59e0b'} radius={[4, 4, 0, 0]} />
                {volume?.volume_landmarks?.[selectedMuscle] && (
                  <>
                    <ReferenceLine y={volume.volume_landmarks[selectedMuscle].mev} stroke="#ef4444" strokeDasharray="6 3" label={{ value: 'MEV', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                    <ReferenceLine y={volume.volume_landmarks[selectedMuscle].mav_low} stroke="#84cc16" strokeDasharray="6 3" label={{ value: 'MAV low', position: 'right', fontSize: 10, fill: '#84cc16' }} />
                    <ReferenceLine y={volume.volume_landmarks[selectedMuscle].mav_high} stroke="var(--color-accent)" strokeDasharray="6 3" label={{ value: 'MAV high', position: 'right', fontSize: 10, fill: 'var(--color-accent)' }} />
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
              tonnage: Math.round(convert(w.tonnage_kg)),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-lighter)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} label={{ value: unitLabel, angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--color-text-muted)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-lighter)', borderRadius: 8, fontSize: 11 }}
                formatter={(value) => [`${value.toLocaleString()} ${unitLabel}`, 'Tonnage']}
              />
              <Line type="monotone" dataKey="tonnage" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-accent)' }} name="Tonnage" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-text-muted text-sm text-center py-8">No tonnage data yet.</p>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Strength radar */}
        <Card title="Strength Standards" variant="rivendell">
          {radarData.length ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--color-surface-lighter)" />
                  <PolarAngleAxis dataKey="lift" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--color-text-muted)' }} />
                  <Radar name="Percentile" dataKey="percentile" stroke="var(--color-accent)" fill="var(--color-accent)" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {Object.entries(strength?.lifts || {}).map(([lift, d]) => (
                  <div key={lift} className="flex items-center justify-between text-xs">
                    <span className="text-text-muted capitalize">{lift}</span>
                    {d ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-text">{convert(d.e1rm_kg)} {unitLabel}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          d.classification === 'advanced' || d.classification === 'elite' ? 'bg-success/20 text-success' :
                          d.classification === 'intermediate' ? 'bg-info/20 text-info' :
                          'bg-surface-lighter text-text-muted'
                        }`}>
                          {d.classification}
                        </span>
                        <span className={`px-1 py-0.5 rounded text-[9px] ${
                          d.confidence?.label === 'high' ? 'bg-success/15 text-success' :
                          d.confidence?.label === 'moderate' ? 'bg-info/15 text-info' :
                          'bg-warning/15 text-warning'
                        }`}>
                          {d.confidence?.label}
                        </span>
                        {d.is_stale && <span className="text-[9px] text-warning">stale</span>}
                        <span className="text-[9px] text-text-muted">
                          {d.source_type === 'manual' ? 'manual' : `via ${d.source_exercise}`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-text-muted text-[10px]">No data</span>
                    )}
                  </div>
                ))}
              </div>
              {strength?.overall_classification && (
                <p className="text-xs text-text-muted mt-3 text-center">
                  Overall: <span className="font-medium text-accent-light capitalize">{strength.overall_classification}</span>
                </p>
              )}
              {strength?.categories_missing?.length > 0 && (
                <p className="text-[10px] text-warning mt-3 text-center">
                  Missing: {strength.categories_missing.join(', ')} — add known 1RMs in Settings
                </p>
              )}
            </>
          ) : (
            <p className="text-text-muted text-sm text-center py-8">
              {strength ? 'Set bodyweight in Body Metrics to see standards.' : 'Log compound lifts or enter 1RMs in Settings.'}
            </p>
          )}
        </Card>

        {/* DOTS Score */}
        {strength?.dots && (
          <Card title="DOTS Score">
            <div className="flex flex-col items-center py-4">
              <span className="text-4xl font-bold text-accent-light">
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-lighter)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} domain={['dataMin - 2', 'dataMax + 2']} unit={` ${unitLabel}`} />
              <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-lighter)', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="weight" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
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
