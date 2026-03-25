import { useEffect, useState } from 'react';
import { Trophy, Award, Target, Flame, Star, X } from 'lucide-react';

function typeIcon(type) {
  if (type.includes('pr')) return <Trophy className="w-5 h-5 text-warning" />;
  if (type === 'streak') return <Flame className="w-5 h-5 text-orange-400" />;
  if (type === 'consistency') return <Target className="w-5 h-5 text-primary" />;
  if (type === 'milestone') return <Star className="w-5 h-5 text-purple-400" />;
  if (type === 'badge') return <Award className="w-5 h-5 text-warning" />;
  return <Trophy className="w-5 h-5 text-text-muted" />;
}

function typeLabel(type) {
  if (type === 'weight_pr') return 'Weight PR';
  if (type === 'e1rm_pr') return 'Est. 1RM PR';
  if (type === 'rep_pr') return 'Rep PR';
  if (type === 'volume_pr') return 'Volume PR';
  if (type === 'streak') return 'Streak';
  if (type === 'consistency') return 'Consistency';
  if (type === 'milestone') return 'Milestone';
  if (type === 'badge') return 'Badge Earned';
  return 'Achievement';
}

export default function AchievementToast({ achievements = [], onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (achievements.length === 0) return;
    // Trigger slide-in on next frame
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // wait for slide-out animation
    }, 4000);

    return () => clearTimeout(timer);
  }, [achievements, onClose]);

  if (achievements.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}
    >
      {achievements.map((a, i) => (
        <div
          key={a.id ?? i}
          className="bg-surface-light border border-warning/30 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 pointer-events-auto"
          style={{
            transform: visible ? 'translateY(0)' : 'translateY(100%)',
            opacity: visible ? 1 : 0,
            transition: `transform 0.3s ease-out ${i * 80}ms, opacity 0.3s ease-out ${i * 80}ms`,
          }}
        >
          {typeIcon(a.type)}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-warning uppercase tracking-wider">
              {typeLabel(a.type)}
            </p>
            <p className="text-sm text-text font-medium truncate">
              {a.exercise_name ? `${a.exercise_name} — ${a.value}` : a.value}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setVisible(false);
              setTimeout(onClose, 300);
            }}
            className="text-text-muted hover:text-text shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
