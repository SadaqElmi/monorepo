import { aggregateImportCenterDashboard } from './import-center-dashboard.util';

describe('aggregateImportCenterDashboard', () => {
  it('sums total from all import_jobs status groups', () => {
    const dash = aggregateImportCenterDashboard(
      [
        { status: 'draft', c: 5 },
        { status: 'validating', c: 2 },
        { status: 'committing', c: 1 },
        { status: 'completed', c: 100 },
        { status: 'failed', c: 4 },
        { status: 'reversed', c: 3 },
      ],
      [
        { import_type: 'product', c: 60 },
        { import_type: 'purchase', c: 50 },
        { import_type: 'opening_stock', c: 5 },
      ],
    );
    expect(dash.total).toBe(115);
    expect(dash.running).toBe(3);
    expect(dash.completed).toBe(100);
    expect(dash.failed).toBe(4);
    expect(dash.rolledBack).toBe(3);
    expect(dash.byType.product).toBe(60);
    expect(dash.byType.opening_stock).toBe(5);
    expect(dash.legacyByType.purchase).toBe(50);
    expect(
      dash.byType.product +
        dash.byType.opening_stock +
        (dash.legacyByType.purchase ?? 0),
    ).toBe(115);
  });
});
