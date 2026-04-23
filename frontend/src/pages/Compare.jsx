import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import RankBadge from '../components/RankBadge';
import { getCompare } from '../api/client';
import { useT } from '../i18n';

const MUSCLE_LABELS = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  quads: 'Quads', hamstrings: 'Hamstrings', arms: 'Arms',
};

function normalizeRanks(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  return Object.entries(raw).map(([k, v]) => ({
    muscle_group: k,
    rank: typeof v === 'string' ? v : v?.rank,
    sub_index: v?.sub_index ?? 0,
    sub_label: v?.sub_label ?? 'V',
    elo: v?.elo ?? 0,
  }));
}

export default function Compare() {
  const t = useT();
  const [params] = useSearchParams();
  const friendId = params.get('friend');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!friendId) { setLoading(false); return; }
    getCompare(friendId)
      .then(setData)
      .catch((ex) => setErr(ex.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [friendId]);

  if (!friendId) return <p className="text-sm text-text-muted">Select a friend from the Friends page to compare.</p>;
  if (loading) return <LoadingSpinner />;
  if (err) return <p className="text-sm text-danger">{err}</p>;
  if (!data) return null;

  const me = data.me || data.self || {};
  const friend = data.friend || data.them || data.other || {};
  const meRanks = normalizeRanks(me.muscle_ranks);
  const friendRanks = normalizeRanks(friend.muscle_ranks);
  const meElo = Math.round(me.elo_total ?? meRanks.reduce((a, r) => a + (r.elo || 0), 0));
  const friendElo = Math.round(friend.elo_total ?? friendRanks.reduce((a, r) => a + (r.elo || 0), 0));

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">
        {t('compare.title')}: {me.username || 'You'} vs {friend.username}
      </h2>

      <div className="grid md:grid-cols-2 gap-4">
        <StatBlock title={me.username || 'You'} stats={me} ranks={meRanks} totalElo={meElo} />
        <StatBlock title={friend.username || 'Friend'} stats={friend} ranks={friendRanks} totalElo={friendElo} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <RankGrid title={`${me.username || 'You'} — muscle ranks`} ranks={meRanks} />
        <RankGrid title={`${friend.username || 'Friend'} — muscle ranks`} ranks={friendRanks} />
      </div>
    </div>
  );
}

function StatBlock({ title, stats, ranks = [], totalElo = 0 }) {
  return (
    <Card title={title}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Total ELO" value={totalElo.toLocaleString()} />
        <Stat label="Volume 30d" value={stats.volume_30d != null ? Math.round(stats.volume_30d).toLocaleString() : '--'} />
        <Stat label="Sessions 30d" value={stats.sessions_30d ?? '--'} />
        <Stat label="Cardio km 30d" value={stats.cardio_km_30d != null ? stats.cardio_km_30d.toFixed(1) : '--'} />
        <Stat label="Medals owned" value={stats.medals_owned ?? '--'} />
      </div>
    </Card>
  );
}

function RankGrid({ title, ranks }) {
  if (!ranks.length) return (
    <Card title={title}><p className="text-sm text-text-muted">No ranks yet.</p></Card>
  );
  return (
    <Card title={title}>
      <div className="grid grid-cols-2 gap-3">
        {ranks.map((r) => (
          <div key={r.muscle_group} className="flex items-center gap-2 bg-surface-light rounded-lg px-2 py-2">
            <RankBadge rank={r.rank || 'Copper'} subIndex={r.sub_index || 0} size={36} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-text-muted truncate">{MUSCLE_LABELS[r.muscle_group] || r.muscle_group}</p>
              <p className="text-xs font-semibold truncate">
                {r.rank === 'Champion' ? 'Champion' : `${r.rank || 'Copper'} ${r.sub_label || 'V'}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
