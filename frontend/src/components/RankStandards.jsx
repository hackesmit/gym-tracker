import { useEffect, useState } from 'react';
import { getRankStandards } from '../api/client';
import { useT } from '../i18n';

/**
 * RankStandards — expandable reference showing the 7-tier ladder for each
 * muscle group. Fetched from GET /api/ranks/standards on first expand.
 *
 * Props:
 *   currentRanks  array of the user's current { muscle_group, rank } entries
 *                 (used to highlight the row they're currently on)
 */
export default function RankStandards({ currentRanks = [] }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const currentTierByGroup = Object.fromEntries(
    currentRanks.map((r) => [r.muscle_group, r.rank])
  );

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !data && !loading) {
      setLoading(true);
      try {
        const payload = await getRankStandards();
        setData(payload);
      } catch (ex) {
        setErr(ex?.message || 'Failed to load rank standards.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="btn-ghost-dashed w-full text-left flex items-center justify-between py-3 px-4"
        aria-expanded={expanded}
      >
        <span>{t('profile.rankStandards.title', 'Rank standards')}</span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {loading && <p className="text-sm text-text-muted">{t('common.loading', 'Loading…')}</p>}
          {err && <p className="text-sm text-danger">{err}</p>}
          {data && data.groups.map((g) => (
            <div key={g.key} className="stone-panel p-4">
              <p className="text-base font-semibold">{g.label}</p>
              <p className="mono-label mt-1">{g.metric}</p>

              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-sm">
                {data.tiers.map((tier) => {
                  const threshold = g.thresholds[tier];
                  const isCurrent = currentTierByGroup[g.key] === tier;
                  return (
                    <li
                      key={tier}
                      className={`flex items-center justify-between py-1 ${isCurrent ? 'text-accent font-semibold' : ''}`}
                    >
                      <span>{tier}</span>
                      <span className="font-mono text-xs text-text-muted">
                        {tier === 'Copper' ? '—' : (threshold != null ? `≥ ${threshold.toFixed(2)}` : '—')}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-3 mono-label opacity-60">
                {t('profile.rankStandards.subdivisions',
                  'Each non-Champion tier is subdivided into 5 equal slots (V → I). Champion is a single elite tier.')}
              </p>

              {g.qualifying_exercises?.length > 0 && (
                <details className="mt-3">
                  <summary className="mono-label cursor-pointer">
                    {t('profile.rankStandards.qualifying', 'Qualifying exercises')}
                  </summary>
                  <p className="text-xs text-text-muted mt-2 leading-relaxed">
                    {g.qualifying_exercises.join(' · ')}
                  </p>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
