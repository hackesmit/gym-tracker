import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import RankBadge from '../components/RankBadge';
import MedalBadge from '../components/MedalBadge';
import TrainingCalendar from '../components/TrainingCalendar';
import RankStandards from '../components/RankStandards';
import { useAuth } from '../context/AuthContext';
import {
  getRanks, getMyMedals, getCalendarOverview,
} from '../api/client';
import { useT } from '../i18n';

const MUSCLE_LABELS = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  arms: 'Arms',
};

// Picks the single "signature" rank for the profile hero. We use the
// group with the highest ELO — that's the user's most impressive lift
// and gives them a meaningful big badge at the top.
function dominantGroup(groups) {
  if (!groups?.length) return null;
  return [...groups].sort((a, b) => (b.elo || 0) - (a.elo || 0))[0];
}

function RankCard({ entry }) {
  if (!entry) return null;
  const { muscle_group, rank, sub_label, sub_index, elo, thresholds, ratio } = entry;
  const isChampion = rank === 'Champion';
  const label = MUSCLE_LABELS[muscle_group] || muscle_group;
  const fullRank = isChampion ? 'Champion' : `${rank} ${sub_label}`;

  // Progress bar within the current subdivision (0..1). For Champion we
  // show a full bar; for no-data (Copper V with 0 ratio) we show empty.
  let progress = 0;
  if (isChampion) progress = 1;
  else if (thresholds && ratio != null) {
    const tierFloor = rank === 'Copper' ? 0 : thresholds[rank];
    const order = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion'];
    const nextTier = rank === 'Copper' ? 'Bronze' : order[order.indexOf(rank) + 1];
    const ceiling = thresholds[nextTier];
    if (ceiling != null && ceiling > tierFloor) {
      const step = (ceiling - tierFloor) / 5;
      const subFloor = tierFloor + sub_index * step;
      progress = Math.max(0, Math.min(1, (ratio - subFloor) / step));
    }
  }

  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        <RankBadge rank={rank} subIndex={sub_index || 0} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
          <p className="text-sm font-semibold truncate">{fullRank}</p>
          <p className="text-[10px] text-text-muted font-mono">
            {Math.round(elo || 0).toLocaleString()} ELO
          </p>
          <div className="h-1 bg-surface-light rounded mt-2 overflow-hidden">
            <div
              className="h-full bg-accent/60"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Profile() {
  const t = useT();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [eloAgg, setEloAgg] = useState(null);
  const [medals, setMedals] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const normalizeGroups = (raw) => {
          if (Array.isArray(raw)) return raw;
          if (!raw) return [];
          // Legacy object shape — { chest: {...}, ... }
          return Object.entries(raw).map(([k, v]) => ({
            muscle_group: k,
            rank: typeof v === 'string' ? v : v?.rank,
            sub_index: v?.sub_index ?? 0,
            sub_label: v?.sub_label ?? 'V',
            elo: v?.elo ?? 0,
            score: v?.score ?? 0,
            ratio: v?.ratio ?? 0,
            thresholds: v?.thresholds,
          }));
        };

        const [r, m, cal] = await Promise.all([
          getRanks().catch(() => ({})),
          getMyMedals().catch(() => ({ medals: [] })),
          getCalendarOverview(90).catch(() => ({ days: [] })),
        ]);
        setGroups(normalizeGroups(r.groups || r.ranks || r));
        setEloAgg(r.elo || null);
        setMedals(m.medals || m || []);
        setCalendar(cal.days || []);
        setUsername(user?.username || t('profile.you'));
      } catch (ex) {
        setErr(ex.message || t('profile.failedLoad'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  if (loading) return <LoadingSpinner />;
  if (err) return <p className="text-sm text-danger">{err}</p>;

  const hero = dominantGroup(groups);
  const heroBadge = hero ? (
    <RankBadge rank={hero.rank} subIndex={hero.sub_index || 0} size={140} />
  ) : (
    <RankBadge rank="Copper" subIndex={0} size={140} />
  );

  const totalElo = Math.round(eloAgg?.total || 0);
  const maxElo = eloAgg?.max || groups.length * 3100 || 18600;
  const dominantTier = eloAgg?.dominant_tier || hero?.rank || 'Copper';
  const eloPct = maxElo > 0 ? Math.min(100, (totalElo / maxElo) * 100) : 0;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">{username}</h2>

      {/* Hero — aggregate ELO + signature badge */}
      <Card className="!p-5 sm:!p-7">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="shrink-0">{heroBadge}</div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <p className="text-xs uppercase tracking-[0.2em] text-text-muted">Total ELO</p>
            <p className="font-display text-5xl sm:text-6xl font-bold leading-none tracking-tight mt-1">
              {totalElo.toLocaleString()}
            </p>
            <p className="text-xs text-text-muted mt-1 font-mono">
              of {maxElo.toLocaleString()} · dominant tier · {dominantTier}
            </p>
            <div className="h-1.5 bg-surface-light rounded-full mt-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent/50 via-accent to-accent-light"
                style={{ width: `${eloPct}%` }}
              />
            </div>
            {hero && (
              <p className="text-[11px] text-text-muted mt-3 font-mono">
                Signature · {MUSCLE_LABELS[hero.muscle_group] || hero.muscle_group} ·{' '}
                {hero.rank === 'Champion' ? 'Champion' : `${hero.rank} ${hero.sub_label}`}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Muscle rank grid */}
      <Card title={t('profile.muscleRanks') || 'Muscle ranks'}>
        {groups.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map((g) => (
              <RankCard key={g.muscle_group} entry={g} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t('profile.noRanks') || 'No ranks yet — log a working set to start ranking up.'}</p>
        )}
      </Card>

      {/* Rank standards reference — expandable */}
      <Card>
        <RankStandards currentRanks={groups} />
      </Card>

      {/* Training calendar (self only) */}
      <Card title="Training calendar">
        <TrainingCalendar days={calendar} />
      </Card>

      {/* Trophy case */}
      <Card
        title="Trophy case"
        action={<Link to="/profile/medals" className="text-xs text-accent">View all</Link>}
      >
        {medals.length ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
            {medals.map((m) => (
              <div key={m.medal_id || m.id} className="flex flex-col items-center gap-1">
                <MedalBadge
                  icon={m.icon || 'total'}
                  category={m.category || 'strength'}
                  size={56}
                  title={m.name || m.medal_name}
                />
                <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted text-center leading-tight">
                  {(m.name || m.medal_name || '').replace('Strongest ', '').replace('Biggest ', '').replace('Fastest ', '').replace(' 30d', '').replace(' All-Time', '')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            No medals held yet. Best a friend on any tracked metric to claim one.
          </p>
        )}
      </Card>
    </div>
  );
}
