import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import Card from './Card';
import { createCustomProgram } from '../api/client';

const DEFAULT_EXERCISE = { name: '', working_sets: 3, prescribed_reps: '8-12', rest_seconds: 90 };
const DEFAULT_SESSION = () => ({ name: '', exercises: [{ ...DEFAULT_EXERCISE }] });

export default function ProgramBuilder({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [totalWeeks, setTotalWeeks] = useState(12);
  const [sessions, setSessions] = useState([
    { name: 'Leg Day', exercises: [
      { name: 'Back Squat', working_sets: 4, prescribed_reps: '5-8', rest_seconds: 150 },
      { name: 'Romanian Deadlift', working_sets: 3, prescribed_reps: '8-10', rest_seconds: 120 },
    ]},
  ]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const updateSession = (i, patch) => {
    setSessions((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const addSession = () => setSessions((prev) => [...prev, DEFAULT_SESSION()]);
  const removeSession = (i) => setSessions((prev) => prev.filter((_, idx) => idx !== i));

  const addExercise = (si) => {
    updateSession(si, { exercises: [...sessions[si].exercises, { ...DEFAULT_EXERCISE }] });
  };
  const updateExercise = (si, ei, patch) => {
    updateSession(si, {
      exercises: sessions[si].exercises.map((e, idx) => idx === ei ? { ...e, ...patch } : e),
    });
  };
  const removeExercise = (si, ei) => {
    updateSession(si, {
      exercises: sessions[si].exercises.filter((_, idx) => idx !== ei),
    });
  };

  const submit = async () => {
    setErr('');
    if (!name.trim()) return setErr('Program name is required');
    if (sessions.length === 0) return setErr('Add at least one session');
    for (const [i, s] of sessions.entries()) {
      if (!s.name.trim()) return setErr(`Session ${i + 1} needs a name`);
      if (s.exercises.length === 0) return setErr(`Session "${s.name}" needs at least one exercise`);
      for (const [j, e] of s.exercises.entries()) {
        if (!e.name.trim()) return setErr(`Exercise ${j + 1} in "${s.name}" needs a name`);
      }
    }
    setBusy(true);
    try {
      const res = await createCustomProgram({
        name: name.trim(),
        total_weeks: totalWeeks,
        activate: true,
        sessions: sessions.map((s) => ({
          name: s.name.trim(),
          exercises: s.exercises.map((e) => ({
            name: e.name.trim(),
            working_sets: +e.working_sets || 3,
            prescribed_reps: String(e.prescribed_reps || '8-12'),
            rest_seconds: e.rest_seconds ? +e.rest_seconds : null,
          })),
        })),
      });
      onCreated?.(res);
    } catch (ex) {
      setErr(ex.message || 'Failed to create program');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start md:items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-semibold">Create Program</h3>
            <button onClick={onClose} className="text-text-muted hover:text-text p-1" aria-label="Close">
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="col-span-2">
              <label className="block text-xs text-text-muted mb-1">Program name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Split"
                className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Weeks</label>
              <input
                type="number"
                min={1}
                max={52}
                value={totalWeeks}
                onChange={(e) => setTotalWeeks(Math.max(1, Math.min(52, +e.target.value || 12)))}
                className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-4">
            {sessions.map((session, si) => (
              <div key={si} className="rounded-lg border border-surface-lighter bg-surface-light p-3">
                <div className="flex items-center gap-2 mb-3">
                  <input
                    value={session.name}
                    onChange={(e) => updateSession(si, { name: e.target.value })}
                    placeholder={`Session ${si + 1} (e.g. Leg Day)`}
                    className="flex-1 bg-surface border border-surface-lighter rounded-lg px-3 py-1.5 text-sm font-medium"
                  />
                  {sessions.length > 1 && (
                    <button
                      onClick={() => removeSession(si)}
                      className="text-danger hover:bg-danger/10 p-1.5 rounded"
                      title="Remove session"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {session.exercises.map((ex, ei) => (
                    <div key={ei} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        value={ex.name}
                        onChange={(e) => updateExercise(si, ei, { name: e.target.value })}
                        placeholder="Exercise name"
                        className="col-span-5 bg-surface border border-surface-lighter rounded px-2 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        min={1}
                        value={ex.working_sets}
                        onChange={(e) => updateExercise(si, ei, { working_sets: e.target.value })}
                        className="col-span-2 bg-surface border border-surface-lighter rounded px-2 py-1.5 text-sm text-center"
                        title="Working sets"
                      />
                      <input
                        value={ex.prescribed_reps}
                        onChange={(e) => updateExercise(si, ei, { prescribed_reps: e.target.value })}
                        placeholder="8-12"
                        className="col-span-2 bg-surface border border-surface-lighter rounded px-2 py-1.5 text-sm text-center"
                        title="Reps"
                      />
                      <input
                        type="number"
                        min={0}
                        value={ex.rest_seconds}
                        onChange={(e) => updateExercise(si, ei, { rest_seconds: e.target.value })}
                        placeholder="90s"
                        className="col-span-2 bg-surface border border-surface-lighter rounded px-2 py-1.5 text-sm text-center"
                        title="Rest seconds"
                      />
                      <button
                        onClick={() => removeExercise(si, ei)}
                        disabled={session.exercises.length === 1}
                        className="col-span-1 text-text-muted hover:text-danger disabled:opacity-30 flex justify-center"
                        title="Remove exercise"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => addExercise(si)}
                  className="mt-3 text-xs text-accent hover:text-accent-light flex items-center gap-1"
                >
                  <Plus size={14} /> Add exercise
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addSession}
            className="mt-3 w-full py-2 rounded-lg border border-dashed border-surface-lighter text-sm text-text-muted hover:text-text hover:border-accent"
          >
            <Plus size={14} className="inline mr-1" /> Add session (e.g. Arm Day)
          </button>

          {err && <p className="text-sm text-danger mt-3">{err}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-text-muted hover:text-text">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-accent text-surface font-semibold text-sm disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create program'}
            </button>
          </div>

          <p className="text-[10px] text-text-muted mt-3">
            Columns: exercise · sets · rep range · rest (sec). The program applies the same sessions
            every week — your logs drive progressive-overload suggestions automatically.
          </p>
        </Card>
      </div>
    </div>
  );
}
