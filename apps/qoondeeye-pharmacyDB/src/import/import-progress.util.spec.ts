import {
  clampImportProgress,
  commitProcessedFromPending,
} from './import-progress.util';

describe('commitProcessedFromPending', () => {
  it('returns 0 when all rows are pending', () => {
    expect(commitProcessedFromPending(500, 500)).toBe(0);
  });

  it('returns total when no rows are pending', () => {
    expect(commitProcessedFromPending(500, 0)).toBe(500);
  });

  it('returns partial progress during commit', () => {
    expect(commitProcessedFromPending(500, 250)).toBe(250);
  });

  it('never exceeds totalRows', () => {
    expect(commitProcessedFromPending(500, -10)).toBe(500);
  });
});

describe('clampImportProgress', () => {
  it('caps processed at total', () => {
    expect(clampImportProgress(1000, 500)).toEqual({
      processed: 500,
      total: 500,
    });
  });

  it('preserves valid values', () => {
    expect(clampImportProgress(250, 500)).toEqual({
      processed: 250,
      total: 500,
    });
  });
});
