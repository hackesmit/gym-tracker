/**
 * Local calendar date as YYYY-MM-DD.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC date: at 20:00 in
 * Tijuana / Los Angeles that is already tomorrow, so an evening workout was
 * being logged on the next day. Build the string from local components.
 */
export function todayLocalISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
