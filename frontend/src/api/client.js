const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

// Programs
export const getPrograms = () => request('/programs');
export const getSchedule = (id) => request(`/program/${id}/schedule`);
export const updateProgramStatus = (id, status) =>
  request(`/program/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' });
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

// Analytics
export const getProgress = (exercise) => request(`/analytics/progress/${encodeURIComponent(exercise)}`);
export const getVolume = (weeks = 8) => request(`/analytics/volume?weeks_back=${weeks}`);
export const getMuscleBalance = (weeks = 4) => request(`/analytics/muscle-balance?weeks_back=${weeks}`);
export const getStrengthStandards = () => request('/analytics/strength-standards');
export const getRecovery = () => request('/analytics/recovery');
export const getOverloadPlan = (programId, week, sessionName) =>
  request(`/analytics/overload-plan?program_id=${programId}&week=${week}&session_name=${encodeURIComponent(sessionName)}`);
export const getSummary = () => request('/analytics/summary');
