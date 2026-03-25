const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const maxRetries = options.method && options.method !== 'GET' ? 3 : 1;
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.detail || `API error ${res.status}`);
        err.status = res.status;
        // Only retry on 5xx, not 4xx
        if (res.status >= 500 && attempt < maxRetries - 1) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        throw err;
      }
      return res.json();
    } catch (err) {
      lastError = err;
      // Retry on network errors (no status = fetch failed)
      if (!err.status && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Programs
export const getPrograms = () => request('/programs');
export const getSchedule = (id) => request(`/program/${id}/schedule`);
export const updateProgramStatus = (id, status) =>
  request(`/program/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' });
export const swapExercise = (programId, oldName, newName) =>
  request(`/program/${programId}/exercise/${encodeURIComponent(oldName)}`, {
    method: 'PATCH',
    body: JSON.stringify({ new_exercise_name: newName }),
  });
export const importProgram = (file, frequency) => {
  const form = new FormData();
  form.append('file', file);
  form.append('frequency', frequency);
  return fetch(`${BASE}/import-program`, { method: 'POST', body: form }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed');
    return r.json();
  });
};

// Logging
export const logSet = (data) => request('/log', { method: 'POST', body: JSON.stringify(data) });
export const logBulkSession = (data) => request('/log/bulk', { method: 'POST', body: JSON.stringify(data) });
export const getLogs = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  return request(`/logs?${qs}`);
};

// Undo session
export const undoSession = (sessionLogId) =>
  request(`/log/session/${sessionLogId}`, { method: 'DELETE' });

// Export
export const exportLogs = async (format = 'csv') => {
  const res = await fetch(`${BASE}/logs/export?format=${format}`);
  if (!res.ok) throw new Error('Export failed');
  if (format === 'json') return res.json();
  return res.text();
};

// Body metrics
export const logBodyMetric = (data) => request('/body-metrics', { method: 'POST', body: JSON.stringify(data) });
export const getBodyMetrics = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  return request(`/body-metrics/history?${qs}`);
};

// Tracker
export const getTracker = (pid) => request(`/tracker/${pid}`);
export const getTrackerWeek = (pid, week) => request(`/tracker/${pid}/week/${week}`);
export const postSession = (pid, data) =>
  request(`/tracker/${pid}/session`, { method: 'POST', body: JSON.stringify(data) });
export const advanceTracker = (pid) =>
  request(`/tracker/${pid}/advance`, { method: 'PATCH' });
export const getCalendar = (pid) => request(`/tracker/${pid}/calendar`);
export const getAdherence = (pid) => request(`/tracker/${pid}/adherence`);

// Workout
export const getWorkoutToday = () => request('/workout/today');

// Analytics
export const getProgress = (exercise) => request(`/analytics/progress/${encodeURIComponent(exercise)}`);
export const getVolume = (weeks = 8) => request(`/analytics/volume?weeks_back=${weeks}`);
export const getMuscleBalance = (weeks = 4) => request(`/analytics/muscle-balance?weeks_back=${weeks}`);
export const getStrengthStandards = () => request('/analytics/strength-standards');
export const getRecovery = () => request('/analytics/recovery');
export const getOverloadPlan = (programId, week, sessionName) =>
  request(`/analytics/overload-plan?program_id=${programId}&week=${week}&session_name=${encodeURIComponent(sessionName)}`);
export const getSummary = () => request('/analytics/summary');
export const getDeloadCheck = () => request('/analytics/deload-check');
export const getExerciseCatalog = () => request('/analytics/exercise-catalog');
export const getTonnage = (weeks = 12) => request(`/analytics/tonnage?weeks_back=${weeks}`);

// Manual 1RM — shape: { lifts: { bench: { value_kg, tested_at } | null } }
export const getManual1RM = () => request('/manual-1rm');
export const updateManual1RM = (lifts) =>
  request('/manual-1rm', { method: 'PATCH', body: JSON.stringify({ lifts }) });
