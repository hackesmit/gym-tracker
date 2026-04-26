import { kgToDisplay } from '../utils/units';
import SetBwPrompt from './SetBwPrompt';

function ExternalLayout({ set, unitLabel, weightHint, onUpdate, onTriggerTimer }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem_2rem] sm:grid-cols-[2rem_1fr_1fr_5rem_2.5rem] gap-1.5 sm:gap-2 items-end relative">
      <span className="text-xs text-text-muted text-center pb-2">{set.set_number}</span>
      <div className="relative">
        <label htmlFor={`load-${set.set_number}`} className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          {unitLabel}{weightHint ? ` ${weightHint}` : ''}
        </label>
        <input
          id={`load-${set.set_number}`}
          type="number" inputMode="decimal" value={set.load_kg}
          onChange={(e) => onUpdate('load_kg', e.target.value)}
          className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-accent outline-none min-w-0"
          placeholder="0"
        />
      </div>
      <RepsInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
      <RpeInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
      <DsButton set={set} onUpdate={onUpdate} />
    </div>
  );
}

function BwChip({ userBodyweightKg, unitLabel, units, onSetBw }) {
  const bwDisplay = userBodyweightKg ? kgToDisplay(userBodyweightKg, units) : null;
  return (
    <div className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text-muted min-h-[42px] flex items-center">
      {bwDisplay !== null ? (
        <span>{bwDisplay}</span>
      ) : (
        <SetBwPrompt unitLabel={unitLabel} onSubmit={onSetBw} />
      )}
    </div>
  );
}

function PureBwLayout({ set, userBodyweightKg, unitLabel, units, onUpdate, onTriggerTimer, onSetBw }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr_1fr_3.5rem] sm:grid-cols-[2rem_1fr_1fr_5rem] gap-1.5 sm:gap-2 items-end">
      <span className="text-xs text-text-muted text-center pb-2">{set.set_number}</span>
      <div className="relative">
        <span className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
          BW (auto, {unitLabel})
        </span>
        <BwChip userBodyweightKg={userBodyweightKg} unitLabel={unitLabel} units={units} onSetBw={onSetBw} />
      </div>
      <RepsInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
      <RpeInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
    </div>
  );
}

function WeightedCapableLayout({
  set, userBodyweightKg, unitLabel, units, onUpdate, onTriggerTimer, onSetBw,
}) {
  const added = parseFloat(set.added_load_kg) || 0;
  const totalKg = (userBodyweightKg || 0) + added;
  const totalDisplay = kgToDisplay(totalKg, units);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_3.5rem_2rem] sm:grid-cols-[2rem_1fr_1fr_1fr_5rem_2.5rem] gap-1.5 sm:gap-2 items-end">
        <span className="text-xs text-text-muted text-center pb-2">{set.set_number}</span>
        <div className="relative">
          <span className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
            BW (auto, {unitLabel})
          </span>
          <BwChip userBodyweightKg={userBodyweightKg} unitLabel={unitLabel} units={units} onSetBw={onSetBw} />
        </div>
        <div className="relative">
          <label htmlFor={`added-${set.set_number}`} className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">
            Added {unitLabel}
          </label>
          <input
            id={`added-${set.set_number}`}
            type="number" inputMode="decimal" value={set.added_load_kg ?? ''}
            onChange={(e) => onUpdate('added_load_kg', e.target.value)}
            className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-accent outline-none min-w-0"
            placeholder="0"
          />
        </div>
        <RepsInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
        <RpeInput set={set} onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} />
        <DsButton set={set} onUpdate={onUpdate} />
      </div>
      {userBodyweightKg && (
        <p className="text-[10px] text-text-muted text-right pr-12">
          Total: {totalDisplay} {unitLabel}
        </p>
      )}
    </div>
  );
}

function RepsInput({ set, onUpdate, onTriggerTimer }) {
  return (
    <div className="relative">
      <label className="absolute top-1 left-2.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">Reps</label>
      <input
        type="number" inputMode="numeric" value={set.reps_completed}
        onChange={(e) => onUpdate('reps_completed', e.target.value)}
        onBlur={onTriggerTimer}
        className="bg-surface-light border border-surface-lighter rounded-lg px-2 sm:px-3 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-accent outline-none min-w-0"
        placeholder="0"
      />
    </div>
  );
}

function RpeInput({ set, onUpdate, onTriggerTimer }) {
  return (
    <div className="relative">
      <label className="absolute top-1 left-1.5 text-[9px] uppercase tracking-wider text-text-muted pointer-events-none">RPE</label>
      <input
        type="number" inputMode="decimal" step="0.5" value={set.rpe_actual}
        onChange={(e) => onUpdate('rpe_actual', e.target.value)}
        onBlur={onTriggerTimer}
        className="bg-surface-light border border-surface-lighter rounded-lg px-1.5 sm:px-2 pt-4 pb-1.5 text-sm text-text w-full focus:ring-1 focus:ring-accent outline-none min-w-0"
        placeholder="--"
      />
    </div>
  );
}

function DsButton({ set, onUpdate }) {
  return (
    <button
      type="button"
      onClick={() => onUpdate('is_dropset', !set.is_dropset)}
      title="Drop set"
      aria-label="DS"
      className={`pb-1.5 pt-1 text-[10px] font-bold rounded-lg border transition-colors touch-manipulation ${
        set.is_dropset
          ? 'border-warning bg-warning/15 text-warning'
          : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text'
      }`}
    >
      DS
    </button>
  );
}

export default function SetRow({
  set, bodyweightKind, userBodyweightKg, unitLabel, units,
  weightHint, onUpdate, onTriggerTimer, onSetBw,
}) {
  if (bodyweightKind === 'pure') {
    return <PureBwLayout
      set={set} userBodyweightKg={userBodyweightKg}
      unitLabel={unitLabel} units={units}
      onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} onSetBw={onSetBw}
    />;
  }
  if (bodyweightKind === 'weighted_capable') {
    return <WeightedCapableLayout
      set={set} userBodyweightKg={userBodyweightKg}
      unitLabel={unitLabel} units={units}
      onUpdate={onUpdate} onTriggerTimer={onTriggerTimer} onSetBw={onSetBw}
    />;
  }
  return <ExternalLayout
    set={set} unitLabel={unitLabel} weightHint={weightHint}
    onUpdate={onUpdate} onTriggerTimer={onTriggerTimer}
  />;
}
