import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

function parseRestPeriod(str) {
  if (!str) return 0;
  const match = str.match(/([\d.]+)/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  // If the string mentions SEC(S), treat value as seconds; otherwise as minutes
  if (/sec/i.test(str)) return Math.round(value);
  return Math.round(value * 60);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RestTimerBar({ restPeriod, triggerKey, autoStart }) {
  const totalSeconds = parseRestPeriod(restPeriod);
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    const newTotal = parseRestPeriod(restPeriod);
    setRemaining(newTotal);
    if (autoStart && newTotal > 0) setRunning(true);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [restPeriod, triggerKey, autoStart]);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            setRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  if (totalSeconds === 0 || remaining === totalSeconds) return null;

  const progress = remaining / totalSeconds;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex-1 h-[3px] bg-surface-lighter rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono tabular-nums text-text-muted">
        {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </span>
    </div>
  );
}

export default function RestTimer({ restPeriod, autoStart = false, onComplete }) {
  const totalSeconds = parseRestPeriod(restPeriod);
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(autoStart && totalSeconds > 0);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const newTotal = parseRestPeriod(restPeriod);
    setRemaining(newTotal);
    setRunning(autoStart && newTotal > 0);
    setCompleted(false);
    clearTimers();
  }, [restPeriod, autoStart, clearTimers]);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearTimers();
            setRunning(false);
            setCompleted(true);
            onComplete?.();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return clearTimers;
  }, [running, remaining > 0, clearTimers, onComplete]);

  // Clear flash after animation
  useEffect(() => {
    if (completed) {
      flashTimeoutRef.current = setTimeout(() => setCompleted(false), 2000);
    }
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, [completed]);

  if (totalSeconds === 0) return null;

  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;

  const handleStart = () => {
    if (remaining === 0) {
      setRemaining(totalSeconds);
      setCompleted(false);
    }
    setRunning(true);
  };

  const handlePause = () => setRunning(false);

  const handleReset = () => {
    clearTimers();
    setRunning(false);
    setCompleted(false);
    setRemaining(totalSeconds);
  };

  return (
    <div
      className={`flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-lg transition-colors duration-300 ${
        completed
          ? 'bg-success/20 border border-success/40'
          : running
            ? 'bg-primary/10 border border-primary/30'
            : 'bg-surface-light border border-surface-lighter'
      }`}
    >
      {/* Progress bar */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span
          className={`text-xs font-medium whitespace-nowrap ${
            completed ? 'text-success' : running ? 'text-primary' : 'text-text-muted'
          }`}
        >
          Rest
        </span>
        <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${
              completed ? 'bg-success' : 'bg-primary'
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span
          className={`text-sm font-mono font-semibold tabular-nums ${
            completed ? 'text-success' : remaining <= 10 && running ? 'text-danger animate-pulse' : 'text-text'
          }`}
        >
          {formatTime(remaining)}
        </span>
      </div>

      {/* Controls - larger touch targets on mobile */}
      <div className="flex items-center gap-0.5">
        {running ? (
          <button
            onClick={handlePause}
            className="p-2 rounded-lg hover:bg-surface-lighter text-text-muted hover:text-text transition-colors touch-manipulation"
            aria-label="Pause timer"
          >
            <Pause size={16} />
          </button>
        ) : (
          <button
            onClick={handleStart}
            className="p-2 rounded-lg hover:bg-surface-lighter text-primary hover:text-primary transition-colors touch-manipulation"
            aria-label="Start timer"
          >
            <Play size={16} />
          </button>
        )}
        <button
          onClick={handleReset}
          className="p-2 rounded-lg hover:bg-surface-lighter text-text-muted hover:text-text transition-colors touch-manipulation"
          aria-label="Reset timer"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
