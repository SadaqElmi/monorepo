import { computeSnapshotDiff } from './report-snapshot-diff.util';

describe('computeSnapshotDiff', () => {
  it('marks first snapshot', () => {
    const d = computeSnapshotDiff('profit_loss', null, {
      totalRevenue: 1,
      totalExpenses: 0,
      netIncome: 1,
    });
    expect(d?.basis).toBe('first_snapshot');
  });

  it('computes P&L deltas', () => {
    const d = computeSnapshotDiff(
      'profit_loss',
      { totalRevenue: 100, totalExpenses: 40, netIncome: 60 },
      { totalRevenue: 110, totalExpenses: 45, netIncome: 65 },
    );
    expect(d?.basis).toBe('prior_snapshot');
    expect((d as { totalRevenueDelta: number }).totalRevenueDelta).toBe(10);
  });
});
