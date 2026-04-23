import { useEffect, useRef, useState } from 'react';

const ITEM_H = 36;
const VISIBLE = 5;
const PAD = Math.floor(VISIBLE / 2);

function detectTouch() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(hover: none), (pointer: coarse)').matches
    || 'ontouchstart' in window
    || navigator.maxTouchPoints > 0;
}

function WheelColumn({ value, max, onChange, label }) {
  const ref = useRef(null);
  const settleRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const target = value * ITEM_H;
    if (Math.abs(ref.current.scrollTop - target) > 1) {
      ref.current.scrollTop = target;
    }
  }, [value]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(max, idx));
      const snapTarget = clamped * ITEM_H;
      if (Math.abs(el.scrollTop - snapTarget) > 0.5) el.scrollTop = snapTarget;
      if (clamped !== value) onChange(clamped);
    }, 110);
  };

  const items = [];
  for (let i = 0; i <= max; i++) items.push(i);

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</span>
      <div
        ref={ref}
        onScroll={handleScroll}
        className="relative overflow-y-scroll scrollbar-hide snap-y snap-mandatory"
        style={{
          height: `${ITEM_H * VISIBLE}px`,
          width: '4.5rem',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 28%, black 72%, transparent)',
          maskImage: 'linear-gradient(to bottom, transparent, black 28%, black 72%, transparent)',
        }}
      >
        <div style={{ height: `${ITEM_H * PAD}px` }} />
        {items.map((n) => {
          const active = n === value;
          return (
            <div
              key={n}
              className={`flex items-center justify-center snap-center font-mono select-none transition-colors ${
                active ? 'text-accent text-xl font-bold' : 'text-text-muted text-base'
              }`}
              style={{ height: `${ITEM_H}px` }}
            >
              {String(n).padStart(2, '0')}
            </div>
          );
        })}
        <div style={{ height: `${ITEM_H * PAD}px` }} />
      </div>
    </div>
  );
}

export default function DurationPicker({ minutes, seconds, onChange, maxMinutes = 240 }) {
  const [touch, setTouch] = useState(false);
  useEffect(() => { setTouch(detectTouch()); }, []);

  const safeMin = Number.isFinite(+minutes) ? Math.max(0, Math.min(maxMinutes, Math.floor(+minutes))) : 0;
  const safeSec = Number.isFinite(+seconds) ? Math.max(0, Math.min(59, Math.floor(+seconds))) : 0;

  if (touch) {
    return (
      <div className="relative bg-surface-light border border-surface-lighter rounded-lg py-2">
        <div
          className="pointer-events-none absolute left-3 right-3 top-1/2 -translate-y-1/2 border-y border-accent/40 bg-accent/5 rounded"
          style={{ height: `${ITEM_H}px` }}
        />
        <div className="relative flex items-center justify-center gap-2">
          <WheelColumn
            value={safeMin}
            max={maxMinutes}
            label="min"
            onChange={(v) => onChange({ minutes: v, seconds: safeSec })}
          />
          <span className="self-center text-2xl font-bold text-text-muted pb-1">:</span>
          <WheelColumn
            value={safeSec}
            max={59}
            label="sec"
            onChange={(v) => onChange({ minutes: safeMin, seconds: v })}
          />
        </div>
      </div>
    );
  }

  const cls = 'w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm text-text focus:ring-1 focus:ring-accent outline-none';
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">Min</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={maxMinutes}
          value={minutes}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ minutes: v === '' ? '' : Math.max(0, Math.min(maxMinutes, +v || 0)), seconds: safeSec });
          }}
          className={cls}
          placeholder="0"
        />
      </div>
      <span className="pb-2 text-lg font-bold text-text-muted">:</span>
      <div className="flex-1">
        <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">Sec</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          value={seconds}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ minutes: safeMin, seconds: v === '' ? '' : Math.max(0, Math.min(59, +v || 0)) });
          }}
          className={cls}
          placeholder="00"
        />
      </div>
    </div>
  );
}

export function formatDuration(totalMinutes) {
  if (totalMinutes == null) return '--';
  const safe = Math.max(0, +totalMinutes);
  const m = Math.floor(safe);
  const s = Math.round((safe - m) * 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function splitDuration(totalMinutes) {
  if (totalMinutes == null || totalMinutes === '') return { minutes: 0, seconds: 0 };
  const safe = Math.max(0, +totalMinutes);
  const m = Math.floor(safe);
  let s = Math.round((safe - m) * 60);
  if (s === 60) return { minutes: m + 1, seconds: 0 };
  return { minutes: m, seconds: s };
}

export function combineDuration(minutes, seconds) {
  const m = +minutes || 0;
  const s = +seconds || 0;
  return +(m + s / 60).toFixed(4);
}
