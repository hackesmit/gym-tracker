const JOURNEY_STAGES = [
  { key: 'shire',     img: '/lotr/badge-shire.png',     label: 'The Shire',       unlock: 0 },
  { key: 'rivendell', img: '/lotr/badge-rivendell.png', label: 'Rivendell',        unlock: 10 },
  { key: 'mountains', img: '/lotr/badge-mountains.png', label: 'Misty Mountains',  unlock: 25 },
  { key: 'crown',     img: '/lotr/badge-crown.png',     label: 'Lothlórien',       unlock: 50 },
  { key: 'balrog',    img: '/lotr/badge-balrog.png',     label: 'Moria',            unlock: 100 },
  { key: 'gondor',    img: '/lotr/badge-gondor.png',     label: 'Minas Tirith',     unlock: 200 },
  { key: 'ring',      img: '/lotr/logo.jpg',             label: 'Ring Bearer',      unlock: 500 },
];

export default function JourneyProgress({ sessionCount = 0 }) {
  const currentStageIdx = JOURNEY_STAGES.reduce(
    (best, stage, i) => (sessionCount >= stage.unlock ? i : best), 0
  );

  // Progress within current stage toward next
  const current = JOURNEY_STAGES[currentStageIdx];
  const next = JOURNEY_STAGES[currentStageIdx + 1];
  const stageProgress = next
    ? Math.min(((sessionCount - current.unlock) / (next.unlock - current.unlock)) * 100, 100)
    : 100;

  return (
    <div className="space-y-4">
      {/* Stage label */}
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-display font-semibold">
          Current Stage
        </p>
        <p className="font-display text-lg font-semibold text-text mt-1">
          {current.label}
        </p>
        {next && (
          <p className="text-xs text-text-muted mt-0.5">
            {sessionCount} / {next.unlock} sessions to {next.label}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {next && (
        <div className="w-full bg-surface-lighter rounded-full h-2">
          <div
            className="bg-accent rounded-full h-2 transition-all duration-500"
            style={{ width: `${stageProgress}%` }}
          />
        </div>
      )}

      {/* Badge row */}
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {JOURNEY_STAGES.map((stage, i) => {
          const unlocked = sessionCount >= stage.unlock;
          const isCurrent = i === currentStageIdx;

          return (
            <div key={stage.key} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              <div
                className={`relative rounded-full p-1 transition-all ${
                  isCurrent
                    ? 'ring-2 ring-accent shadow-glow'
                    : unlocked
                      ? 'ring-1 ring-accent/30'
                      : ''
                }`}
              >
                <img
                  src={stage.img}
                  alt={stage.label}
                  className={`w-10 h-10 sm:w-14 sm:h-14 object-contain rounded-full transition-all ${
                    unlocked ? '' : 'grayscale opacity-30'
                  }`}
                />
              </div>
              <span
                className={`text-[8px] sm:text-[10px] text-center leading-tight ${
                  isCurrent ? 'text-accent font-semibold' : unlocked ? 'text-text-muted' : 'text-text-muted/40'
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
