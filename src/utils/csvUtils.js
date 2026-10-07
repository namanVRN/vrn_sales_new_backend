// backend/src/utils/csvUtils.js

export const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);

  // Escape quotes by doubling them
  const escaped = str.replace(/"/g, '""');

  // If contains comma, quote, or newline → wrap in quotes
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

export const objectsToCsv = (rows, headers) => {
  // headers: [{ key, label }]
  const headerLine = headers.map(h => csvEscape(h.label)).join(',');

  const lines = rows.map(row => {
    return headers.map(h => csvEscape(row?.[h.key] ?? '')).join(',');
  });

  // Add BOM for Excel support
  return '\ufeff' + [headerLine, ...lines].join('\n');
};