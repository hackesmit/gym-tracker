import { useEffect, useState } from 'react';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import DurationPicker, { formatDuration, splitDuration, combineDuration } from '../components/DurationPicker';
import { listCardio, createCardio, updateCardio, deleteCardio, getCardioSummary } from '../api/client';
import { Trash2, Pencil } from 'lucide-react';
import { useT } from '../i18n';

const MODALITIES = ['run', 'bike', 'swim', 'other'];

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  modality: 'run',
  duration_min: 0,
  duration_sec: 0,
  distance_km: '',
  elevation_m: '',
  avg_hr: '',
  calories: '',
  rpe: '',
  notes: '',
});

export default function Cardio() {
  const t = useT();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [l, s] = await Promise.all([
        listCardio({ limit: 50 }).catch(() => ({ logs: [] })),
        getCardioSummary().catch(() => null),
      ]);
      setLogs(l.logs || l || []);
      setSummary(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    const totalMinutes = combineDuration(form.duration_min, form.duration_sec);
    const payload = {
      date: form.date,
      modality: form.modality,
      duration_minutes: totalMinutes > 0 ? totalMinutes : null,
      distance_km: numOrNull(form.distance_km),
      elevation_m: numOrNull(form.elevation_m),
      avg_hr: numOrNull(form.avg_hr),
      calories: numOrNull(form.calories),
      rpe: numOrNull(form.rpe),
      notes: form.notes || null,
    };
    if (!payload.duration_minutes) {
      setErr(t('cardio.durationRequired') || 'Duration is required');
      setSaving(false);
      return;
    }
    try {
      if (editingId) await updateCardio(editingId, payload);
      else await createCardio(payload);
      setForm(emptyForm());
      setEditingId(null);
      await load();
    } catch (ex) {
      setErr(ex.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const edit = (log) => {
    const { minutes, seconds } = splitDuration(log.duration_minutes);
    setEditingId(log.id);
    setForm({
      date: (log.date || '').slice(0, 10),
      modality: log.modality || 'run',
      duration_min: minutes,
      duration_sec: seconds,
      distance_km: log.distance_km ?? '',
      elevation_m: log.elevation_m ?? '',
      avg_hr: log.avg_hr ?? '',
      calories: log.calories ?? '',
      rpe: log.rpe ?? '',
      notes: log.notes || '',
    });
  };

  const remove = async (id) => {
    if (!confirm(t('cardio.deleteConfirm'))) return;
    try {
      await deleteCardio(id);
      await load();
    } catch (ex) {
      setErr(ex.message || 'Delete failed');
    }
  };

  if (loading) return <LoadingSpinner />;

  const weekTotal = summary?.week?.duration_minutes;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-wide">{t('cardio.title')}</h2>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title={t('cardio.weekDuration')}>
          <p className="text-2xl font-bold">
            {weekTotal != null ? formatDuration(weekTotal) : '--'}
          </p>
        </Card>
        <Card title={t('cardio.weekDistance')}>
          <p className="text-2xl font-bold">
            {summary?.week?.distance_km != null ? `${summary.week.distance_km.toFixed(1)} km` : '--'}
          </p>
        </Card>
        <Card title={t('cardio.personalBests')}>
          {(() => {
            const pbs = summary?.pbs || {};
            const entries = Object.entries(pbs).filter(([, v]) => v);
            if (!entries.length) return <p className="text-xs text-text-muted">{t('cardio.noPBs')}</p>;
            return (
              <ul className="text-xs space-y-0.5">
                {entries.map(([m, pb]) => {
                  let value = '--';
                  if (pb.pace_min_per_km) {
                    const milePace = pb.pace_min_per_km * 1.609344;
                    const mins = Math.floor(milePace);
                    const secs = Math.round((milePace - mins) * 60);
                    value = `${mins}:${String(secs).padStart(2, '0')} /mi`;
                  }
                  else if (pb.distance_km) value = `${pb.distance_km.toFixed(1)} km`;
                  else if (pb.duration_minutes) value = formatDuration(pb.duration_minutes);
                  return (
                    <li key={m} className="capitalize">
                      <span className="text-text-muted">{m.replace(/_/g, ' ')}:</span> {value}
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </Card>
      </div>

      {/* Form */}
      <Card title={editingId ? t('cardio.edit') : t('cardio.log')}>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('cardio.date')}>
            <input type="date" value={form.date} onChange={(e) => handleChange('date', e.target.value)} className={inputCls} required />
          </Field>
          <Field label={t('cardio.modality')}>
            <select value={form.modality} onChange={(e) => handleChange('modality', e.target.value)} className={inputCls}>
              {MODALITIES.map((m) => <option key={m} value={m}>{t(`cardio.modality.${m}`)}</option>)}
            </select>
          </Field>
          <Field label={t('cardio.duration')}>
            <DurationPicker
              minutes={form.duration_min}
              seconds={form.duration_sec}
              onChange={({ minutes, seconds }) => setForm((f) => ({ ...f, duration_min: minutes, duration_sec: seconds }))}
            />
          </Field>
          <Field label={t('cardio.distance')}>
            <input type="number" step="0.01" value={form.distance_km} onChange={(e) => handleChange('distance_km', e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('cardio.elevation')}>
            <input type="number" step="1" value={form.elevation_m} onChange={(e) => handleChange('elevation_m', e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('cardio.avgHr')}>
            <input type="number" step="1" value={form.avg_hr} onChange={(e) => handleChange('avg_hr', e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('cardio.calories')}>
            <input type="number" step="1" value={form.calories} onChange={(e) => handleChange('calories', e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('cardio.rpe')}>
            <input type="number" min="1" max="10" step="1" value={form.rpe} onChange={(e) => handleChange('rpe', e.target.value)} className={inputCls} />
          </Field>
          <Field label={t('cardio.notes')} className="sm:col-span-3">
            <input type="text" value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} className={inputCls} />
          </Field>
          {err && <p className="text-sm text-danger sm:col-span-3">{err}</p>}
          <div className="sm:col-span-3 flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-accent text-surface-dark text-sm font-semibold disabled:opacity-60">
              {saving ? t('common.saving') : editingId ? t('cardio.updateBtn') : t('cardio.logBtn')}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }} className="px-4 py-2 rounded-lg bg-surface-light text-sm">
                {t('common.cancel')}
              </button>
            )}
          </div>
        </form>
      </Card>

      {/* Recent logs */}
      <Card title={t('cardio.recent')}>
        {logs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted text-left">
                  <th className="py-2">{t('cardio.table.date')}</th>
                  <th>{t('cardio.table.modality')}</th>
                  <th>{t('cardio.table.duration')}</th>
                  <th>{t('cardio.table.distance')}</th>
                  <th>{t('cardio.table.hr')}</th>
                  <th>{t('cardio.table.rpe')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-surface-lighter">
                    <td className="py-2">{(l.date || '').slice(0, 10)}</td>
                    <td>{t(`cardio.modality.${l.modality}`) || l.modality}</td>
                    <td>{formatDuration(l.duration_minutes)}</td>
                    <td>{l.distance_km != null ? `${l.distance_km.toFixed(2)} km` : '--'}</td>
                    <td>{l.avg_hr ?? '--'}</td>
                    <td>{l.rpe ?? '--'}</td>
                    <td className="flex gap-2 justify-end py-2">
                      <button onClick={() => edit(l)} className="text-text-muted hover:text-accent"><Pencil size={14} /></button>
                      <button onClick={() => remove(l.id)} className="text-text-muted hover:text-danger"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t('cardio.empty')}</p>
        )}
      </Card>
    </div>
  );
}

const inputCls = 'w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm text-text focus:ring-1 focus:ring-accent outline-none';

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
