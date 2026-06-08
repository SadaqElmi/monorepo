import { BadRequestException } from '@nestjs/common';
import { ImportRollbackService } from './import-rollback.service';
import type { ImportJob } from './types/import.types';

function completedJob(): ImportJob {
  return {
    id: 'job-1',
    importType: 'product',
    status: 'completed',
    fileName: 'test.xlsx',
    fileSha256: null,
    policySnapshot: {},
    summary: null,
    totalRows: 1,
    processedRows: 1,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 3,
    createdBy: null,
    confirmedBy: null,
    confirmedAt: null,
    committedAt: null,
    reversedAt: null,
    reversedBy: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

describe('ImportRollbackService', () => {
  const jobs = { getJob: jest.fn() };
  const inventoryService = { decreaseStock: jest.fn() };
  const accountingPosting = { reverseOpeningStockJournal: jest.fn() };
  const lockDates = { assertEntryDateOpen: jest.fn() };
  const auditLog = { append: jest.fn() };
  const cacheInvalidation = {
    invalidateAfterLedgerOrInventoryMutation: jest.fn(),
  };

  let queryResult: unknown[];
  const mockTx = {
    $queryRawUnsafe: jest.fn(async () => queryResult),
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    withTenantSchema: jest.fn(async (_schema: string, cb: (tx: unknown) => unknown) =>
      cb(mockTx),
    ),
  };

  const service = new ImportRollbackService(
    prisma as never,
    jobs as never,
    inventoryService as never,
    accountingPosting as never,
    lockDates as never,
    auditLog as never,
    cacheInvalidation as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryResult = [];
  });

  describe('getReverseEligibility', () => {
    it('blocks when job is not completed', async () => {
      jobs.getJob.mockResolvedValue({ ...completedJob(), status: 'preview' });
      const result = await service.getReverseEligibility('tenant', 'job-1');
      expect(result.canReverse).toBe(false);
      expect(result.reason).toMatch(/completed/i);
    });

    it('blocks when batch quantity is insufficient', async () => {
      jobs.getJob.mockResolvedValue(completedJob());
      queryResult = [
        {
          id: 'entry-1',
          branch_id: 'branch-1',
          product_id: 'product-1',
          batch_id: 'batch-1',
          import_job_row_id: 'row-1',
          quantity: 100,
          cost_price: 1,
          entry_date: '2026-02-01',
          batch_quantity: 40,
          branch_lock: null,
        },
      ];
      const result = await service.getReverseEligibility('tenant', 'job-1');
      expect(result.canReverse).toBe(false);
      expect(result.reason).toMatch(/insufficient quantity/i);
    });
  });

  describe('reverseCompletedJob', () => {
    it('reverses stock and GL when allowed', async () => {
      jobs.getJob.mockResolvedValue(completedJob());
      queryResult = [
        {
          id: 'entry-1',
          branch_id: 'branch-1',
          product_id: 'product-1',
          batch_id: 'batch-1',
          import_job_row_id: 'row-1',
          quantity: 10,
          cost_price: 2,
          entry_date: '2026-02-01',
          batch_quantity: 10,
          branch_lock: null,
        },
      ];
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce(queryResult)
        .mockResolvedValueOnce([{ quantity: 0 }])
        .mockResolvedValueOnce([{ id: 'rev-je-1' }]);

      const result = await service.reverseCompletedJob(
        'tenant',
        'tenant-id',
        'job-1',
        'user-1',
      );

      expect(result).toEqual({
        reversedStockRows: 1,
        reversedQty: 10,
        reversedGlTotal: 20,
      });
      expect(inventoryService.decreaseStock).toHaveBeenCalledWith(mockTx, {
        branchId: 'branch-1',
        productId: 'product-1',
        quantity: 10,
      });
      expect(accountingPosting.reverseOpeningStockJournal).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          openingStockEntryId: 'entry-1',
          inventoryTotal: 20,
        }),
      );
      expect(cacheInvalidation.invalidateAfterLedgerOrInventoryMutation).toHaveBeenCalled();
    });

    it('throws when batch quantity is insufficient', async () => {
      jobs.getJob.mockResolvedValue(completedJob());
      queryResult = [
        {
          id: 'entry-1',
          branch_id: 'branch-1',
          product_id: 'product-1',
          batch_id: 'batch-1',
          import_job_row_id: 'row-1',
          quantity: 100,
          cost_price: 1,
          entry_date: '2026-02-01',
          batch_quantity: 10,
          branch_lock: null,
        },
      ];

      await expect(
        service.reverseCompletedJob('tenant', 'tenant-id', 'job-1', null),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(inventoryService.decreaseStock).not.toHaveBeenCalled();
    });
  });
});
