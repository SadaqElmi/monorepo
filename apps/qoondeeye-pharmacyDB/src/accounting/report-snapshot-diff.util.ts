import {
  extractBalanceSheetFromSnapshotPayload,
  extractCashFlowFromSnapshotPayload,
  extractPnlFromSnapshotPayload,
} from './report-snapshot-comparison.util';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compact delta vs the immediately previous persisted snapshot payload
 * (same-day prior version or latest prior calendar day), for dashboards.
 */
export function computeSnapshotDiff(
  reportType: 'profit_loss' | 'balance_sheet' | 'cash_flow',
  priorPayload: unknown,
  currentPayload: unknown,
): Record<string, unknown> | null {
  if (priorPayload == null) {
    return { basis: 'first_snapshot' };
  }

  if (reportType === 'profit_loss') {
    const a = extractPnlFromSnapshotPayload(priorPayload);
    const b = extractPnlFromSnapshotPayload(currentPayload);
    if (!a || !b) return { basis: 'unparseable' };
    return {
      basis: 'prior_snapshot',
      totalRevenueDelta: round2(b.totalRevenue - a.totalRevenue),
      totalExpensesDelta: round2(b.totalExpenses - a.totalExpenses),
      netIncomeDelta: round2(b.netIncome - a.netIncome),
    };
  }

  if (reportType === 'balance_sheet') {
    const a = extractBalanceSheetFromSnapshotPayload(priorPayload);
    const b = extractBalanceSheetFromSnapshotPayload(currentPayload);
    if (!a || !b) return { basis: 'unparseable' };
    return {
      basis: 'prior_snapshot',
      assetsDelta: round2(b.assets - a.assets),
      liabilitiesDelta: round2(b.liabilities - a.liabilities),
      totalEquityDelta: round2(b.totalEquity - a.totalEquity),
    };
  }

  const a = extractCashFlowFromSnapshotPayload(priorPayload);
  const b = extractCashFlowFromSnapshotPayload(currentPayload);
  if (!a || !b) return { basis: 'unparseable' };
  return {
    basis: 'prior_snapshot',
    operatingDelta: round2(b.operating - a.operating),
    investingDelta: round2(b.investing - a.investing),
    financingDelta: round2(b.financing - a.financing),
    netCashMovementDelta: round2(b.netCashMovement - a.netCashMovement),
  };
}
