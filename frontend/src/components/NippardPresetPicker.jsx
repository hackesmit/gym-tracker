import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { importSharedProgram } from '../api/client';

const VARIANTS = [
  { freq: 2, code: 'NIPPARD2', label: '2x / week', blurb: 'Full-body minimalist' },
  { freq: 3, code: 'NIPPARD3', label: '3x / week', blurb: 'Full-body classic' },
  { freq: 4, code: 'NIPPARD4', label: '4x / week', blurb: 'Upper / lower split' },
  { freq: 5, code: 'NIPPARD5', label: '5x / week', blurb: 'Push / pull / legs split' },
];

export default function NippardPresetPicker({ onImported }) {
  const [busyFreq, setBusyFreq] = useState(null);
  const [error, setError] = useState(null);

  const onPick = async (variant) => {
    setBusyFreq(variant.freq);
    setError(null);
    try {
      await importSharedProgram(variant.code, { activate: true });
      onImported?.();
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setBusyFreq(null);
    }
  };

  return (
    <div>
      <p className="text-xs text-text-muted mb-2">Start with Jeff Nippard&rsquo;s &ldquo;The Essentials&rdquo;</p>
      <div className="grid grid-cols-2 gap-2">
        {VARIANTS.map((v) => {
          const isBusy = busyFreq === v.freq;
          const disabled = busyFreq != null;
          return (
            <button
              key={v.freq}
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
      {error && (
        <p className="mt-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
