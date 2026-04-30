import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import MedalBadge, { medalCategoryColor } from '../components/MedalBadge';
import { listMedals, getMyMedals } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

const CATEGORIES = [
  { id: 'all',         label: 'All' },
  { id: 'strength',    label: 'Strength' },
  { id: 'endurance',   label: 'Endurance' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'performance', label: 'Performance' },
];

// Fallback icon inference when the backend response pre-dates the icon
// column being exposed. Keyed on the final segment of metric_type.
function inferIcon(metric_type) {
  if (!metric_type) return 'total';
  const m = metric_type;
  if (m.startsWith('strength_1rm:bench'))    return 'bench';
  if (m.startsWith('strength_1rm:squat'))    return 'squat';
  if (m.startsWith('strength_1rm:deadlift')) return 'deadlift';
  if (m.startsWith('strength_1rm:ohp'))      return 'ohp';
  if (m === 'strength_pl_total')             return 'total';
  if (m === 'strength_relative')             return 'relative';
  if (m === 'cardio_fastest_mile')           return 'mile';
  if (m === 'cardio_fastest_5k')             return 'fk5';
  if (m === 'cardio_fastest_10k')            return 'fk10';
  if (m === 'cardio_longest:run')            return 'run';
  if (m === 'cardio_longest:bike')           return 'ride';
  if (m === 'cardio_longest:swim')           return 'swim';
  if (m === 'consistency_longest_streak')    return 'streak';
  if (m === 'consistency_sessions_30d')      return 'sess30';
  if (m === 'consistency_sessions_all')      return 'sessAll';
  if (m === 'consistency_volume_30d')        return 'vol30';
  if (m === 'consistency_perfect_weeks')     return 'week';
  if (m === 'performance_1rm_increase_30d')  return 'inc1rm';
  if (m === 'performance_volume_increase_30d') return 'incVol';
  if (m === 'performance_most_improved_pct') return 'improved';
  return 'total';
}

function inferCategory(metric_type) {
  if (!metric_type) return 'strength';
  if (metric_type.startsWith('strength_'))    return 'strength';
  if (metric_type.startsWith('cardio_'))      return 'endurance';
  if (metric_type.startsWith('consistency_')) return 'consistency';
  if (metric_type.startsWith('performance_')) return 'performance';
  return 'strength';
}

function formatValue(v, unit, higherIsBetter) {
  if (v == null) return '—';
  if (unit === 'min' || unit === 'min/km') {
    const display = unit === 'min/km' ? v * 1.609344 : v;
    const minutes = Math.floor(display);
    const seconds = Math.round((display - minutes) * 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}${unit === 'min/km' ? '/mi' : ''}`;
  }
  if (typeof v !== 'number') return String(v);
  // Strip trailing zeros on integer-looking floats.
  const txt = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : (v % 1 === 0 ? v.toString() : v.toFixed(1));
  return `${higherIsBetter === false ? '' : ''}${txt}`;
}

export default function Medals() {
  const t = useT();
  const { user } = useAuth();
  const [medals, setMedals] = useState([]);
  const [mineSet, setMineSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    Promise.all([listMedals(), getMyMedals()])
      .then(([all, mine]) => {
        const list = (Array.isArray(all) ? all : all?.medals || []).map((m) => ({
          ...m,
          icon: m.icon || inferIcon(m.metric_type),
          category: m.category || inferCategory(m.metric_type),
        }));
        setMedals(list);
        const held = new Set(
          (Array.isArray(mine) ? mine : mine?.medals || []).map((x) => x.medal_id || x.id)
        );
        setMineSet(held);
      })
      .catch((ex) => setErr(ex.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => medals.filter((m) => filter === 'all' || m.category === filter),
    [medals, filter]
  );

  const myMedals = useMemo(
    () => medals.filter((m) => mineSet.has(m.id)),
    [medals, mineSet]
  );

  if (loading) return <LoadingSpinner />;
  if (err) return <p className="text-sm text-danger">{err}</p>;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">{t('medals.title') || 'Medals'}</h2>
      <p className="text-sm text-text-muted max-w-2xl">
        King-of-the-hill records across all users. Hold a medal by being the
        best in its metric; whoever registers a better value takes it from you.
      </p>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const active = filter === c.id;
          const color = c.id === 'all' ? null : medalCategoryColor(c.id);
          return (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-widest transition-colors touch-manipulation inline-flex items-center gap-2 ${
                active
                  ? 'bg-text text-surface-dark'
                  : 'bg-surface-light text-text-muted hover:text-text border border-surface-lighter'
              }`}
              style={!active && color ? { color } : undefined}
            >
              {color && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: active ? 'currentColor' : color }} />}
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {visible.map((m) => (
          <MedalCard
            key={m.id}
            medal={m}
            owned={mineSet.has(m.id)}
            currentUsername={user?.username}
          />
        ))}
        {!visible.length && <p className="text-sm text-text-muted col-span-full">No medals match this filter.</p>}
      </div>

      {/* Trophy Case */}
      <Card title="Trophy case">
        {myMedals.length ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
            {myMedals.map((m) => (
              <div key={`tc-${m.id}`} className="flex flex-col items-center gap-1">
                <MedalBadge icon={m.icon} category={m.category} size={64} title={m.name} />
                <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted text-center leading-tight">
                  {m.name.replace('Strongest ', '').replace('Biggest ', '').replace('Fastest ', '').replace(' 30d', '').replace(' All-Time', '')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No medals held yet. Log a qualifying lift or cardio session to claim your first.</p>
        )}
      </Card>
    </div>
  );
}

function MedalCard({ medal, owned, currentUsername }) {
  const { name, icon, category, unit, higher_is_better, holder } = medal;
  const locked = !holder;
  const accent = medalCategoryColor(category);
  const holderName = holder?.username || (owned ? currentUsername || 'You' : null);
  return (
    <div
      className={`rounded-xl p-4 border transition-colors flex flex-col items-center gap-2 text-center ${
        owned
          ? 'border-accent/40 bg-accent/5'
          : 'border-surface-lighter bg-surface-light hover:border-surface-lighter/60'
      }`}
    >
      <span
        className="self-start text-[8px] font-mono uppercase tracking-[0.2em] font-bold"
        style={{ color: locked ? 'var(--text-muted, #6b6b6b)' : accent }}
      >
        {category}
      </span>
      <MedalBadge icon={icon} category={category} locked={locked} size={96} title={name} />
      <p className={`text-xs font-semibold leading-snug ${locked ? 'text-text-muted' : 'text-text'}`}>{name}</p>
      <p className="text-[9px] font-mono uppercase tracking-widest text-text-muted">
        Held by · <span className={locked ? '' : 'text-text font-semibold'}>{holderName || 'Unclaimed'}</span>
      </p>
      <p className="text-xs font-mono font-bold" style={{ color: locked ? 'var(--text-muted, #6b6b6b)' : accent }}>
        {holder ? formatValue(holder.value, unit, higher_is_better) : '—'}
        {holder && unit && <span className="text-text-muted font-normal ml-1">{unit}</span>}
      </p>
      {owned && (
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] font-bold text-accent">Yours</span>
      )}
      {holder?.held_days != null && !owned && holder.held_days > 0 && (
        <span className="text-[9px] text-text-muted">Held {holder.held_days}d</span>
      )}
    </div>
  );
}
