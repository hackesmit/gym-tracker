import { useEffect, useState } from 'react';
import { Trophy, Award, Target, Flame, Star } from 'lucide-react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { getAchievements } from '../api/client';
import { useApp } from '../context/AppContext';

const TIER_COLORS = {
  novice: 'text-text-muted border-text-muted/30',
  intermediate: 'text-primary border-primary/30',
  advanced: 'text-purple-400 border-purple-400/30',
  elite: 'text-warning border-warning/30',
};

function typeIcon(type) {
  if (type.includes('pr')) return <Trophy className="w-5 h-5 text-warning" />;
  if (type === 'streak') return <Flame className="w-5 h-5 text-orange-400" />;
  if (type === 'consistency') return <Target className="w-5 h-5 text-primary" />;
  if (type === 'milestone') return <Star className="w-5 h-5 text-purple-400" />;
  if (type === 'badge') return <Award className="w-5 h-5 text-warning" />;
  return <Trophy className="w-5 h-5 text-text-muted" />;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Achievements() {
  const { convert, unitLabel } = useApp();
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAchievements()
      .then(setAchievements)
      .catch(() => setAchievements([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const recentPRs = achievements
    .filter((a) => a.type.includes('pr') && now - new Date(a.achieved_at).getTime() < thirtyDays)
    .sort((a, b) => new Date(b.achieved_at) - new Date(a.achieved_at));

  // Best e1rm per exercise
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
      <h1 className="text-2xl font-bold text-text flex items-center gap-2">
        <Trophy className="w-6 h-6 text-warning" /> Achievements
      </h1>

      {/* Recent PRs */}
      <Card title="Recent PRs (Last 30 Days)">
        {recentPRs.length === 0 ? (
          <p className="text-text-muted text-sm">No recent PRs — keep pushing!</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentPRs.map((a) => (
              <div key={a.id} className="bg-surface-light rounded-lg p-4 border border-surface-lighter">
                <div className="flex items-center gap-2 mb-2">
                  {typeIcon(a.type)}
                  <span className="text-sm font-semibold text-text truncate">{a.exercise_name}</span>
                </div>
                <p className="text-lg font-bold text-text">{fmtWeight(a.value)}</p>
                {a.previous_value != null && (
                  <p className="text-xs text-green-400">+{fmtWeight(a.value - a.previous_value)}</p>
                )}
                <p className="text-xs text-text-muted mt-1">{formatDate(a.achieved_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* All-Time Records */}
      <Card title="All-Time Records (Est. 1RM)">
        {allTimeRecords.length === 0 ? (
          <p className="text-text-muted text-sm">No records yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allTimeRecords.map((a) => (
              <div key={a.exercise_name} className="bg-surface-light rounded-lg p-4 flex items-center gap-3">
                <Star className="w-5 h-5 text-warning shrink-0" />
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
              <div key={a.id} className="bg-surface-light rounded-lg p-4 flex items-center gap-3">
                {typeIcon(a.type)}
                <div>
                  <p className="text-sm font-semibold text-text">{a.exercise_name || a.type}</p>
                  <p className="text-xs text-text-muted">
                    {a.value} &middot; {formatDate(a.achieved_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Badges */}
      <Card title="Badges">
        {badges.length === 0 ? (
          <p className="text-text-muted text-sm">No badges earned yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((a) => {
              const tierCls = TIER_COLORS[a.tier] || TIER_COLORS.novice;
              return (
                <div key={a.id} className={`rounded-lg p-4 border bg-surface-light ${tierCls}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase tracking-wider">{a.tier || 'badge'}</span>
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
