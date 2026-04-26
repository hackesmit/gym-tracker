import { useEffect, useMemo, useRef, useState } from 'react';

const KEY_PREFIX = 'gym-pending-';
const TTL_MS = 14 * 24 * 60 * 60 * 1000;   // 14 days

const keyFor = (programId, week, sessionName) =>
  `${KEY_PREFIX}${programId}-${week}-${sessionName}`;

const hasMeaningfulData = (sets) =>
  Array.isArray(sets) && sets.some(
    (s) => (Number(s.load_kg) > 0) || (Number(s.reps_completed) > 0)
  );

/**
 * Manages localStorage persistence of in-progress workout sets, with TTL,
 * session-aware key handling, and orphaned-key sweeping. Replaces the
 * inline localStorage logic that previously lived in Logger.jsx.
 */
export default function useWorkoutDraft({
  programId, week, sessionName, sets, saved, knownProgramIds,
}) {
  const [pendingRestore, setPendingRestore] = useState(null);
  const sweptRef = useRef(false);
  const currentKey = useMemo(() => {
    if (!programId || !week || !sessionName) return null;
    return keyFor(programId, week, sessionName);
  }, [programId, week, sessionName]);

  // 1. Orphaned-key sweep — once per page load
  useEffect(() => {
    if (sweptRef.current) return;
    sweptRef.current = true;
    const known = new Set((knownProgramIds || []).map(String));
    const cutoff = Date.now() - TTL_MS;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        const savedAt = parsed && parsed.savedAt ? new Date(parsed.savedAt).getTime() : 0;
        if (!savedAt || savedAt < cutoff) {
          localStorage.removeItem(key);
          continue;
        }
        const matched = key.match(/^gym-pending-(\d+)-/);
        if (matched && known.size > 0 && !known.has(matched[1])) {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }, [knownProgramIds]);

  // 2. Re-evaluate pendingRestore whenever the key changes
  useEffect(() => {
    if (!currentKey) {
      setPendingRestore(null);
      return;
    }
    try {
      const raw = localStorage.getItem(currentKey);
      if (!raw) {
        setPendingRestore(null);
        return;
      }
      const parsed = JSON.parse(raw);
      const savedAt = parsed?.savedAt ? new Date(parsed.savedAt).getTime() : 0;
      if (!savedAt || savedAt < Date.now() - TTL_MS) {
        localStorage.removeItem(currentKey);
        setPendingRestore(null);
        return;
      }
      if (!Array.isArray(parsed.sets) || parsed.sets.length === 0) {
        setPendingRestore(null);
        return;
      }
      setPendingRestore({ key: currentKey, savedAt, sets: parsed.sets });
    } catch {
      setPendingRestore(null);
    }
  }, [currentKey]);

  // 3. Persist on every meaningful sets change (when not saved)
  useEffect(() => {
    if (!currentKey || saved) return;
    if (!hasMeaningfulData(sets)) return;
    localStorage.setItem(currentKey, JSON.stringify({
      savedAt: new Date().toISOString(),
      sets,
    }));
  }, [sets, currentKey, saved]);

  const acceptRestore = () => {
    if (currentKey) localStorage.removeItem(currentKey);
    setPendingRestore(null);
  };

  const discardRestore = () => {
    if (currentKey) localStorage.removeItem(currentKey);
    setPendingRestore(null);
  };

  return { pendingRestore, acceptRestore, discardRestore };
}
