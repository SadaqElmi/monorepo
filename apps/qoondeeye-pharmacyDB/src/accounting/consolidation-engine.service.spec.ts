import { ConsolidationEngineService } from './consolidation-engine.service';

describe('ConsolidationEngineService (dry-run)', () => {
  it('computes balance-sheet and P&L elimination metadata without posting', async () => {
    const reports = {
      getCloseReadiness: jest.fn().mockResolvedValue({ status: 'CLEAN' }),
      balanceSheet: jest.fn().mockResolvedValue({
        lines: [
          { accountKey: 'due_from_branch', balance: 150 },
          { accountKey: 'due_to_branch', balance: 100 },
        ],
      }),
      incomeStatement: jest.fn().mockResolvedValue({
        netIncome: 0,
        intercompany: {
          revenue: 80,
          cogs: 50,
          expenses: 60,
          netIncomeImpact: 20,
        },
      }),
    };
    const svc = new ConsolidationEngineService(
      { withTenantSchema: jest.fn() } as never,
      reports as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const out = await svc.runConsolidation({
      schemaName: 'pharmacy1',
      periodKey: '2026-04',
      asOfDate: '2026-04-30',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
      scopeHash: 'agg:1|branch:none',
      branchIds: [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ],
      actorUserId: '33333333-3333-3333-3333-333333333333',
      dryRun: true,
    });

    expect(out.reversedRunId).toBeNull();
    expect(out.run.id).toBe('dry-run');
    expect(out.run.metadata).toMatchObject({
      balances: { grossDueFrom: 150, grossDueTo: 100, residual: 50 },
      pnl: { interRev: 80, interCogs: 50, interExp: 10, pnlImbalance: 20 },
    });
    expect(reports.getCloseReadiness).toHaveBeenCalledTimes(1);
  });

  it('adds NCI ownership metadata for partial ownership entity scope', async () => {
    const reports = {
      getCloseReadiness: jest.fn().mockResolvedValue({ status: 'CLEAN' }),
      balanceSheet: jest.fn().mockResolvedValue({
        lines: [
          { accountKey: 'due_from_branch', balance: 0 },
          { accountKey: 'due_to_branch', balance: 0 },
        ],
      }),
      incomeStatement: jest.fn().mockResolvedValue({
        netIncome: 500,
        intercompany: {
          revenue: 0,
          cogs: 0,
          expenses: 0,
          netIncomeImpact: 0,
        },
      }),
    };
    const svc = new ConsolidationEngineService(
      { withTenantSchema: jest.fn() } as never,
      reports as never,
      {} as never,
      {} as never,
      {} as never,
      {
        resolveScopeByEntity: jest.fn().mockResolvedValue({
          entityId: 'entity',
          descendantEntityIds: ['entity'],
          branchIds: ['b1', 'b2'],
          branchOwnership: { b1: 0.8, b2: 0.8 },
          entityOwnership: { entity: 1 },
          descendantCount: 1,
          branchCount: 2,
        }),
      } as never,
      {} as never,
    );

    const out = await svc.runConsolidation({
      schemaName: 'pharmacy1',
      periodKey: '2026-04',
      asOfDate: '2026-04-30',
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
      scopeHash: 'scope:entity:1',
      branchIds: [],
      entityId: 'entity',
      actorUserId: null,
      dryRun: true,
    });

    expect(out.run.metadata).toMatchObject({
      ownership: {
        nciShare: 0.2,
        nciAmount: 100,
      },
    });
  });
});
