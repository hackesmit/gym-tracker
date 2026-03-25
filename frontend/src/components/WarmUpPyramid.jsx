import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function WarmUpPyramid({ workingWeight, units, unitLabel }) {
  const [open, setOpen] = useState(false);
  const bar = units === 'lbs' ? 45 : 20;
  const step = units === 'lbs' ? 5 : 2.5;

  if (!workingWeight || workingWeight <= bar) return null;

  const round = (w) => Math.round(w / step) * step;

  const sets = [
    { label: 'Bar × 10', weight: bar },
    { label: '40% × 8', weight: round(workingWeight * 0.4) },
    { label: '60% × 5', weight: round(workingWeight * 0.6) },
    { label: '80% × 3', weight: round(workingWeight * 0.8) },
  ].filter((s, i) => i === 0 || s.weight > bar);

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors"
      >
        Warm-up
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="mt-1 rounded border border-surface-lighter bg-surface-light">
          {sets.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs text-text-muted px-2 py-1"
            >
              <span>{s.label}</span>
              <span>{s.weight} {unitLabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
