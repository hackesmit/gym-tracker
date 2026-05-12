import { useEffect, useState } from 'react';
import { getMedalLeaderboard } from '../api/client';
import { formatValue, displayUnit } from '../utils/medalFormat';
import MedalBadge from './MedalBadge';
import LoadingSpinner from './LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useT } from '../i18n';

export default function MedalLeaderboardModal({ medal, onClose }) {
  const t = useT();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!medal?.id) return;
    let cancelled = false;
    getMedalLeaderboard(medal.id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'Failed to load leaderboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [medal?.id]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!medal) return null;

  const entries = data?.entries || [];
  const m = data?.medal || medal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg sm:rounded-2xl bg-surface text-text border border-surface-lighter shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 p-4 border-b border-surface-lighter">
          <MedalBadge icon={m.icon} category={m.category} size={56} title={m.name} />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted">{m.category}</p>
            <h3 className="font-semibold text-base sm:text-lg leading-tight">{m.name}</h3>
            <p className="text-xs text-text-muted mt-1">{t('medals.leaderboard.title') || 'Leaderboard'}</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl leading-none px-2 -mr-2 touch-manipulation"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="overflow-y-auto p-4 flex-1">
          {loading && <LoadingSpinner />}
          {err && <p className="text-sm text-danger">{err}</p>}
          {!loading && !err && entries.length === 0 && (
            <p className="text-sm text-text-muted">
              {t('medals.leaderboard.empty') || 'No records yet.'}
            </p>
          )}
          {!loading && !err && entries.length > 0 && (
            <ul className="space-y-1">
              {entries.map((e) => {
                const isMe = user && e.user_id === user.id;
                return (
                  <li
                    key={e.user_id}
                    data-testid="leaderboard-row"
                    data-current-user={isMe ? 'true' : 'false'}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                      isMe
                        ? 'border-accent/40 bg-accent/5'
                        : 'border-surface-lighter bg-surface-light'
                    }`}
                  >
                    <span className="text-sm font-medium truncate">{e.username}</span>
                    <span className="text-sm font-mono tabular-nums">
                      {formatValue(e.value, m.unit, m.higher_is_better)}
                      {m.unit && <span className="text-text-muted ml-1">{displayUnit(m.unit)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
