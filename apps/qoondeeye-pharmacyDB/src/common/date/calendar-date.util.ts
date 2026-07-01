/**
 * Calendar date YYYY-MM-DD for journal entry_date and document dates.
 * Avoids UTC day shift from `Date.prototype.toISOString().slice(0, 10)`.
 */
export function toCalendarDateString(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (!(value instanceof Date)) {
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return s.slice(0, 10) || null;
    value = parsed;
  }
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
