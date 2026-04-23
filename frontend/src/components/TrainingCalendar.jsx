/**
 * TrainingCalendar — month-view grid showing per-day training types.
 *
 * Different from the year-long `TrainingHeatmap` (GitHub-style density).
 * This renders one month at a time with colored dots per training type
 * so the user can see at a glance whether a day was strength, cardio,
 * both, or just a body-metric check-in.
 *
 * Props:
 *   days  — array of { date: 'YYYY-MM-DD', strength, cardio: [...], body_metric }
 *   initialMonth — Date to show first (defaults to current month)
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DOT_COLORS = {
  strength:   { bg: 'var(--cat-strength, #d96848)', label: 'Strength' },
  run:        { bg: 'var(--cat-endurance, #4a9cd9)', label: 'Run' },
  bike:       { bg: '#6fa8dc', label: 'Bike' },
  swim:       { bg: '#7ed3e0', label: 'Swim' },
  other:      { bg: '#9fbad6', label: 'Cardio' },
  body:       { bg: 'var(--cat-consistency, #5aa36a)', label: 'Body metric' },
};

function monthBounds(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start, end };
}

function isoDate(d) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
}

function formatMonthYear(d) {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function cardioDotTypes(cardio = []) {
  if (!cardio.length) return [];
  const seen = new Set();
  const out = [];
  for (const c of cardio) {
    const key = DOT_COLORS[c.modality] ? c.modality : 'other';
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

export default function TrainingCalendar({ days = [], initialMonth = null }) {
  const [cursor, setCursor] = useState(() => {
    if (initialMonth instanceof Date) return initialMonth;
    const now = new Date();
    now.setDate(1);
    return now;
  });

  const dayMap = useMemo(() => {
    const m = new Map();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const { start, end } = monthBounds(cursor);
  const todayIso = isoDate(new Date());

  // Remap so Monday is column 0 (matches the existing heatmap).
  const remapDow = (d) => (d === 0 ? 6 : d - 1);
  const padStart = remapDow(start.getDay());
  const totalCells = padStart + end.getDate();
  const rowCount = Math.ceil(totalCells / 7);

  const cells = [];
  for (let i = 0; i < rowCount * 7; i++) {
    if (i < padStart || i >= padStart + end.getDate()) {
      cells.push(null);
    } else {
      const day = i - padStart + 1;
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      cells.push({ date: d, iso: isoDate(d) });
    }
  }

  const dowLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const shiftMonth = (delta) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next);
  };

  const legendEntries = Object.entries(DOT_COLORS);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="p-1.5 rounded-lg bg-surface-light hover:bg-surface-lighter text-text-muted hover:text-text transition-colors touch-manipulation"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold tracking-wide capitalize">
          {formatMonthYear(cursor)}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="p-1.5 rounded-lg bg-surface-light hover:bg-surface-lighter text-text-muted hover:text-text transition-colors touch-manipulation"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-text-muted uppercase tracking-wider mb-1 text-center">
        {dowLabels.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={idx} className="aspect-square" />;
          const info = dayMap.get(cell.iso);
          const cardioTypes = info ? cardioDotTypes(info.cardio) : [];
          const isToday = cell.iso === todayIso;
          const hasAny = info && (info.strength || cardioTypes.length || info.body_metric);
          const title = info
            ? [
                info.strength ? 'Strength' : null,
                ...cardioTypes.map((t) => DOT_COLORS[t]?.label || t),
                info.body_metric ? 'Body metric' : null,
              ].filter(Boolean).join(' · ')
            : '';
          return (
            <div
              key={idx}
              title={title ? `${cell.iso}: ${title}` : cell.iso}
              className={`aspect-square rounded-lg flex flex-col items-center justify-between p-1 transition-colors ${
                hasAny ? 'bg-surface-light' : 'bg-surface-light/40'
              } ${isToday ? 'ring-1 ring-accent/70' : ''}`}
            >
              <span className={`text-[10px] leading-none self-start ${isToday ? 'text-accent font-semibold' : 'text-text-muted'}`}>
                {cell.date.getDate()}
              </span>
              <div className="flex gap-0.5 flex-wrap justify-center mb-0.5">
                {info?.strength && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: DOT_COLORS.strength.bg }} />
                )}
                {cardioTypes.map((t) => (
                  <span key={t} className="w-1.5 h-1.5 rounded-full" style={{ background: DOT_COLORS[t].bg }} />
                ))}
                {info?.body_metric && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: DOT_COLORS.body.bg }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] text-text-muted">
        {legendEntries.map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: v.bg }} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  );
}
