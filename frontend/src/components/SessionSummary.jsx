import { Check, Trophy, Copy } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';

export default function SessionSummary({ sets, prList, sessionName, week, units, convert, unitLabel, onLogAnother }) {
  const [copied, setCopied] = useState(false);
  const { themeMode } = useApp();
  const lotr = themeMode === 'lotr';
  const t = useT();

  const weightedSets = sets.filter(s => s.load_kg > 0);
  const countedSets = sets.filter(s => s.load_kg > 0 || s.is_bodyweight);
  const exercises = new Set(sets.map(s => s.exercise_name));
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
    <div className="chronicle-card p-5 space-y-4">
      {/* Chronicle header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-full flex items-center justify-center"
             style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent 85%)' }}>
          <Check className="w-4 h-4 text-accent" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-text tracking-wide">{sessionName}</p>
          <p className="text-text-muted text-xs">Week {week} · {dateStr}</p>
        </div>
      </div>

      <p className="text-xs text-text-muted italic">
        {lotr ? t('summary.completeLotr') : t('summary.complete')}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <StatBlock label={t('summary.volume')} value={`${formatVolume(displayVolume)}`} unit={unitLabel} />
        <StatBlock label={t('summary.topSet')} value={topSet ? topSet.exercise_name : '—'} sub={topSet ? `${Math.round(topSet.load_kg)} ${unitLabel} × ${topSet.reps_completed}` : null} />
        <StatBlock label={t('common.exercises')} value={exercises.size} />
        <StatBlock label={t('common.sets')} value={countedSets.length} />
      </div>

      {prList?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
            {lotr ? t('summary.recordsForged') : t('summary.newPRs')}
          </p>
          {prList.map((pr, i) => (
            <div key={i} className="flex items-center gap-2 forged-panel px-3 py-2">
              <Trophy className="w-4 h-4 text-dwarven-light shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text truncate">{pr.exercise}</p>
                <p className="text-xs text-text-muted">
                  e1RM {Math.round(convert(pr.new_e1rm))} {unitLabel}
                  <span className="text-success ml-1">+{Math.round(convert(pr.new_e1rm - pr.previous_e1rm))} {unitLabel}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 text-sm text-accent hover:text-accent-light transition-colors">
          <Copy className="w-3.5 h-3.5" />
          {copied ? t('common.copied') : (lotr ? t('summary.copyChronicle') : t('summary.copySummary'))}
        </button>
        <button onClick={onLogAnother} className="flex-1 btn-gold text-sm py-2">
          {t('logger.logAnother')}
        </button>
      </div>
    </div>
  );
}

function StatBlock({ label, value, unit, sub }) {
  return (
    <div className="bg-surface-lighter/30 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-lg font-bold text-text truncate">
        {value} {unit && <span className="text-xs font-normal text-text-muted">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
