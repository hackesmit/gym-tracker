// Shared formatting for medal values + units.
// Used by both the Medals page card and the new leaderboard modal.

export function formatValue(v, unit, higherIsBetter) {
  if (v == null) return '—';
  if (unit === 'min' || unit === 'min/km') {
    const display = unit === 'min/km' ? v * 1.609344 : v;
    let minutes = Math.floor(display);
    let seconds = Math.round((display - minutes) * 60);
    if (seconds === 60) { minutes += 1; seconds = 0; }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  if (typeof v !== 'number') return String(v);
  return Math.abs(v) >= 1000
    ? Math.round(v).toLocaleString()
    : (v % 1 === 0 ? v.toString() : v.toFixed(1));
}

// Stored unit → display unit. Pace stored in min/km but a "Fastest Mile" medal
// must read in /mi for the value to make sense.
export function displayUnit(unit) {
  return unit === 'min/km' ? '/mi' : unit;
}
