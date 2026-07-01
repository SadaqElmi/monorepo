import { toCalendarDateString } from './calendar-date.util';

describe('toCalendarDateString', () => {
  it('uses local calendar day components', () => {
    const d = new Date(2026, 5, 29, 15, 0, 0);
    expect(toCalendarDateString(d)).toBe('2026-06-29');
  });

  it('does not use UTC when local and UTC calendar days differ', () => {
    const utc = Date.UTC(2026, 5, 28, 23, 30, 0);
    const d = new Date(utc);
    const cal = toCalendarDateString(d);
    const iso = d.toISOString().slice(0, 10);
    const manual = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(cal).toBe(manual);
    if (manual !== iso) {
      expect(cal).not.toBe(iso);
    }
  });

  it('passes through YYYY-MM-DD strings', () => {
    expect(toCalendarDateString('2026-06-29T21:46:56.863Z')).toBe('2026-06-29');
    expect(toCalendarDateString('2026-06-29')).toBe('2026-06-29');
  });

  it('returns null for empty input', () => {
    expect(toCalendarDateString(null)).toBeNull();
    expect(toCalendarDateString(undefined)).toBeNull();
  });
});
