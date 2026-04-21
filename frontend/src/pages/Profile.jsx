import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import BodyMap from '../components/BodyMap';
import { useAuth } from '../context/AuthContext';
import { getRanks, getMyMedals, getCompare } from '../api/client';
import { Trophy } from 'lucide-react';

export default function Profile() {
  const [params] = useSearchParams();
  const targetId = params.get('userId');
  const { user } = useAuth();
  const [ranks, setRanks] = useState({});
  const [medals, setMedals] = useState([]);
  const [recentPrs, setRecentPrs] = useState([]);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const normalizeRanks = (raw) => {
          // Accept either array [{group, rank, score}] or object {group: {...}}
          if (Array.isArray(raw)) {
            return Object.fromEntries(
              raw.map((r) => [r.group || r.muscle_group, { rank: r.rank, score: r.score }])
            );
          }
          return raw || {};
        };
        if (targetId) {
          // Viewing a friend — use compare endpoint for consolidated data
          const data = await getCompare(targetId);
          const friend = data.friend || data.other || data.them || {};
          setRanks(normalizeRanks(friend.muscle_ranks || friend.ranks || data.them_ranks));
          setMedals(friend.medals || data.them_medals || []);
          setRecentPrs(friend.recent_prs || []);
          setUsername(friend.username || 'User');
        } else {
          const [r, m] = await Promise.all([
            getRanks().catch(() => ({})),
            getMyMedals().catch(() => ({ medals: [] })),
          ]);
          setRanks(normalizeRanks(r.groups || r.ranks || r));
          setMedals(m.medals || m || []);
          setUsername(user?.username || 'You');
        }
      } catch (ex) {
        setErr(ex.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [targetId, user]);

  if (loading) return <LoadingSpinner />;
  if (err) return <p className="text-sm text-danger">{err}</p>;

  const rankEntries = Object.entries(ranks).filter(([, v]) => v);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">{username}</h2>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Muscle ranks">
          <div className="flex justify-center">
            <BodyMap ranks={ranks} size={320} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Medals owned">
            {medals.length ? (
              <ul className="space-y-2">
                {medals.slice(0, 10).map((m) => (
                  <li key={m.id || m.medal_id || m.key} className="flex items-center gap-2 text-sm">
                    <Trophy size={14} className="text-accent" />
                    <span className="flex-1">{m.name || m.label || m.medal_name}</span>
                    {m.value != null && <span className="text-xs text-text-muted">{m.value}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">No medals yet.</p>
            )}
          </Card>

          <Card title="Rank summary">
            {rankEntries.length ? (
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {rankEntries.map(([muscle, v]) => {
                  const rank = typeof v === 'string' ? v : v.rank;
                  const score = typeof v === 'object' ? v.score : null;
                  return (
                    <li key={muscle} className="flex justify-between bg-surface-light rounded px-2 py-1">
                      <span className="capitalize text-text-muted">{muscle}</span>
                      <span className="font-medium">
                        {rank}{score != null && <span className="text-xs text-text-muted ml-1">({Math.round(score)})</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">No ranked muscles yet.</p>
            )}
          </Card>
        </div>
      </div>

      {recentPrs.length > 0 && (
        <Card title="Recent PRs">
          <ul className="divide-y divide-surface-lighter">
            {recentPrs.slice(0, 10).map((pr, i) => (
              <li key={i} className="py-2 flex justify-between text-sm">
                <span>{pr.exercise}</span>
                <span className="text-text-muted">{pr.e1rm || pr.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
