import { applyBalanceSheetConsolidation } from './consolidation-report.util';
import type { BalanceSheetReport } from './financial-reports.service';

/**
 * Models the common "in-transit" case: ship posted on branch A, receive not yet
 * posted on branch B — gross due-from and due-to do not offset in group scope.
 * Full DB coverage can extend this with `FinancialReportsService` + fixtures.
 */
describe('interbranch consolidation (in-transit residual)', () => {
  it('shows non-clean severity and attaches pair breakdown extras', () => {
    const raw: BalanceSheetReport = {
      lines: [
        {
          accountType: 'asset',
          accountKey: 'cash',
          name: 'Cash',
          balance: 100,
        },
        {
          accountType: 'asset',
          accountKey: 'due_from_branch',
          name: 'Due from branch',
          balance: 50,
        },
        {
          accountType: 'liability',
          accountKey: 'due_to_branch',
          name: 'Due to branch',
          balance: 0,
        },
        {
          accountType: 'equity',
          accountKey: 'equity',
          name: 'Equity',
          balance: 50,
        },
      ],
      totals: {
        assets: 150,
        liabilities: 0,
        equityFromAccounts: 50,
        retainedEarningsImplicit: 0,
        totalEquity: 50,
        liabilitiesAndEquity: 50,
      },
      generatedAt: new Date().toISOString(),
      elapsedMs: 0,
    };

    const consolidated = applyBalanceSheetConsolidation(raw, {
      interbranchBreakdown: [
        {
          fromBranchId: '11111111-1111-1111-1111-111111111111',
          toBranchId: '22222222-2222-2222-2222-222222222222',
          fromBranchName: 'Branch A',
          toBranchName: 'Branch B',
          dueFrom: 50,
          dueTo: 0,
          difference: 50,
        },
      ],
    });

    expect(consolidated.consolidation?.residual).toBe(50);
    expect(consolidated.consolidation?.severity).toBe('warning');
    expect(consolidated.consolidation?.consolidationStatus).toBe('minor');
    expect(consolidated.consolidation?.interbranchBreakdown).toHaveLength(1);
    expect(
      consolidated.lines.some((l) => l.accountKey === 'due_from_branch'),
    ).toBe(false);
  });
});
