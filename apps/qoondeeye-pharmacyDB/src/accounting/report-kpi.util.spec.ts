import { computeProfitLossKpis } from './report-kpi.util';

describe('computeProfitLossKpis', () => {
  it('computes margins', () => {
    const k = computeProfitLossKpis(
      {
        totalRevenue: 200,
        totalExpenses: 120,
        netIncome: 80,
        grossProfit: 140,
      },
      null,
    );
    expect(k.grossMarginPct).toBe(70);
    expect(k.netProfitMarginPct).toBe(40);
    expect(k.revenueGrowthPct).toBeNull();
  });

  it('computes growth when compare is set', () => {
    const k = computeProfitLossKpis(
      {
        totalRevenue: 110,
        totalExpenses: 60,
        netIncome: 50,
        grossProfit: 70,
      },
      { totalRevenue: 100, netIncome: 40 },
    );
    expect(k.revenueGrowthPct).toBe(10);
    expect(k.netIncomeGrowthPct).toBe(25);
  });
});
