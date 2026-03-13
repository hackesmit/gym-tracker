/**
 * Flatten a nested object into dot-separated keys.
 * e.g. { a: { b: 1 } } => { "a.b": 1 }
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

/**
 * Escape a CSV cell value — wrap in quotes if it contains commas,
 * quotes, or newlines.
 */
function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert array of objects to CSV and trigger download.
 * @param {Object[]} data - Array of row objects
 * @param {string} filename - Download filename (without .csv extension)
 * @param {string[]} [columns] - Optional column order/filter
 */
export function exportToCSV(data, filename, columns) {
  if (!data || data.length === 0) return;

  // Flatten all rows
  const flatRows = data.map((row) => flattenObject(row));

  // Determine columns
  const cols = columns || [...new Set(flatRows.flatMap((row) => Object.keys(row)))];

  // Build CSV string
  const header = cols.map(escapeCSV).join(',');
  const rows = flatRows.map((row) =>
    cols.map((col) => escapeCSV(row[col])).join(',')
  );
  const csv = [header, ...rows].join('\n');

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
