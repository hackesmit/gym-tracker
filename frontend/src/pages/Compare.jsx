import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import BodyMap from '../components/BodyMap';
import { getCompare } from '../api/client';
import { useT } from '../i18n';

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

  const normalizeRanks = (raw) => {
    if (Array.isArray(raw)) {
      return Object.fromEntries(raw.map((r) => [r.group || r.muscle_group, { rank: r.rank, score: r.score }]));
    }
    return raw || {};
  };
  const meRanks = normalizeRanks(me.muscle_ranks);
  const friendRanks = normalizeRanks(friend.muscle_ranks);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">
        {t('compare.title')}: {me.username || 'You'} vs {friend.username}
      </h2>

      <div className="grid md:grid-cols-2 gap-4">
        <StatBlock title={me.username || 'You'} stats={me} ranks={meRanks} />
        <StatBlock title={friend.username || 'Friend'} stats={friend} ranks={friendRanks} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`${me.username || 'You'} — Body map`}>
          <div className="flex justify-center">
            <BodyMap ranks={meRanks} size={280} />
          </div>
        </Card>
        <Card title={`${friend.username || 'Friend'} — Body map`}>
          <div className="flex justify-center">
            <BodyMap ranks={friendRanks} size={280} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatBlock({ title, stats, ranks = {} }) {
  const topRanks = Object.entries(ranks)
    .filter(([, v]) => v && (v.rank || typeof v === 'string'))
    .slice(0, 3);
  return (
    <Card title={title}>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Volume 30d" value={stats.volume_30d != null ? Math.round(stats.volume_30d).toLocaleString() : '--'} />
        <Stat label="Sessions 30d" value={stats.sessions_30d ?? '--'} />
        <Stat label="Cardio km 30d" value={stats.cardio_km_30d != null ? stats.cardio_km_30d.toFixed(1) : '--'} />
        <Stat label="Medals owned" value={stats.medals_owned ?? '--'} />
      </div>
      {topRanks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-surface-lighter">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Top ranks</p>
          <ul className="space-y-1 text-sm">
            {topRanks.map(([muscle, v]) => {
              const rank = typeof v === 'string' ? v : v.rank;
              return (
                <li key={muscle} className="flex justify-between">
                  <span className="capitalize">{muscle}</span>
                  <span className="font-medium">{rank}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
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
