import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import { Settings as SettingsIcon, Timer } from 'lucide-react';

const REST_PRESETS = [30, 60, 90, 120, 180];

function formatRestLabel(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function Settings() {
  const { units, setUnits, defaultRestSeconds, setDefaultRestSeconds } = useApp();

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
    </div>
  );
}
