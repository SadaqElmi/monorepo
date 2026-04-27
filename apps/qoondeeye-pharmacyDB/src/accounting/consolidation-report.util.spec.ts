import {
  applyBalanceSheetConsolidation,
  interbranchBalanceSheetResidual,
} from './consolidation-report.util';
import type { BalanceSheetReport } from './financial-reports.service';

function baseReport(
  overrides: Partial<BalanceSheetReport> = {},
): BalanceSheetReport {
  return {
    lines: [],
    totals: {
      assets: 0,
      liabilities: 0,
      equityFromAccounts: 0,
      retainedEarningsImplicit: 0,
      totalEquity: 0,
      liabilitiesAndEquity: 0,
    },
    generatedAt: new Date().toISOString(),
    elapsedMs: 1,
    ...overrides,
  };
}

describe('interbranchBalanceSheetResidual', () => {
  it('returns zero when gross amounts match', () => {
    expect(interbranchBalanceSheetResidual(500, 500)).toBe(0);
  });

  it('returns signed difference', () => {
    expect(interbranchBalanceSheetResidual(100, 40)).toBe(60);
  });
});

describe('applyBalanceSheetConsolidation', () => {
  it('removes due_from and due_to lines and adjusts totals when paired', () => {
    const raw = baseReport({
      lines: [
        {
          accountType: 'asset',
          accountKey: 'cash',
          name: 'Cash',
          balance: 1000,
        },
        {
          accountType: 'asset',
          accountKey: 'due_from_branch',
          name: 'Due from branch',
          balance: 250,
        },
        {
          accountType: 'liability',
          accountKey: 'due_to_branch',
          name: 'Due to branch',
          balance: 250,
        },
        {
          accountType: 'liability',
          accountKey: 'accounts_payable',
          name: 'AP',
          balance: 100,
        },
      ],
      totals: {
        assets: 1250,
        liabilities: 350,
        equityFromAccounts: 0,
        retainedEarningsImplicit: 0,
        totalEquity: 900,
        liabilitiesAndEquity: 1250,
      },
    });
    const out = applyBalanceSheetConsolidation(raw, {
      interbranchBreakdown: [
        {
          fromBranchId: 'a',
          toBranchId: 'b',
          fromBranchName: 'A',
          toBranchName: 'B',
          dueFrom: 250,
          dueTo: 250,
          difference: 0,
        },
      ],
    });
    expect(out.lines.map((l) => l.accountKey)).toEqual([
      'cash',
      'accounts_payable',
    ]);
    expect(out.totals.assets).toBe(1000);
    expect(out.totals.liabilities).toBe(100);
    expect(out.consolidation?.residual).toBe(0);
    expect(out.consolidation?.severity).toBe('clean');
    expect(out.consolidation?.reportingMode).toBe('reporting-only');
    expect(out.consolidation?.consolidationStatus).toBe('clean');
    expect(out.consolidation?.interbranchBreakdown).toHaveLength(1);
    expect(out.drilldownCheck?.checked).toBe(false);
    expect(out.drilldownCheck?.skipReason).toContain('consolidated');
  });

  it('flags warning when residual is non-zero', () => {
    const raw = baseReport({
      lines: [
        {
          accountType: 'asset',
          accountKey: 'due_from_branch',
          name: 'Due from branch',
          balance: 100,
        },
        {
          accountType: 'liability',
          accountKey: 'due_to_branch',
          name: 'Due to branch',
          balance: 70,
        },
      ],
      totals: {
        assets: 100,
        liabilities: 70,
        equityFromAccounts: 0,
        retainedEarningsImplicit: 0,
        totalEquity: 30,
        liabilitiesAndEquity: 100,
      },
    });
    const out = applyBalanceSheetConsolidation(raw);
    expect(out.consolidation?.residual).toBe(30);
    expect(out.consolidation?.severity).toBe('warning');
    expect(out.consolidation?.consolidationStatus).toBe('minor');
    expect(out.lines).toHaveLength(0);
  });
});
