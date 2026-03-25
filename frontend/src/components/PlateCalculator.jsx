import { useState } from 'react';
import { X, Calculator } from 'lucide-react';

const PLATES = {
  lbs: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

function calcPlates(target, barWeight, units) {
  if (target <= barWeight) return { plates: [], remainder: 0, underBar: true };
  let perSide = (target - barWeight) / 2;
  const plates = [];
  for (const p of PLATES[units] || PLATES.lbs) {
    const count = Math.floor(perSide / p);
    if (count > 0) { plates.push({ weight: p, count }); perSide -= count * p; }
  }
  return { plates, remainder: perSide, underBar: false };
}

export function PlateCalcButton({ onClick }) {
  return (
    <button onClick={onClick} className="p-1.5 rounded-lg bg-surface border border-surface-lighter text-text-muted hover:text-text transition-colors" title="Plate Calculator">
      <Calculator size={16} />
    </button>
  );
}

export default function PlateCalculator({ targetWeight, units, unitLabel, onClose }) {
  const [barWeight, setBarWeight] = useState(units === 'kg' ? 20 : 45);
  const { plates, remainder, underBar } = calcPlates(targetWeight, barWeight, units);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative forged-panel p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-text flex items-center gap-2">
            <Calculator size={20} /> Plate Calculator
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text"><X size={20} /></button>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="text-xs text-text-muted block mb-1">Target</label>
            <div className="bg-surface-lighter rounded-lg px-3 py-2 text-text font-medium">{targetWeight} {unitLabel}</div>
          </div>
          <div className="flex-1">
            <label className="text-xs text-text-muted block mb-1">Bar Weight</label>
            <input type="number" value={barWeight} onChange={e => setBarWeight(Number(e.target.value) || 0)}
              className="w-full bg-surface-lighter border border-surface-lighter rounded-lg px-3 py-2 text-text font-medium focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>
        </div>

        <div className="border-t border-surface-lighter pt-3">
          <p className="text-xs text-text-muted mb-2">Per side:</p>
          {underBar ? (
            <p className="text-sm text-yellow-400">Weight must exceed bar weight</p>
          ) : plates.length === 0 && remainder <= 0.01 ? (
            <p className="text-sm text-text-muted">No plates needed — bar only</p>
          ) : (
            <>
              <div className="space-y-1">
                {plates.map(p => (
                  <div key={p.weight} className="flex justify-between text-sm text-text">
                    <span>{p.count} × {p.weight} {unitLabel}</span>
                  </div>
                ))}
              </div>
              {remainder > 0.01 && (
                <p className="text-xs text-yellow-400 mt-2">Cannot make exact weight — {(remainder * 2).toFixed(2)} {unitLabel} short</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
