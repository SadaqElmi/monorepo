import { computeVariance } from './report-variance.util';

describe('computeVariance', () => {
  it('computes percent when baseline is non-zero', () => {
    const v = computeVariance(112, 100);
    expect(v.absolute).toBe(12);
    expect(v.percent).toBe(12);
    expect(v.direction).toBe('up');
  });

  it('returns null percent when baseline is ~0', () => {
    const v = computeVariance(50, 0);
    expect(v.percent).toBeNull();
    expect(v.direction).toBe('up');
  });

  it('detects flat', () => {
    const v = computeVariance(100.002, 100);
    expect(v.direction).toBe('flat');
  });

  it('detects down direction with negative delta', () => {
    const v = computeVariance(75, 100);
    expect(v.absolute).toBe(-25);
    expect(v.direction).toBe('down');
  });
});
