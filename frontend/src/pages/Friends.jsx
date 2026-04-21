import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { listFriends, requestFriend, acceptFriend, declineFriend, removeFriend } from '../api/client';
import { UserPlus, Check, X, Trash2 } from 'lucide-react';

export default function Friends() {
  const [data, setData] = useState({ accepted: [], incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const res = await listFriends();
      if (Array.isArray(res)) {
        setData({
          accepted: res.filter((f) => f.status === 'accepted'),
          incoming: res.filter((f) => f.status === 'pending' && f.direction === 'incoming'),
          outgoing: res.filter((f) => f.status === 'pending' && f.direction === 'outgoing'),
        });
      } else {
        setData({
          accepted: res.accepted || res.friends || [],
          incoming: res.incoming || [],
          outgoing: res.outgoing || [],
        });
      }
    } catch (ex) {
      setErr(ex.message || 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sendReq = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    try {
      await requestFriend(username.trim());
      setMsg('Request sent.');
      setUsername('');
      load();
    } catch (ex) {
      setErr(ex.message || 'Request failed');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Friends</h2>

      <Card title="Add a friend">
        <form onSubmit={sendReq} className="flex gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="flex-1 bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm text-text focus:ring-1 focus:ring-accent outline-none"
          />
          <button type="submit" className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-surface-dark text-sm font-semibold">
            <UserPlus size={14} /> Send
          </button>
        </form>
        {err && <p className="text-sm text-danger mt-2">{err}</p>}
        {msg && <p className="text-sm text-success mt-2">{msg}</p>}
      </Card>

      {data.incoming.length > 0 && (
        <Card title="Incoming requests">
          <ul className="divide-y divide-surface-lighter">
            {data.incoming.map((f) => {
              const fid = f.friendship_id || f.id;
              const who = f.username || f.from_username || `user #${f.from_user_id}`;
              return (
                <li key={fid} className="py-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{who}</span>
                  <div className="flex gap-2">
                    <button onClick={async () => { await acceptFriend(fid); load(); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-success/20 text-success text-xs">
                      <Check size={12} /> Accept
                    </button>
                    <button onClick={async () => { await declineFriend(fid); load(); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-surface-light text-text-muted text-xs">
                      <X size={12} /> Decline
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {data.outgoing.length > 0 && (
        <Card title="Pending — sent">
          <ul className="divide-y divide-surface-lighter">
            {data.outgoing.map((f) => {
              const fid = f.friendship_id || f.id;
              const who = f.username || f.to_username || `user #${f.to_user_id}`;
              return (
                <li key={fid} className="py-2 flex items-center justify-between opacity-60">
                  <span className="text-sm">{who}</span>
                  <span className="text-xs text-text-muted">awaiting</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title="Your friends">
        {data.accepted.length ? (
          <ul className="divide-y divide-surface-lighter">
            {data.accepted.map((f) => {
              const agg = f.aggregates || {};
              const uid = f.user_id || f.id;
              const volume = f.volume_30d ?? agg.volume_kg_30d;
              const sessions = f.sessions_30d ?? agg.sessions_30d;
              const cardio = f.cardio_km_30d ?? agg.cardio_km_30d;
              return (
                <li key={uid} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{f.username || f.name}</p>
                    <p className="text-xs text-text-muted">
                      {volume != null && <>Vol 30d: {Math.round(volume).toLocaleString()} · </>}
                      {sessions != null && <>Sessions: {sessions} · </>}
                      {cardio != null && <>Cardio: {cardio.toFixed(1)} km</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link to={`/compare?friend=${uid}`} className="px-3 py-1.5 rounded bg-accent/15 text-accent text-xs font-semibold">
                      Compare
                    </Link>
                    <Link to={`/profile?userId=${uid}`} className="px-3 py-1.5 rounded bg-surface-light text-xs">
                      Profile
                    </Link>
                    <button onClick={async () => { if (confirm('Remove friend?')) { await removeFriend(uid); load(); } }} className="text-text-muted hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">No friends yet. Send a request above.</p>
        )}
      </Card>
    </div>
  );
}
