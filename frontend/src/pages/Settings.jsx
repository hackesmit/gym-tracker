import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import { Settings as SettingsIcon, Timer, AlertTriangle } from 'lucide-react';
import { getManual1RM, updateManual1RM } from '../api/client';

const REST_PRESETS = [30, 60, 90, 120, 180];
const LIFT_CATEGORIES = [
  { key: 'bench', label: 'Bench Press' },
  { key: 'squat', label: 'Squat' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'ohp', label: 'Overhead Press' },
  { key: 'row', label: 'Row' },
];

function formatRestLabel(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function isStale(dateStr) {
  if (!dateStr) return true;
  const diff = (Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24 * 7);
  return diff > 12;
}

export default function Settings() {
  const { units, setUnits, defaultRestSeconds, setDefaultRestSeconds, unitLabel } = useApp();
  // orm state: { bench: { value: '225', tested_at: '2026-03-20' }, ... }
  const [orm, setOrm] = useState({});
  const [ormSaved, setOrmSaved] = useState(false);
  const toKg = (val) => units === 'lbs' ? +(val / 2.20462).toFixed(1) : +val;
  const fromKg = (val) => units === 'lbs' ? +(val * 2.20462).toFixed(0) : +val;

  useEffect(() => {
    getManual1RM()
      .then((res) => {
        const display = {};
        for (const [k, v] of Object.entries(res.manual_1rm || {})) {
          // Handle both old format (bare number) and new format ({value_kg, tested_at})
          if (typeof v === 'number') {
            display[k] = { value: String(fromKg(v)), tested_at: '' };
          } else if (v && typeof v === 'object') {
            display[k] = {
              value: v.value_kg ? String(fromKg(v.value_kg)) : '',
              tested_at: v.tested_at || '',
            };
          }
        }
        setOrm(display);
      })
      .catch(() => {});
  }, []);

  const saveOrm = async () => {
    const lifts = {};
    for (const { key } of LIFT_CATEGORIES) {
      const entry = orm[key];
      if (entry && entry.value && +entry.value > 0) {
        lifts[key] = {
          value_kg: toKg(+entry.value),
          tested_at: entry.tested_at || null,
        };
      } else {
        lifts[key] = null;
      }
    }
    try {
      await updateManual1RM(lifts);
      setOrmSaved(true);
      setTimeout(() => setOrmSaved(false), 2000);
    } catch (err) {
      alert(err.message);
    }
  };

  const updateOrmField = (key, field, value) => {
    setOrm((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { value: '', tested_at: '' }), [field]: value },
    }));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Card title="Units">
        <p className="text-sm text-text-muted mb-4">
          Choose your preferred unit system. All weights will be displayed in your selected unit.
          Data is always stored in kg internally and converted automatically.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setUnits('lbs')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              units === 'lbs'
                ? 'border-primary bg-primary/15 text-primary-light'
                : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
            }`}
          >
            <span className="text-lg block mb-1">🇺🇸</span>
            Pounds (lbs)
          </button>
          <button
            onClick={() => setUnits('kg')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              units === 'kg'
                ? 'border-primary bg-primary/15 text-primary-light'
                : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
            }`}
          >
            <span className="text-lg block mb-1">🌍</span>
            Kilograms (kg)
          </button>
        </div>
        <p className="text-xs text-text-muted mt-3">
          Currently using: <span className="text-primary-light font-medium">{units === 'lbs' ? 'Pounds (lbs)' : 'Kilograms (kg)'}</span>
        </p>
      </Card>

      <Card title="Rest Timer">
        <p className="text-sm text-text-muted mb-4">
          Default rest time between sets. Individual exercise rest periods override this.
        </p>
        <div className="flex gap-2 flex-wrap">
          {REST_PRESETS.map((sec) => (
            <button
              key={sec}
              onClick={() => setDefaultRestSeconds(sec)}
              className={`py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
                defaultRestSeconds === sec
                  ? 'border-primary bg-primary/15 text-primary-light'
                  : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
              }`}
            >
              {formatRestLabel(sec)}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-3">
          Currently using: <span className="text-primary-light font-medium">{formatRestLabel(defaultRestSeconds)}</span>
        </p>
      </Card>

      <Card title="Known 1RM">
        <p className="text-sm text-text-muted mb-4">
          Enter your known one-rep maxes with the date tested. Used for strength standards when
          no qualifying barbell lift has been logged. Logged data only overrides if it's both newer and higher confidence.
        </p>
        <div className="space-y-3">
          {LIFT_CATEGORIES.map(({ key, label }) => {
            const entry = orm[key] || { value: '', tested_at: '' };
            const stale = entry.value && isStale(entry.tested_at);
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-text-muted w-28 shrink-0">{label}</label>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={entry.value}
                      onChange={(e) => updateOrmField(key, 'value', e.target.value)}
                      placeholder="--"
                      className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-primary outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">{unitLabel}</span>
                  </div>
                  <input
                    type="date"
                    value={entry.tested_at}
                    onChange={(e) => updateOrmField(key, 'tested_at', e.target.value)}
                    className="bg-surface-light border border-surface-lighter rounded-lg px-2 py-2.5 text-xs text-text focus:ring-1 focus:ring-primary outline-none w-32 shrink-0"
                  />
                  {stale && (
                    <span className="text-[10px] text-warning flex items-center gap-0.5 shrink-0" title="Tested over 12 weeks ago">
                      <AlertTriangle size={10} /> Stale
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={saveOrm}
          className="mt-4 w-full py-3 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors touch-manipulation"
        >
          {ormSaved ? 'Saved!' : 'Save 1RMs'}
        </button>
      </Card>
    </div>
  );
}
