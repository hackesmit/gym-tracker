import { useEffect, useState } from 'react';
import { kgToDisplay, displayToKg } from '../utils/units';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import { Settings as SettingsIcon, Timer, AlertTriangle, Download, Palette, Palmtree } from 'lucide-react';
import { getManual1RM, updateManual1RM, exportLogs, getActiveVacation, startVacation, endVacation, absorbAccount, adminResetPassword, getUsernameCaptcha, changeUsername } from '../api/client';
import { useT } from '../i18n';
import { useAuth } from '../context/AuthContext';

const REALM_INFO = [
  { key: 'gondor',    label: 'Gondor',    icon: '🏰', desc: 'Noble gold & slate',     colors: ['#c9a84c', '#1a1d2e', '#6b7fa3'] },
  { key: 'rohan',     label: 'Rohan',     icon: '🐴', desc: 'Earthy straw & green',   colors: ['#d4a843', '#1c1a15', '#7a9a6b'] },
  { key: 'rivendell', label: 'Rivendell', icon: '🌿', desc: 'Silver-teal moonlight',  colors: ['#5ba3a0', '#151d22', '#a8b5c4'] },
  { key: 'mordor',    label: 'Mordor',    icon: '🔥', desc: 'Ember red & shadow',     colors: ['#c44a2b', '#121010', '#6b6565'] },
  { key: 'shire',     label: 'Shire',     icon: '🍺', desc: 'Hobbit green & amber',   colors: ['#6d9b4a', '#1a1714', '#c49a5c'] },
];

const THEME_COLOR_INFO = [
  { key: 'lime',    hex: '#d4ff4a' },
  { key: 'amber',   hex: '#f5b544' },
  { key: 'cyan',    hex: '#4ad4ff' },
  { key: 'crimson', hex: '#ff4a5a' },
];

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
  const { units, setUnits, defaultRestSeconds, setDefaultRestSeconds, unitLabel, realm, setRealm, themeMode, setThemeMode, themeColor, setThemeColor, language, setLanguage } = useApp();
  const t = useT();
  const { addToast } = useToast();
  const { user } = useAuth();
  const isAdmin = (user?.username || '').toLowerCase() === 'hackesmit';
  // orm state: { bench: { value: '225', tested_at: '2026-03-20' }, ... }
  const [orm, setOrm] = useState({});
  const [ormSaved, setOrmSaved] = useState(false);
  const [vacationActive, setVacationActive] = useState(false);
  const [vacationId, setVacationId] = useState(null);
  const [vacationStart, setVacationStart] = useState(null);
  const [vacationReason, setVacationReason] = useState('');
  const toKg = (val) => displayToKg(val, units);
  const fromKg = (val) => kgToDisplay(val, units);

  useEffect(() => {
    getManual1RM()
      .then((res) => {
        const display = {};
        for (const [k, v] of Object.entries(res.manual_1rm || {})) {
          if (v == null) continue;
          // Old format: bare number
          if (typeof v === 'number') {
            display[k] = { value: String(fromKg(v)), tested_at: '' };
          // New format: {value_kg, tested_at}
          } else if (typeof v === 'object' && v.value_kg != null) {
            display[k] = {
              value: String(fromKg(v.value_kg)),
              tested_at: v.tested_at || '',
            };
          // Old format stored as string somehow
          } else if (typeof v === 'string' && !isNaN(+v)) {
            display[k] = { value: String(fromKg(+v)), tested_at: '' };
          }
        }
        setOrm(display);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getActiveVacation()
      .then((v) => {
        setVacationActive(true);
        setVacationId(v.id);
        setVacationStart(v.start_date);
        setVacationReason(v.reason || '');
      })
      .catch(() => {
        setVacationActive(false);
        setVacationId(null);
      });
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
      addToast(err.message, 'error');
    }
  };

  const updateOrmField = (key, field, value) => {
    setOrm((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { value: '', tested_at: '' }), [field]: value },
    }));
  };

  const handleVacationToggle = async () => {
    try {
      if (vacationActive && vacationId) {
        const today = new Date().toISOString().split('T')[0];
        await endVacation(vacationId, { end_date: today });
        setVacationActive(false);
        setVacationId(null);
        setVacationStart(null);
        addToast('Vacation ended — welcome back! Streak tracking resumed.', 'success');
      } else {
        const today = new Date().toISOString().split('T')[0];
        const v = await startVacation({ start_date: today, reason: vacationReason || null });
        setVacationActive(true);
        setVacationId(v.id);
        setVacationStart(v.start_date);
        addToast('Vacation started — streak tracking paused until you return.', 'success');
      }
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">{t('settings.title')}</h2>

      <Card title={t('settings.language')}>
        <p className="text-sm text-text-muted mb-4">
          {t('settings.language.desc')}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setLanguage('en')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              language === 'en'
                ? 'border-accent bg-accent/15 text-accent-light'
                : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
            }`}
          >
            <span className="text-lg block mb-1">🇬🇧</span>
            {t('settings.language.en', 'English')}
          </button>
          <button
            onClick={() => setLanguage('es')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              language === 'es'
                ? 'border-accent bg-accent/15 text-accent-light'
                : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
            }`}
          >
            <span className="text-lg block mb-1">🇪🇸</span>
            {t('settings.language.es', 'Español')}
          </button>
        </div>
      </Card>

      <Card title={t('settings.themeMode')}>
        <p className="text-sm text-text-muted mb-4">
          {t('settings.themeMode.desc')}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setThemeMode('neutral')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              themeMode === 'neutral'
                ? 'border-accent bg-accent/15 text-accent-light'
                : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
            }`}
          >
            {t('settings.themeMode.neutral')}
          </button>
          <button
            onClick={() => setThemeMode('lotr')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              themeMode === 'lotr'
                ? 'border-accent bg-accent/15 text-accent-light'
                : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
            }`}
          >
            {t('settings.themeMode.lotr')}
          </button>
        </div>
      </Card>

      {themeMode !== 'lotr' && (
      <Card title={t('settings.themeColor')}>
        <p className="text-sm text-text-muted mb-4">
          {t('settings.themeColor.desc')}
        </p>
        <div className="flex gap-4 items-center">
          {THEME_COLOR_INFO.map(({ key, hex }) => (
            <button
              key={key}
              onClick={() => setThemeColor(key)}
              data-active={themeColor === key}
              aria-label={t(`settings.themeColor.${key}`)}
              title={t(`settings.themeColor.${key}`)}
              className="theme-swatch touch-manipulation"
              style={{ background: hex }}
            />
          ))}
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
            {t(`settings.themeColor.${themeColor}`)}
          </span>
        </div>
      </Card>
      )}

      {themeMode === 'lotr' && (
      <Card title={t('settings.realm')}>
        <p className="text-sm text-text-muted mb-4">
          {t('settings.realm.desc')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {REALM_INFO.map(({ key, label, icon, desc, colors }) => (
            <button
              key={key}
              onClick={() => setRealm(key)}
              className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all touch-manipulation ${
                realm === key
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                  : 'border-surface-lighter bg-surface-light hover:border-text-muted'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{icon}</span>
                <span className={`text-sm font-semibold ${realm === key ? 'text-accent-light' : 'text-text'}`}>
                  {label}
                </span>
              </div>
              <div className="flex gap-1 mb-1.5">
                {colors.map((c, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full border border-white/10"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <p className="text-[10px] text-text-muted leading-tight">{desc}</p>
            </button>
          ))}
        </div>
      </Card>
      )}

      <Card title={t('settings.units')}>
        <p className="text-sm text-text-muted mb-4">
          {t('settings.units.desc')}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setUnits('lbs')}
            className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
              units === 'lbs'
                ? 'border-accent bg-accent/15 text-accent-light'
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
                ? 'border-accent bg-accent/15 text-accent-light'
                : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
            }`}
          >
            <span className="text-lg block mb-1">🌍</span>
            Kilograms (kg)
          </button>
        </div>
        <p className="text-xs text-text-muted mt-3">
          {t('settings.units.current')}: <span className="text-accent-light font-medium">{units === 'lbs' ? 'Pounds (lbs)' : 'Kilograms (kg)'}</span>
        </p>
      </Card>

      <Card title={t('settings.restTimer')}>
        <p className="text-sm text-text-muted mb-4">
          {t('settings.restTimer.desc')}
        </p>
        <div className="flex gap-2 flex-wrap">
          {REST_PRESETS.map((sec) => (
            <button
              key={sec}
              onClick={() => setDefaultRestSeconds(sec)}
              className={`py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
                defaultRestSeconds === sec
                  ? 'border-accent bg-accent/15 text-accent-light'
                  : 'border-surface-lighter bg-surface-light text-text-muted hover:text-text hover:border-text-muted'
              }`}
            >
              {formatRestLabel(sec)}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-3">
          {t('settings.units.current')}: <span className="text-accent-light font-medium">{formatRestLabel(defaultRestSeconds)}</span>
        </p>
      </Card>

      {/* Vacation Mode */}
      <Card title={t('settings.vacation')} icon={<Palmtree size={18} />}>
        <p className="text-sm text-text-muted mb-4">
          {t('settings.vacation.desc')}
        </p>
        {vacationActive && vacationStart && (
          <p className="text-xs text-accent mb-3">
            On vacation since {new Date(vacationStart + 'T00:00:00').toLocaleDateString()}
          </p>
        )}
        {!vacationActive && (
          <input
            type="text"
            placeholder={t('settings.vacation.reason')}
            value={vacationReason}
            onChange={(e) => setVacationReason(e.target.value)}
            className="w-full p-2 mb-3 rounded bg-surface-lighter text-text text-sm border border-border"
          />
        )}
        <button
          onClick={handleVacationToggle}
          className={`w-full py-2.5 rounded font-semibold text-sm transition-colors ${
            vacationActive
              ? 'bg-success/20 text-success hover:bg-success/30'
              : 'bg-warning/20 text-warning hover:bg-warning/30'
          }`}
        >
          {vacationActive ? t('settings.vacation.end') : t('settings.vacation.start')}
        </button>
      </Card>

      <Card title={t('settings.knownOneRM')}>
        <p className="text-sm text-text-muted mb-4">
          {t('settings.knownOneRM.desc')}
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
                      className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-accent outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">{unitLabel}</span>
                  </div>
                  <input
                    type="date"
                    value={entry.tested_at}
                    onChange={(e) => updateOrmField(key, 'tested_at', e.target.value)}
                    className="bg-surface-light border border-surface-lighter rounded-lg px-2 py-2.5 text-xs text-text focus:ring-1 focus:ring-accent outline-none w-32 shrink-0"
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
          className="mt-4 w-full py-3 rounded-lg bg-accent text-accent-ink text-sm font-medium hover:bg-accent-dark transition-colors touch-manipulation"
        >
          {ormSaved ? t('common.saved') : t('settings.knownOneRM.save')}
        </button>
      </Card>

      <ChangeUsernameCard addToast={addToast} />

      {/* Import existing data from another account */}
      <AbsorbCard addToast={addToast} />

      {isAdmin && <AdminResetCard addToast={addToast} />}

      {/* Export Data */}
      <Card title={t('settings.export')}>
        <p className="text-xs text-text-muted mb-3">{t('settings.export.desc')}</p>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              try {
                const csv = await exportLogs('csv');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'gym_tracker_export.csv'; a.click();
                URL.revokeObjectURL(url);
              } catch { addToast('Export failed', 'error'); }
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-light border border-surface-lighter rounded-lg text-sm text-text hover:bg-surface-lighter transition-colors touch-manipulation"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={async () => {
              try {
                const data = await exportLogs('json');
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'gym_tracker_export.json'; a.click();
                URL.revokeObjectURL(url);
              } catch { addToast('Export failed', 'error'); }
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-light border border-surface-lighter rounded-lg text-sm text-text hover:bg-surface-lighter transition-colors touch-manipulation"
          >
            <Download size={14} /> JSON
          </button>
        </div>
      </Card>
    </div>
  );
}

function ChangeUsernameCard({ addToast }) {
  const t = useT();
  const { user, updateUser } = useAuth();
  const [newUsername, setNewUsername] = useState('');
  const [problem, setProblem] = useState('');
  const [challenge, setChallenge] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchNewProblem = async () => {
    setLoading(true);
    setAnswer('');
    try {
      const { problem: p, challenge: c } = await getUsernameCaptcha();
      setProblem(p);
      setChallenge(c);
    } catch (err) {
      addToast(err.message || 'Failed to fetch captcha', 'error');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!newUsername || !challenge || !answer || busy) return;
    setBusy(true);
    try {
      const updated = await changeUsername(newUsername.trim(), challenge, answer.trim());
      updateUser?.(updated);
      addToast(`Username changed to ${updated.username}`, 'success');
      setNewUsername('');
      setAnswer('');
      setProblem('');
      setChallenge('');
    } catch (err) {
      addToast(err.message || 'Change failed', 'error');
      // On wrong-answer, fetch a new problem so they can retry
      if ((err.message || '').toLowerCase().includes('answer')) {
        fetchNewProblem();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('settings.changeUsername', 'Change username')}>
      <p className="text-sm text-text-muted mb-3">
        Your current username: <span className="text-accent-light font-medium">{user?.username || '—'}</span>
      </p>
      <div className="space-y-2">
        <input
          type="text"
          placeholder={t('settings.changeUsername.new', 'New username')}
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
          autoComplete="off"
          maxLength={40}
        />
        {!problem && (
          <button
            onClick={fetchNewProblem}
            disabled={loading || !newUsername.trim()}
            className="w-full py-2.5 rounded-lg bg-accent/15 text-accent-light text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Get word problem'}
          </button>
        )}
        {problem && (
          <div className="space-y-2">
            <div className="rounded-lg bg-surface-light border border-surface-lighter px-3 py-3 text-sm text-text">
              {problem}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Your answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="flex-1 bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
                autoComplete="off"
              />
              <button
                onClick={fetchNewProblem}
                disabled={loading}
                className="px-3 py-2 rounded-lg bg-surface-light border border-surface-lighter text-xs text-text-muted hover:text-text"
                title="New problem"
              >
                ↻
              </button>
            </div>
            <button
              onClick={submit}
              disabled={busy || !newUsername.trim() || !answer.trim()}
              className="w-full py-2.5 rounded-lg bg-accent text-accent-ink text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Changing…' : 'Change username'}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}


function AdminResetCard({ addToast }) {
  const t = useT();
  const [target, setTarget] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!target || !newPass || busy) return;
    if (newPass !== confirm) {
      addToast('Passwords do not match', 'error');
      return;
    }
    if (newPass.length < 4) {
      addToast('Password must be at least 4 characters', 'error');
      return;
    }
    if (!window.confirm(`Reset password for "${target}"? They'll need the new password to log in.`)) return;
    setBusy(true);
    try {
      await adminResetPassword(target.trim(), newPass);
      addToast(`Password reset for ${target.trim()}`, 'success');
      setTarget('');
      setNewPass('');
      setConfirm('');
    } catch (err) {
      addToast(err.message || 'Reset failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('settings.adminReset')}>
      <p className="text-sm text-text-muted mb-3">
        {t('settings.adminReset.desc')}
      </p>
      <div className="space-y-2">
        <input
          type="text"
          placeholder={t('settings.adminReset.target')}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
          autoComplete="off"
        />
        <input
          type="password"
          placeholder={t('settings.adminReset.newPass')}
          value={newPass}
          onChange={(e) => setNewPass(e.target.value)}
          className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder={t('settings.adminReset.confirm')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`w-full bg-surface-light border rounded-lg px-3 py-2 text-sm ${
            confirm && newPass !== confirm ? 'border-danger' : 'border-surface-lighter'
          }`}
          autoComplete="new-password"
        />
        <button
          onClick={run}
          disabled={busy || !target || !newPass || newPass !== confirm}
          className="w-full py-2.5 rounded-lg bg-accent text-accent-ink text-sm font-medium disabled:opacity-50"
        >
          {busy ? t('settings.adminReset.running') : t('settings.adminReset.run')}
        </button>
      </div>
    </Card>
  );
}

function AbsorbCard({ addToast }) {
  const t = useT();
  const [srcUser, setSrcUser] = useState('');
  const [srcPass, setSrcPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    if (!srcUser || !srcPass || busy) return;
    if (!confirm(`Reassign all data from "${srcUser}" to this account? The source account will be deleted.`)) return;
    setBusy(true);
    try {
      const res = await absorbAccount(srcUser.trim(), srcPass);
      setResult(res);
      setSrcPass('');
      addToast('Data imported. Reloading…', 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      addToast(err.message || 'Absorb failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('settings.import')}>
      <p className="text-sm text-text-muted mb-3">
        {t('settings.import.desc')}
      </p>
      <div className="space-y-2">
        <input
          type="text"
          placeholder={t('settings.import.sourceUser')}
          value={srcUser}
          onChange={(e) => setSrcUser(e.target.value)}
          className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
          autoComplete="off"
        />
        <input
          type="password"
          placeholder={t('settings.import.sourcePass')}
          value={srcPass}
          onChange={(e) => setSrcPass(e.target.value)}
          className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
          autoComplete="off"
        />
        <button
          onClick={run}
          disabled={busy || !srcUser || !srcPass}
          className="w-full py-2.5 rounded-lg bg-accent text-accent-ink text-sm font-medium disabled:opacity-50"
        >
          {busy ? t('settings.import.running') : t('settings.import.run')}
        </button>
        {result && (
          <p className="text-xs text-success">
            Moved: {Object.entries(result.moved || {}).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing'}
          </p>
        )}
      </div>
    </Card>
  );
}
