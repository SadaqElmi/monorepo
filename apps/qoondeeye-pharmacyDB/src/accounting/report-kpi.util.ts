export type ProfitLossKpis = {
  grossMarginPct: number | null;
  netProfitMarginPct: number | null;
  revenueGrowthPct: number | null;
  netIncomeGrowthPct: number | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function pctChange(current: number, baseline: number): number | null {
  if (Math.abs(baseline) < 0.005) return null;
  return round2(((current - baseline) / baseline) * 100);
}

/** CFO-style ratios from current P&L; growth vs compare period when provided. */
export function computeProfitLossKpis(
  row: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    grossProfit: number;
  },
  compare?: {
    totalRevenue: number;
    netIncome: number;
  } | null,
): ProfitLossKpis {
  const grossMarginPct =
    row.totalRevenue > 0.005
      ? round2((row.grossProfit / row.totalRevenue) * 100)
      : null;
  const netProfitMarginPct =
    row.totalRevenue > 0.005
      ? round2((row.netIncome / row.totalRevenue) * 100)
      : null;
  const revenueGrowthPct = compare
    ? pctChange(row.totalRevenue, compare.totalRevenue)
    : null;
  const netIncomeGrowthPct = compare
    ? pctChange(row.netIncome, compare.netIncome)
    : null;

  return {
    grossMarginPct,
    netProfitMarginPct,
    revenueGrowthPct,
    netIncomeGrowthPct,
  };
}
