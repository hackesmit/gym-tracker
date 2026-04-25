import { Link } from 'react-router-dom';
import MedalBadge from './MedalBadge';
import Card from './Card';
import { useApp } from '../context/AppContext';

const BIG_FOUR = [
  { key: 'bench',    label: 'Bench Press',    icon: 'bench' },
  { key: 'squat',    label: 'Squat',          icon: 'squat' },
  { key: 'deadlift', label: 'Deadlift',       icon: 'deadlift' },
  { key: 'ohp',      label: 'Overhead Press', icon: 'ohp' },
];

function formatDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

/**
 * Pulls bench / squat / deadlift / ohp from either:
 *   - an array of medal rows from /api/medals/my (each has `metric_type`)
 *   - a `big_four` map from /api/dashboard
 *
 * Empty slots render locked so the user sees what's missing.
 */
export default function BigFourCard({ medals, bigFour, compact = false }) {
  const { convert, unitLabel } = useApp();

  const entries = {};
  if (bigFour && typeof bigFour === 'object') {
    for (const { key } of BIG_FOUR) {
      if (bigFour[key]) entries[key] = bigFour[key];
    }
  }
  if (Array.isArray(medals)) {
    for (const m of medals) {
      const mt = m.metric_type || '';
      if (!mt.startsWith('strength_1rm:')) continue;
      const lift = mt.split(':', 2)[1];
      if (entries[lift]) continue;
      entries[lift] = {
        value: m.value,
        unit: m.unit,
        updated_at: m.updated_at,
        tested_at: m.tested_at,
      };
    }
  }

  const badgeSize = compact ? 44 : 56;

  return (
    <Card
      title="Big Four"
      action={
        <Link to="/settings" className="text-xs text-accent">
          Enter 1RM
        </Link>
      }
    >
      <div className="grid grid-cols-4 gap-3">
        {BIG_FOUR.map(({ key, label, icon }) => {
          const entry = entries[key];
          const value = entry?.value;
          const dateStr = formatDate(entry?.tested_at || entry?.updated_at);
          const displayValue =
            value != null ? Math.round(convert(value) * 10) / 10 : null;
          return (
            <div
              key={key}
              className="flex flex-col items-center gap-1.5 text-center"
            >
              <MedalBadge
                icon={icon}
                category="strength"
                size={badgeSize}
                locked={value == null}
                title={label}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted leading-tight">
                {label}
              </span>
              {displayValue != null ? (
                <>
                  <span className="font-display text-lg font-semibold leading-none">
                    {displayValue}
                    <span className="text-xs text-text-muted ml-1">{unitLabel}</span>
                  </span>
                  {dateStr && (
                    <span className="text-[10px] text-text-muted font-mono">{dateStr}</span>
                  )}
                </>
              ) : (
                <span className="text-[10px] text-text-muted italic">not set</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
