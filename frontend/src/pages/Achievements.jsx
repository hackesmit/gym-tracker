import { useEffect, useState } from 'react';
import { Trophy, Award, Target, Flame, Star } from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import JourneyProgress from '../components/JourneyProgress';
import { getAchievements, getSummary } from '../api/client';
import { useApp } from '../context/AppContext';

/* ─── Icon mapping by type ─── */
function typeIcon(type) {
  if (type === 'e1rm_pr') return <RingIcon className="w-5 h-5 text-accent" />;
  if (type === 'weight_pr') return <SwordIcon className="w-5 h-5 text-dwarven-light" />;
  if (type === 'rep_pr' || type === 'volume_pr') return <Trophy className="w-5 h-5 text-accent" />;
  if (type === 'streak') return <TorchIcon className="w-5 h-5 text-dwarven-light" />;
  if (type === 'consistency') return <ShieldIcon className="w-5 h-5 text-secondary-light" />;
  if (type === 'milestone') return <MountainIcon className="w-5 h-5 text-accent-light" />;
  if (type === 'badge') return <Award className="w-5 h-5 text-accent" />;
  return <Trophy className="w-5 h-5 text-text-muted" />;
}

/* ─── Inline LOTR SVG icons (small, performant) ─── */
function RingIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" />
    </svg>
  );
}

function SwordIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v14M9 4l3-2 3 2M9 16l3 2 3-2M10 20h4v2h-4z" />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5.25-3.5 8.5-8 10-4.5-1.5-8-4.75-8-10V6l8-4z" /><path d="M12 6v12" />
    </svg>
  );
}

function TorchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V10M9 22h6" /><path d="M8 10h8l-1-4H9L8 10z" /><path d="M10 6c0-2 2-4 2-4s2 2 2 4" />
    </svg>
  );
}

function MountainIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20L9 8l4 6 3-4 5 10H3z" />
    </svg>
  );
}

/* ─── Tier styling ─── */
const TIER_STYLES = {
  novice: { cls: 'tier-iron border', label: 'Iron' },
  intermediate: { cls: 'tier-silver border', label: 'Silver' },
  advanced: { cls: 'tier-gold border', label: 'Gold' },
  elite: { cls: 'tier-elite border', label: 'Elite' },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Achievements() {
  const { convert, unitLabel } = useApp();
  const [achievements, setAchievements] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAchievements().catch(() => []),
      getSummary().catch(() => null),
    ]).then(([achList, summary]) => {
      setAchievements(achList);
      setSessionCount(summary?.total_sessions ?? 0);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const recentPRs = achievements
    .filter((a) => a.type.includes('pr') && now - new Date(a.achieved_at).getTime() < thirtyDays)
    .sort((a, b) => new Date(b.achieved_at) - new Date(a.achieved_at));

  const e1rmMap = {};
  achievements
    .filter((a) => a.type === 'e1rm_pr' && a.exercise_name)
    .forEach((a) => {
      const key = a.exercise_name;
      if (!e1rmMap[key] || a.value > e1rmMap[key].value) e1rmMap[key] = a;
    });
  const allTimeRecords = Object.values(e1rmMap).sort((a, b) => b.value - a.value);

  const milestones = achievements.filter((a) =>
    ['milestone', 'streak', 'consistency'].includes(a.type)
  );

  const badges = achievements.filter((a) => a.type === 'badge');
  const fmtWeight = (kg) => `${convert(kg).toFixed(1)} ${unitLabel}`;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-accent" />
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">Hall of Heroes</h1>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 h-px bg-gradient-to-r from-accent/40 via-accent/20 to-transparent" />
          <div className="w-1.5 h-1.5 rotate-45 bg-accent/50" />
          <div className="flex-1 h-px bg-gradient-to-l from-accent/40 via-accent/20 to-transparent" />
        </div>
      </div>

      {/* ─── Journey Progression ─── */}
      <Card title="The Journey" variant="parchment">
        <JourneyProgress sessionCount={sessionCount} />
      </Card>

      {/* Hall of Records — Recent PRs (Dwarven) */}
      <Card title="Hall of Records — Recent PRs" variant="dwarven">
        {recentPRs.length === 0 ? (
          <p className="text-text-muted text-sm">No recent records forged — keep pushing.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentPRs.map((a) => (
              <div key={a.id} className="forged-panel p-4">
                <div className="flex items-center gap-2 mb-2">
                  {typeIcon(a.type)}
                  <span className="text-sm font-semibold text-text truncate">{a.exercise_name}</span>
                </div>
                <p className="text-lg font-bold text-text">{fmtWeight(a.value)}</p>
                {a.previous_value != null && (
                  <p className="text-xs text-success">+{fmtWeight(a.value - a.previous_value)}</p>
                )}
                <p className="text-xs text-text-muted mt-1">{formatDate(a.achieved_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* All-Time Records */}
      <Card title="All-Time Records (Est. 1RM)" variant="dwarven">
        {allTimeRecords.length === 0 ? (
          <p className="text-text-muted text-sm">No records yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allTimeRecords.map((a) => (
              <div key={a.exercise_name} className="forged-panel p-4 flex items-center gap-3">
                <RingIcon className="w-5 h-5 text-accent shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{a.exercise_name}</p>
                  <p className="text-lg font-bold text-text">{fmtWeight(a.value)}</p>
                  <p className="text-xs text-text-muted">{formatDate(a.achieved_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Milestones */}
      <Card title="Milestones">
        {milestones.length === 0 ? (
          <p className="text-text-muted text-sm">No milestones unlocked yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {milestones.map((a) => (
              <div key={a.id} className="stone-panel p-4 flex items-center gap-3">
                {typeIcon(a.type)}
                <div>
                  <p className="text-sm font-semibold text-text">{a.exercise_name || a.type}</p>
                  <p className="text-xs text-text-muted">
                    {a.value} · {formatDate(a.achieved_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Honors (Badges) */}
      <Card title="Honors">
        {badges.length === 0 ? (
          <p className="text-text-muted text-sm">No honors earned yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((a) => {
              const tier = TIER_STYLES[a.tier] || TIER_STYLES.novice;
              return (
                <div key={a.id} className={`stone-panel p-4 ${tier.cls}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="w-5 h-5" />
                    <span className="font-display text-sm font-semibold uppercase tracking-wider">{tier.label}</span>
                  </div>
                  <p className="text-sm text-text">{a.category}: {a.exercise_name || a.value}</p>
                  <p className="text-xs text-text-muted">{formatDate(a.achieved_at)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
