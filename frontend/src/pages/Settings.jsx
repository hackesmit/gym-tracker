import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import { Settings as SettingsIcon, Timer, Trophy } from 'lucide-react';
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

export default function Settings() {
  const { units, setUnits, defaultRestSeconds, setDefaultRestSeconds, convert, unitLabel } = useApp();
  const [orm, setOrm] = useState({});
  const [ormSaved, setOrmSaved] = useState(false);
  const toKg = (val) => units === 'lbs' ? +(val / 2.20462).toFixed(1) : +val;
  const fromKg = (val) => units === 'lbs' ? +(val * 2.20462).toFixed(0) : +val;

  useEffect(() => {
    getManual1RM()
      .then((res) => {
        const display = {};
        for (const [k, v] of Object.entries(res.manual_1rm || {})) {
          display[k] = fromKg(v);
        }
        setOrm(display);
      })
      .catch(() => {});
  }, []);

  const saveOrm = async () => {
    const lifts = {};
    for (const { key } of LIFT_CATEGORIES) {
      const val = orm[key];
      lifts[key] = val ? toKg(val) : null;
    }
    try {
      await updateManual1RM(lifts);
      setOrmSaved(true);
      setTimeout(() => setOrmSaved(false), 2000);
    } catch (err) {
      alert(err.message);
    }
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
          Enter your known one-rep maxes. These are used for strength standards when no logged data is available.
          Logged data overrides these if higher.
        </p>
        <div className="space-y-3">
          {LIFT_CATEGORIES.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <label className="text-sm text-text-muted w-32 shrink-0">{label}</label>
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={orm[key] || ''}
                  onChange={(e) => setOrm((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder="--"
                  className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-primary outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">{unitLabel}</span>
              </div>
            </div>
          ))}
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
