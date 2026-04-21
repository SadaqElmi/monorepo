import type { BalanceSheetReport } from './financial-reports.service';
import type {
  InterbranchPairBreakdownRow,
  InterbranchTransferBreakdownRow,
} from './interbranch-report.util';
import { deriveConsolidationKpiStatus } from './interbranch-report.util';

export const INTERBRANCH_ACCOUNT_KEYS = [
  'due_from_branch',
  'due_to_branch',
] as const;

export type InterbranchAccountKey = (typeof INTERBRANCH_ACCOUNT_KEYS)[number];

export type BalanceSheetConsolidationMeta = {
  mode: 'consolidated';
  /** Reporting-only consolidation (no elimination journals posted). */
  reportingMode: 'reporting-only';
  grossDueFrom: number;
  grossDueTo: number;
  eliminatedDueFrom: number;
  eliminatedDueTo: number;
  eliminatedAccountKeys: string[];
  /** Signed: grossDueFrom − grossDueTo (asset vs liability balance convention used in reports). */
  residual: number;
  severity: 'clean' | 'warning' | 'critical';
  /** Single headline status for UI. */
  consolidationStatus: 'clean' | 'minor' | 'critical';
  messages: string[];
  interbranchBreakdown: InterbranchPairBreakdownRow[];
  transferBreakdown?: InterbranchTransferBreakdownRow[];
};

const EPS = 0.01;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Same residual as consolidated balance sheet (gross due from − gross due to). */
export function interbranchBalanceSheetResidual(
  grossDueFrom: number,
  grossDueTo: number,
): number {
  return round2(grossDueFrom - grossDueTo);
}

export type ApplyConsolidationExtras = {
  interbranchBreakdown: InterbranchPairBreakdownRow[];
  transferBreakdown?: InterbranchTransferBreakdownRow[];
};

/**
 * Reporting-only consolidation: removes inter-branch transfer GL from the
 * balance sheet line list and from asset/liability totals. Does not post journals.
 */
export function applyBalanceSheetConsolidation(
  raw: BalanceSheetReport,
  extras?: ApplyConsolidationExtras,
): BalanceSheetReport {
  const eliminatedAccountKeys = [...INTERBRANCH_ACCOUNT_KEYS] as unknown as string[];
  let grossDueFrom = 0;
  let grossDueTo = 0;
  for (const line of raw.lines) {
    if (line.accountKey === 'due_from_branch') {
      grossDueFrom += line.balance;
    } else if (line.accountKey === 'due_to_branch') {
      grossDueTo += line.balance;
    }
  }

  const residual = interbranchBalanceSheetResidual(grossDueFrom, grossDueTo);
  const messages: string[] = [];
  let severity: BalanceSheetConsolidationMeta['severity'] = 'clean';

  if (Math.abs(residual) > EPS) {
    severity = Math.abs(residual) >= 1000 ? 'critical' : 'warning';
    messages.push(
      `Inter-branch balances do not fully offset (residual ${residual.toFixed(2)}). ` +
        `Typical causes: in-transit transfers, partial ship/receive, or data issues — run reconciliation.`,
    );
  } else {
    messages.push(
      'Inter-branch due from / due to balances offset within tolerance for this scope.',
    );
  }

  const filteredLines = raw.lines.filter(
    (l) =>
      !eliminatedAccountKeys.includes(l.accountKey),
  );

  const assets = round2(raw.totals.assets - grossDueFrom);
  const liabilities = round2(raw.totals.liabilities - grossDueTo);
  const liabilitiesAndEquity = round2(liabilities + raw.totals.totalEquity);

  const residualAbs = Math.abs(residual);
  const consolidation: BalanceSheetConsolidationMeta = {
    mode: 'consolidated',
    reportingMode: 'reporting-only',
    grossDueFrom: round2(grossDueFrom),
    grossDueTo: round2(grossDueTo),
    eliminatedDueFrom: round2(grossDueFrom),
    eliminatedDueTo: round2(grossDueTo),
    eliminatedAccountKeys,
    residual,
    severity,
    consolidationStatus: deriveConsolidationKpiStatus(residualAbs, severity),
    messages,
    interbranchBreakdown: extras?.interbranchBreakdown ?? [],
    transferBreakdown: extras?.transferBreakdown,
  };

  return {
    ...raw,
    lines: filteredLines,
    totals: {
      ...raw.totals,
      assets,
      liabilities,
      liabilitiesAndEquity,
    },
    consolidation,
    drilldownCheck: {
      checked: false,
      mismatches: 0,
      isConsistent: true,
      skipReason:
        'Drilldown consistency check is disabled in consolidated mode (inter-branch lines removed from view).',
    },
  };
}
