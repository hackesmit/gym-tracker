import { Check, Trophy, Copy } from 'lucide-react';
import { useState } from 'react';

export default function SessionSummary({ sets, prList, sessionName, week, units, convert, unitLabel, onLogAnother }) {
  const [copied, setCopied] = useState(false);

  const weightedSets = sets.filter(s => s.load_kg > 0);
  const countedSets = sets.filter(s => s.load_kg > 0 || s.is_bodyweight);
  const exercises = new Set(sets.map(s => s.exercise_name));
  // load_kg in Logger state is already in display units (lbs or kg)
  const displayVolume = Math.round(weightedSets.reduce((sum, s) => sum + s.load_kg * s.reps_completed, 0));

  const topSet = weightedSets.reduce((best, s) => {
    const e1rm = s.load_kg * (1 + s.reps_completed / 30);
    return e1rm > (best?.e1rm || 0) ? { ...s, e1rm } : best;
  }, null);

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatVolume = (v) => v.toLocaleString();

  const clipboardText = [
    `${sessionName} — Week ${week} — ${dateStr}`,
    `${exercises.size} exercises · ${countedSets.length} sets · ${formatVolume(displayVolume)} ${unitLabel} total volume`,
    topSet && `Top set: ${topSet.exercise_name} ${Math.round(topSet.load_kg)} ${unitLabel} × ${topSet.reps_completed}`,
    ...(prList || []).map(pr => {
      const diff = Math.round(convert(pr.new_e1rm - pr.previous_e1rm));
      return `PR: ${pr.exercise} e1RM ${Math.round(convert(pr.new_e1rm))} ${unitLabel} (+${diff} ${unitLabel})`;
    }),
  ].filter(Boolean).join('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(clipboardText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-surface border border-surface-lighter rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
          <Check className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-text font-bold text-sm">{sessionName}</p>
          <p className="text-text-muted text-xs">Week {week} · {dateStr}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface-lighter/50 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Volume</p>
          <p className="text-lg font-bold text-text">{formatVolume(displayVolume)} <span className="text-xs font-normal text-text-muted">{unitLabel}</span></p>
        </div>
        <div className="bg-surface-lighter/50 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Top Set</p>
          <p className="text-sm font-bold text-text truncate">
            {topSet ? `${topSet.exercise_name}` : '—'}
          </p>
          {topSet && <p className="text-xs text-text-muted">{Math.round(topSet.load_kg)} {unitLabel} × {topSet.reps_completed}</p>}
        </div>
        <div className="bg-surface-lighter/50 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Exercises</p>
          <p className="text-lg font-bold text-text">{exercises.size}</p>
        </div>
        <div className="bg-surface-lighter/50 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Sets</p>
          <p className="text-lg font-bold text-text">{countedSets.length}</p>
        </div>
      </div>

      {prList?.length > 0 && (
        <div className="space-y-2">
          {prList.map((pr, i) => (
            <div key={i} className="flex items-center gap-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
              <Trophy className="w-4 h-4 text-warning shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text truncate">{pr.exercise}</p>
                <p className="text-xs text-text-muted">
                  e1RM {Math.round(convert(pr.new_e1rm))} {unitLabel}
                  <span className="text-green-400 ml-1">+{Math.round(convert(pr.new_e1rm - pr.previous_e1rm))} {unitLabel}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 text-sm text-primary hover:text-primary/80 transition-colors">
          <Copy className="w-3.5 h-3.5" />
          {copied ? 'Copied!' : 'Copy Summary'}
        </button>
        <button onClick={onLogAnother} className="flex-1 bg-primary text-white text-sm font-semibold py-2 rounded-lg hover:bg-primary/90 transition-colors">
          Log another session
        </button>
      </div>
    </div>
  );
}
