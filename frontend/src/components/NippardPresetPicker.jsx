import { useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { importSharedProgram } from '../api/client';

// Preset programs seeded by the backend (backend/app/seed_presets.py). The
// share codes are stable; the picker groups them by program family.
const FAMILIES = [
  {
    key: 'essentials',
    heading: 'Jeff Nippard’s “The Essentials”',
    variants: [
      { freq: 2, code: 'NIPPARD2', label: '2x / week', blurb: 'Full-body minimalist' },
      { freq: 3, code: 'NIPPARD3', label: '3x / week', blurb: 'Full-body classic' },
      { freq: 4, code: 'NIPPARD4', label: '4x / week', blurb: 'Upper / lower split' },
      { freq: 5, code: 'NIPPARD5', label: '5x / week', blurb: 'Push / pull / legs split' },
    ],
  },
  {
    key: 'minmax',
    heading: 'Jeff Nippard’s “The Min-Max Program”',
    variants: [
      { freq: 5, code: 'MINMAX5', label: '5x / week', blurb: 'Upper / lower + arms, 12 weeks, low volume to failure' },
    ],
  },
];

export default function NippardPresetPicker({ onImported, activate = true, doneMessage }) {
  const [busyCode, setBusyCode] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const onPick = async (variant) => {
    setBusyCode(variant.code);
    setError(null);
    setDone(false);
    try {
      await importSharedProgram(variant.code, { activate });
      setDone(true);
      onImported?.();
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setBusyCode(null);
    }
  };

  const disabled = busyCode != null;

  return (
    <div className="space-y-3">
      {FAMILIES.map((family) => (
        <div key={family.key}>
          <p className="text-xs text-text-muted mb-2">{family.heading}</p>
          <div className="grid grid-cols-2 gap-2">
            {family.variants.map((v) => {
              const isBusy = busyCode === v.code;
              return (
                <button
                  key={v.code}
                  type="button"
                  onClick={() => onPick(v)}
                  disabled={disabled}
                  className="text-left rounded-lg border border-accent/40 bg-surface-light hover:bg-surface-lighter px-3 py-2.5 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{v.label}</span>
                    {isBusy && <Loader2 size={14} className="animate-spin text-accent" />}
                  </div>
                  <span className="block text-[11px] text-text-muted mt-0.5">{v.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {error && (
        <p className="mt-2 text-xs text-danger">{error}</p>
      )}
      {done && doneMessage && (
        <p className="mt-2 text-xs text-success flex items-center gap-1.5">
          <Check size={12} className="shrink-0" /> {doneMessage}
        </p>
      )}
    </div>
  );
}
