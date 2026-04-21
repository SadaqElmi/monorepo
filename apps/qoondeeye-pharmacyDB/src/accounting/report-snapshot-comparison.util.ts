import type { VarianceMetric } from './report-variance.util';
import { computeVariance } from './report-variance.util';

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type PnlSnapshotBaseline = {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
};

export type PnlSnapshotComparison = {
  baselineSnapshotId: string;
  baselineSnapshotDate: string;
  baselineVersion: number;
  baseline: PnlSnapshotBaseline;
  deltas: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
};

export type PnlSnapshotVariance = {
  totalRevenue: VarianceMetric;
  totalExpenses: VarianceMetric;
  netIncome: VarianceMetric;
};

export function extractPnlFromSnapshotPayload(
  payload: unknown,
): PnlSnapshotBaseline | null {
  const r = asRecord(payload);
  if (!r) return null;
  const totalRevenue = num(r.totalRevenue);
  const totalExpenses = num(r.totalExpenses);
  const netIncome = num(r.netIncome);
  if (totalRevenue === null || totalExpenses === null || netIncome === null) {
    return null;
  }
  return { totalRevenue, totalExpenses, netIncome };
}

export function buildPnlSnapshotComparison(
  current: PnlSnapshotBaseline,
  prior: {
    id: string;
    snapshotDate: string;
    version: number;
    payload: unknown;
  } | null,
): PnlSnapshotComparison | null {
  if (!prior) return null;
  const baseline = extractPnlFromSnapshotPayload(prior.payload);
  if (!baseline) return null;
  return {
    baselineSnapshotId: prior.id,
    baselineSnapshotDate: prior.snapshotDate,
    baselineVersion: prior.version,
    baseline,
    deltas: {
      totalRevenue: current.totalRevenue - baseline.totalRevenue,
      totalExpenses: current.totalExpenses - baseline.totalExpenses,
      netIncome: current.netIncome - baseline.netIncome,
    },
  };
}

export function buildPnlSnapshotVariance(
  current: PnlSnapshotBaseline,
  baseline: PnlSnapshotBaseline,
): PnlSnapshotVariance {
  return {
    totalRevenue: computeVariance(current.totalRevenue, baseline.totalRevenue),
    totalExpenses: computeVariance(
      current.totalExpenses,
      baseline.totalExpenses,
    ),
    netIncome: computeVariance(current.netIncome, baseline.netIncome),
  };
}

export type BalanceSheetSnapshotBaseline = {
  assets: number;
  liabilities: number;
  totalEquity: number;
};

export type BalanceSheetSnapshotComparison = {
  baselineSnapshotId: string;
  baselineSnapshotDate: string;
  baselineVersion: number;
  baseline: BalanceSheetSnapshotBaseline;
  deltas: BalanceSheetSnapshotBaseline;
};

export type BalanceSheetSnapshotVariance = {
  assets: VarianceMetric;
  liabilities: VarianceMetric;
  totalEquity: VarianceMetric;
};

export function extractBalanceSheetFromSnapshotPayload(
  payload: unknown,
): BalanceSheetSnapshotBaseline | null {
  const r = asRecord(payload);
  const totals = r ? asRecord(r.totals) : null;
  if (!totals) return null;
  const assets = num(totals.assets);
  const liabilities = num(totals.liabilities);
  const totalEquity = num(totals.totalEquity);
  if (assets === null || liabilities === null || totalEquity === null) {
    return null;
  }
  return { assets, liabilities, totalEquity };
}

export function buildBalanceSheetSnapshotComparison(
  current: BalanceSheetSnapshotBaseline,
  prior: {
    id: string;
    snapshotDate: string;
    version: number;
    payload: unknown;
  } | null,
): BalanceSheetSnapshotComparison | null {
  if (!prior) return null;
  const baseline = extractBalanceSheetFromSnapshotPayload(prior.payload);
  if (!baseline) return null;
  return {
    baselineSnapshotId: prior.id,
    baselineSnapshotDate: prior.snapshotDate,
    baselineVersion: prior.version,
    baseline,
    deltas: {
      assets: current.assets - baseline.assets,
      liabilities: current.liabilities - baseline.liabilities,
      totalEquity: current.totalEquity - baseline.totalEquity,
    },
  };
}

export function buildBalanceSheetSnapshotVariance(
  current: BalanceSheetSnapshotBaseline,
  baseline: BalanceSheetSnapshotBaseline,
): BalanceSheetSnapshotVariance {
  return {
    assets: computeVariance(current.assets, baseline.assets),
    liabilities: computeVariance(current.liabilities, baseline.liabilities),
    totalEquity: computeVariance(current.totalEquity, baseline.totalEquity),
  };
}

export type CashFlowSnapshotBaseline = {
  operating: number;
  investing: number;
  financing: number;
  netCashMovement: number;
};

export type CashFlowSnapshotComparison = {
  baselineSnapshotId: string;
  baselineSnapshotDate: string;
  baselineVersion: number;
  baseline: CashFlowSnapshotBaseline;
  deltas: CashFlowSnapshotBaseline;
};

export type CashFlowSnapshotVariance = {
  operating: VarianceMetric;
  investing: VarianceMetric;
  financing: VarianceMetric;
  netCashMovement: VarianceMetric;
};

export function extractCashFlowFromSnapshotPayload(
  payload: unknown,
): CashFlowSnapshotBaseline | null {
  const r = asRecord(payload);
  if (!r) return null;
  const sectionTotals = asRecord(r.sectionTotals);
  if (!sectionTotals) return null;
  const operating = num(sectionTotals.operating);
  const investing = num(sectionTotals.investing);
  const financing = num(sectionTotals.financing);
  const netCashMovement = num(r.netCashMovement);
  if (
    operating === null ||
    investing === null ||
    financing === null ||
    netCashMovement === null
  ) {
    return null;
  }
  return { operating, investing, financing, netCashMovement };
}

export function buildCashFlowSnapshotComparison(
  current: CashFlowSnapshotBaseline,
  prior: {
    id: string;
    snapshotDate: string;
    version: number;
    payload: unknown;
  } | null,
): CashFlowSnapshotComparison | null {
  if (!prior) return null;
  const baseline = extractCashFlowFromSnapshotPayload(prior.payload);
  if (!baseline) return null;
  return {
    baselineSnapshotId: prior.id,
    baselineSnapshotDate: prior.snapshotDate,
    baselineVersion: prior.version,
    baseline,
    deltas: {
      operating: current.operating - baseline.operating,
      investing: current.investing - baseline.investing,
      financing: current.financing - baseline.financing,
      netCashMovement: current.netCashMovement - baseline.netCashMovement,
    },
  };
}

export function buildCashFlowSnapshotVariance(
  current: CashFlowSnapshotBaseline,
  baseline: CashFlowSnapshotBaseline,
): CashFlowSnapshotVariance {
  return {
    operating: computeVariance(current.operating, baseline.operating),
    investing: computeVariance(current.investing, baseline.investing),
    financing: computeVariance(current.financing, baseline.financing),
    netCashMovement: computeVariance(
      current.netCashMovement,
      baseline.netCashMovement,
    ),
  };
}
