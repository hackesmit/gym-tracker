import { useEffect, useState } from 'react';
import { Trophy, Award, Target, Flame, Star, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

function typeIcon(type) {
  if (type.includes('pr')) return <Trophy className="w-5 h-5 text-accent" />;
  if (type === 'streak') return <Flame className="w-5 h-5 text-dwarven-light" />;
  if (type === 'consistency') return <Target className="w-5 h-5 text-secondary-light" />;
  if (type === 'milestone') return <Star className="w-5 h-5 text-accent-light" />;
  if (type === 'badge') return <Award className="w-5 h-5 text-accent" />;
  return <Trophy className="w-5 h-5 text-text-muted" />;
}

function typeLabel(type, lotr) {
  if (type === 'weight_pr' || type === 'e1rm_pr') return lotr ? 'A new record is forged' : 'New PR';
  if (type === 'rep_pr' || type === 'volume_pr') return lotr ? 'Honor earned' : 'New PR';
  if (type === 'streak') return lotr ? 'The Watch continues' : 'Streak extended';
  if (type === 'consistency') return lotr ? 'Honor earned' : 'Consistency';
  if (type === 'milestone') return 'Milestone reached';
  if (type === 'badge') return lotr ? 'Honor earned' : 'Badge earned';
  return 'Achievement';
}

export default function AchievementToast({ achievements = [], onClose }) {
  const [visible, setVisible] = useState(false);
  const { themeMode } = useApp();
  const lotr = themeMode === 'lotr';

  useEffect(() => {
    if (achievements.length === 0) return;
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
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
          className="heraldic-card gold-trim px-4 py-3 flex items-center gap-3 pointer-events-auto shadow-lg"
          style={{
            transform: visible ? 'translateY(0)' : 'translateY(100%)',
            opacity: visible ? 1 : 0,
            transition: `transform 0.3s ease-out ${i * 80}ms, opacity 0.3s ease-out ${i * 80}ms`,
          }}
        >
          {typeIcon(a.type)}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-accent uppercase tracking-wider font-display">
              {typeLabel(a.type, lotr)}
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
