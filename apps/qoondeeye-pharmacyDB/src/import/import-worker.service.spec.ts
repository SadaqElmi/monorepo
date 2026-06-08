import { ImportWorkerService } from './import-worker.service';
import type { ImportContext, ImportJob } from './types/import.types';

const JOB_ID = 'job-500';
const SCHEMA = 'tenant_test';

function postValidationJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: JOB_ID,
    importType: 'product',
    status: 'confirmed',
    fileName: 'products.xlsx',
    fileSha256: null,
    policySnapshot: {},
    summary: {
      totalRows: 500,
      errorRows: 0,
      warningRows: 0,
      createProducts: 500,
      updateProducts: 0,
      skipRows: 0,
    },
    totalRows: 500,
    processedRows: 500,
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
    ...overrides,
  };
}

const ctx: ImportContext = {
  schemaName: SCHEMA,
  tenantId: 'tenant-1',
  userId: 'user-1',
  allowedBranchIds: [],
  permissionCodes: [],
  businessType: 'pharmacy',
  importPolicies: {},
};

describe('ImportWorkerService.runJobCommit', () => {
  const jobs = {
    getJob: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    countPendingCommitRows: jest.fn(),
  };
  const registry = { get: jest.fn() };
  const progress = { set: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    withTenantSchema: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = { append: jest.fn() };

  const commitChunk = jest.fn();

  const service = new ImportWorkerService(
    prisma as never,
    { applyTenantSchemaPatches: jest.fn() } as never,
    jobs as never,
    registry as never,
    progress as never,
    auditLog as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jobs.countPendingCommitRows.mockReset();
    registry.get.mockReturnValue({ commitChunk });
    jobs.getJob
      .mockResolvedValueOnce(postValidationJob())
      .mockResolvedValueOnce(
        postValidationJob({ status: 'completed', processedRows: 500 }),
      );
  });

  it('does not double-count validation rows for a 500-row product import', async () => {
    jobs.countPendingCommitRows
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    commitChunk.mockResolvedValueOnce({
      processed: 500,
      committed: 500,
      failed: 0,
      done: true,
    });

    const result = await service.runJobCommit(SCHEMA, JOB_ID, ctx);

    expect(result.processedRows).toBe(500);
    expect(result.totalRows).toBe(500);

    const processedUpdates = jobs.updateStatus.mock.calls
      .map((c) => c[3]?.processedRows)
      .filter((v): v is number => v != null);
    expect(processedUpdates).not.toContain(1000);
    expect(processedUpdates[processedUpdates.length - 1]).toBe(500);

    expect(jobs.updateStatus).toHaveBeenCalledWith(
      SCHEMA,
      JOB_ID,
      'completed',
      expect.objectContaining({ processedRows: 500 }),
    );

    expect(progress.set).toHaveBeenCalledWith(JOB_ID, {
      phase: 'completed',
      processed: 500,
      total: 500,
    });
  });

  it('reports incremental commit progress across two chunks without exceeding total', async () => {
    jobs.getJob.mockReset();
    jobs.getJob
      .mockResolvedValueOnce(postValidationJob())
      .mockResolvedValueOnce(
        postValidationJob({ status: 'completed', processedRows: 500 }),
      );

    jobs.countPendingCommitRows
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(250)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    commitChunk
      .mockResolvedValueOnce({
        processed: 250,
        committed: 250,
        failed: 0,
        done: false,
      })
      .mockResolvedValueOnce({
        processed: 250,
        committed: 250,
        failed: 0,
        done: true,
      });

    await service.runJobCommit(SCHEMA, JOB_ID, ctx);

    const committingProgress = progress.set.mock.calls
      .filter((c) => c[1].phase === 'committing')
      .map((c) => c[1].processed);
    expect(committingProgress).toEqual([0, 250, 500]);
    expect(committingProgress.every((n) => n <= 500)).toBe(true);
  });
});
