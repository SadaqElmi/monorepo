import { BadRequestException } from '@nestjs/common';
import {
  assertCoaRowsMergeable,
  ChartOfAccountsMergeService,
  type CoaMergeAccountRow,
} from './chart-of-accounts-merge.service';

const branch = '11111111-1111-1111-1111-111111111111';
const sourceId = '22222222-2222-2222-2222-222222222222';
const targetId = '33333333-3333-3333-3333-333333333333';

function row(
  id: string,
  overrides: Partial<CoaMergeAccountRow> = {},
): CoaMergeAccountRow {
  return {
    id,
    branch_id: branch,
    account_key: 'operating_expense',
    payment_method_key: null,
    parent_id: null,
    ...overrides,
  };
}

describe('assertCoaRowsMergeable', () => {
  it('throws when ids are equal', () => {
    const r = row(sourceId);
    expect(() => assertCoaRowsMergeable(branch, r, r)).toThrow(
      BadRequestException,
    );
  });

  it('throws when branchId does not match source', () => {
    expect(() =>
      assertCoaRowsMergeable(
        branch,
        row(sourceId, { branch_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
        row(targetId),
      ),
    ).toThrow(BadRequestException);
  });

  it('throws when account_key differs', () => {
    expect(() =>
      assertCoaRowsMergeable(
        branch,
        row(sourceId),
        row(targetId, { account_key: 'other' }),
      ),
    ).toThrow(BadRequestException);
  });

  it('throws when payment_method_key conflicts', () => {
    expect(() =>
      assertCoaRowsMergeable(
        branch,
        row(sourceId, { payment_method_key: 'cash' }),
        row(targetId, { payment_method_key: 'card' }),
      ),
    ).toThrow(BadRequestException);
  });

  it('allows matching non-null payment_method_key', () => {
    expect(() =>
      assertCoaRowsMergeable(
        branch,
        row(sourceId, { payment_method_key: 'cash' }),
        row(targetId, { payment_method_key: 'cash' }),
      ),
    ).not.toThrow();
  });

  it('allows one side null payment_method_key', () => {
    expect(() =>
      assertCoaRowsMergeable(
        branch,
        row(sourceId, { payment_method_key: 'cash' }),
        row(targetId, { payment_method_key: null }),
      ),
    ).not.toThrow();
  });
});

describe('ChartOfAccountsMergeService.mergeDuplicatedAccounts', () => {
  it('repoints journal lines and deletes source when snapshots table absent', async () => {
    const mockTx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          row(sourceId),
          row(targetId),
        ] as CoaMergeAccountRow[])
        .mockResolvedValueOnce([{ id: 'child-1' }])
        .mockResolvedValueOnce([{ id: 'jl-1' }, { id: 'jl-2' }])
        .mockResolvedValueOnce([{ exists: false }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };

    const prisma = {
      withTenantSchema: (_schema: string, fn: (tx: unknown) => unknown) =>
        fn(mockTx),
    } as unknown as import('../prisma/prisma.service').PrismaService;

    const service = new ChartOfAccountsMergeService(prisma);
    const out = await service.mergeDuplicatedAccounts(
      'tenant_x',
      branch,
      sourceId,
      targetId,
    );

    expect(out.merged).toBe(true);
    expect(out.journalLinesUpdated).toBe(2);
    expect(out.parentLinksUpdated).toBe(1);
    expect(out.snapshotsMergedOrRepointed).toBe(0);
    expect(out.paymentMethodKeyMoved).toBe(false);
    expect(out.deletedAccountId).toBe(sourceId);

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const firstExec = mockTx.$executeRawUnsafe.mock.calls[0] as unknown as [
      string,
      ...unknown[],
    ];
    expect(String(firstExec[0])).toContain('DELETE FROM chart_of_accounts');
  });

  it('throws when the two accounts are mutual parents', async () => {
    const mockTx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          row(sourceId, { parent_id: targetId }),
          row(targetId, { parent_id: sourceId }),
        ]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = {
      withTenantSchema: (_schema: string, fn: (tx: unknown) => unknown) =>
        fn(mockTx),
    } as unknown as import('../prisma/prisma.service').PrismaService;

    const service = new ChartOfAccountsMergeService(prisma);
    await expect(
      service.mergeDuplicatedAccounts('tenant_x', branch, sourceId, targetId),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when an account id is missing', async () => {
    const mockTx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([row(sourceId)]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = {
      withTenantSchema: (_schema: string, fn: (tx: unknown) => unknown) =>
        fn(mockTx),
    } as unknown as import('../prisma/prisma.service').PrismaService;

    const service = new ChartOfAccountsMergeService(prisma);
    await expect(
      service.mergeDuplicatedAccounts('tenant_x', branch, sourceId, targetId),
    ).rejects.toThrow(BadRequestException);
  });
});
