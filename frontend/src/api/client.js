const BASE = import.meta.env.VITE_API_URL || '/api';

export const TOKEN_KEY = 'gym-token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setToken(token, remember = true) {
  try {
    // Clear both first to avoid stale entries
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (!token) return;
    if (remember) localStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function request(path, options = {}) {
  const maxRetries = options.method && options.method !== 'GET' ? 3 : 1;
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const headers = { 'Content-Type': 'application/json', ...options.headers };
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.detail || `API error ${res.status}`);
        err.status = res.status;
        if (res.status === 401) {
          clearToken();
          try { window.dispatchEvent(new Event('auth:logout')); } catch { /* ignore */ }
          throw err;
        }
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
      if (!err.status && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Auth
export const register = (data) =>
  request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
export const login = (data) =>
  request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
export const getMe = () => request('/auth/me');
export const updateMe = (data) =>
  request('/auth/me', { method: 'PATCH', body: JSON.stringify(data) });
export const absorbAccount = (source_username, source_password) =>
  request('/auth/absorb', { method: 'POST', body: JSON.stringify({ source_username, source_password }) });
export const adminResetPassword = (target_username, new_password) =>
  request('/auth/admin-reset', { method: 'POST', body: JSON.stringify({ target_username, new_password }) });
export const adminWipeUser = (target_username) =>
  request('/auth/admin-wipe-user', { method: 'POST', body: JSON.stringify({ target_username }) });
export const getUsernameCaptcha = () => request('/auth/username-captcha');
export const changeUsername = (new_username, challenge, answer) =>
  request('/auth/change-username', { method: 'POST', body: JSON.stringify({ new_username, challenge, answer }) });

// Dashboard consolidated
export const getDashboard = () => request('/dashboard');

// Cardio
export const listCardio = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  return request(`/cardio/logs?${qs}`);
};
export const createCardio = (data) =>
  request('/cardio/log', { method: 'POST', body: JSON.stringify(data) });
export const updateCardio = (id, data) =>
  request(`/cardio/log/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteCardio = (id) =>
  request(`/cardio/log/${id}`, { method: 'DELETE' });
export const getCardioSummary = () => request('/cardio/summary');

// Friends
export const listFriends = () => request('/friends');
export const requestFriend = (username) =>
  request('/friends/request', { method: 'POST', body: JSON.stringify({ username_or_id: username }) });
export const acceptFriend = (id) =>
  request(`/friends/accept/${id}`, { method: 'POST' });
export const declineFriend = (id) =>
  request(`/friends/decline/${id}`, { method: 'POST' });
export const removeFriend = (id) =>
  request(`/friends/${id}`, { method: 'DELETE' });

// Medals
export const listMedals = () => request('/medals');
export const getMyMedals = () => request('/medals/my');

// Ranks
export const getRanks = (userId) => request(`/ranks${userId ? `?user_id=${userId}` : ''}`);
export const compareRanks = (userId) => request(`/ranks/compare/${userId}`);

// Social
export const getSocialFeed = () => request('/social/feed');
export const getLeaderboard = () => request('/social/leaderboard');
export const getCompare = (userId) => request(`/social/compare/${userId}`);

// Chat
export const getChatMessages = (afterId) =>
  request(`/chat${afterId != null ? `?after_id=${afterId}` : ''}`);
export const sendChatMessage = (content) =>
  request('/chat', { method: 'POST', body: JSON.stringify({ content }) });

// Programs
export const getPrograms = () => request('/programs');
export const createCustomProgram = (data) =>
  request('/programs/custom', { method: 'POST', body: JSON.stringify(data) });
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
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE}/import-program`, { method: 'POST', body: form, headers }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Upload failed');
    return r.json();
  });
};

// Program sharing
export const enableProgramShare = (id) =>
  request(`/program/${id}/share`, { method: 'POST' });
export const disableProgramShare = (id) =>
  request(`/program/${id}/share`, { method: 'DELETE' });
export const previewSharedProgram = (code) =>
  request(`/programs/shared/${encodeURIComponent(code)}`);
export const importSharedProgram = (code, opts = {}) =>
  request('/programs/import-shared', {
    method: 'POST',
    body: JSON.stringify({ code, activate: opts.activate !== false, rename: opts.rename }),
  });

// Logging
export const logSet = (data) => request('/log', { method: 'POST', body: JSON.stringify(data) });
export const logBulkSession = (data) => request('/log/bulk', { method: 'POST', body: JSON.stringify(data) });
export const getLogs = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  return request(`/logs?${qs}`);
};

// Session management
export const undoSession = (sessionLogId) =>
  request(`/log/session/${sessionLogId}`, { method: 'DELETE' });
export const updateSessionDate = (sessionLogId, newDate) =>
  request(`/log/session/${sessionLogId}?new_date=${newDate}`, { method: 'PATCH' });
export const updateSet = (logId, data) =>
  request(`/log/set/${logId}`, { method: 'PATCH', body: JSON.stringify(data) });

// Export
export const exportLogs = async (format = 'csv') => {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/logs/export?format=${format}`, { headers });
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
export const getCalendarOverview = (days = 90) =>
  request(`/tracker/calendar-overview?days=${days}`);

// Workout
export const getWorkoutToday = () => request('/workout/today');

// Analytics
export const getProgress = (exercise) => request(`/analytics/progress/${encodeURIComponent(exercise)}`);
export const getVolume = (weeks = 8) => request(`/analytics/volume?weeks_back=${weeks}`);
export const getMuscleBalance = (weeks = 4) => request(`/analytics/muscle-balance?weeks_back=${weeks}`);
export const getStrengthStandards = () => request('/analytics/strength-standards');
export const getOverloadPlan = (programId, week, sessionName) =>
  request(`/analytics/overload-plan?program_id=${programId}&week=${week}&session_name=${encodeURIComponent(sessionName)}`);
export const getSummary = () => request('/analytics/summary');
export const getDeloadCheck = () => request('/analytics/deload-check');
export const getExerciseCatalog = () => request('/analytics/exercise-catalog');
export const getTonnage = (weeks = 12) => request(`/analytics/tonnage?weeks_back=${weeks}`);

// Achievements
export const getAchievements = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null));
  return request(`/analytics/achievements?${qs}`);
};

// Manual 1RM
export const getManual1RM = () => request('/manual-1rm');
export const updateManual1RM = (lifts) =>
  request('/manual-1rm', { method: 'PATCH', body: JSON.stringify({ lifts }) });

// Vacation
export const getVacations = () => request('/vacation');
export const getActiveVacation = () => request('/vacation/active');
export const startVacation = (data) => request('/vacation', { method: 'POST', body: JSON.stringify(data) });
export const endVacation = (id, data) => request(`/vacation/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteVacation = (id) => request(`/vacation/${id}`, { method: 'DELETE' });
