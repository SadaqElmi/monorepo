import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { COMMIT_CHUNK } from './handlers/import-commit.constants';
import { ImportHandlerRegistry } from './import-handler.registry';
import { ImportJobsService } from './import-jobs.service';
import { ImportProgressService } from './import-progress.service';
import { commitProcessedFromPending } from './import-progress.util';
import type { ImportContext, ImportJob } from './types/import.types';

@Injectable()
export class ImportWorkerService {
  private readonly logger = new Logger(ImportWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly jobs: ImportJobsService,
    private readonly registry: ImportHandlerRegistry,
    private readonly progress: ImportProgressService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Cron('*/25 * * * * *')
  async drainImportJobs(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, schemaName: true },
    });

    for (const tenant of tenants) {
      try {
        await this.tenantService.applyTenantSchemaPatches(tenant.schemaName);
        await this.jobs.releaseStaleCommittingJobs(tenant.schemaName);
        await this.processOneJob(tenant.id, tenant.schemaName);
      } catch (e) {
        this.logger.warn(
          `Import worker error for ${tenant.schemaName}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }

  /** Process all pending commit rows for a job (used by HTTP commit and background worker). */
  async runJobCommit(
    schemaName: string,
    jobId: string,
    ctx: ImportContext,
  ): Promise<ImportJob> {
    const job = await this.jobs.getJob(schemaName, jobId);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    if (job.status === 'completed') {
      return job;
    }
    if (job.status !== 'confirmed' && job.status !== 'committing') {
      throw new BadRequestException(
        `Job cannot be committed from status: ${job.status}`,
      );
    }

    const handler = this.registry.get(job.importType);

    const publishCommitProgress = async (phase: 'committing' | 'failed') => {
      const pending = await this.jobs.countPendingCommitRows(
        schemaName,
        jobId,
      );
      const processed = commitProcessedFromPending(job.totalRows, pending);
      await this.jobs.updateStatus(schemaName, jobId, 'committing', {
        processedRows: processed,
      });
      await this.progress.set(jobId, {
        phase,
        processed,
        total: job.totalRows,
      });
      return processed;
    };

    try {
      if (job.status === 'confirmed') {
        await this.jobs.updateStatus(schemaName, jobId, 'committing');
      }

      await publishCommitProgress('committing');

      while (true) {
        const result = await handler.commitChunk(
          schemaName,
          jobId,
          ctx,
          0,
          COMMIT_CHUNK,
        );

        await publishCommitProgress('committing');

        if (result.done) break;
        if (result.processed === 0) break;
      }

      await this.jobs.updateStatus(schemaName, jobId, 'completed', {
        committedAt: true,
        processedRows: job.totalRows,
      });
      await this.progress.set(jobId, {
        phase: 'completed',
        processed: job.totalRows,
        total: job.totalRows,
      });

      await this.prisma.withTenantSchema(schemaName, async (tx) => {
        await this.auditLog.append(tx, {
          branchId: null,
          actorUserId: job.confirmedBy ?? job.createdBy,
          tableName: 'import_jobs',
          recordId: job.id,
          action: 'completed',
          entityType: 'import_job',
          entityId: job.id,
          newPayload: { importType: job.importType, totalRows: job.totalRows },
        });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const pending = await this.jobs.countPendingCommitRows(
        schemaName,
        jobId,
      );
      const processed = commitProcessedFromPending(job.totalRows, pending);
      await this.jobs.updateStatus(schemaName, jobId, 'failed', {
        errorMessage: msg,
        processedRows: processed,
      });
      await this.progress.set(jobId, {
        phase: 'failed',
        processed,
        total: job.totalRows,
        message: msg,
      });
      throw e;
    }

    const updated = await this.jobs.getJob(schemaName, jobId);
    if (!updated) {
      throw new NotFoundException('Import job not found after commit');
    }
    return updated;
  }

  private async processOneJob(
    tenantId: string,
    schemaName: string,
  ): Promise<void> {
    const job = await this.jobs.claimCommittingJob(schemaName);
    if (!job) return;

    const ctx = await this.buildWorkerContext(
      schemaName,
      tenantId,
      job.createdBy,
    );

    try {
      await this.runJobCommit(schemaName, job.id, ctx);
    } catch {
      // runJobCommit already persisted failed status
    }
  }

  private async buildWorkerContext(
    schemaName: string,
    tenantId: string,
    userId: string | null,
  ): Promise<ImportContext> {
    const [settings] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<
        Array<{ business_type: string; import_policies: unknown }>
      >(
        `SELECT business_type, import_policies FROM tenant_settings LIMIT 1`,
      ),
    );

    const branches = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text AS id FROM branches`,
      ),
    );

    return {
      schemaName,
      tenantId,
      userId,
      allowedBranchIds: branches.map((b) => b.id),
      permissionCodes: [],
      businessType: settings?.business_type ?? 'pharmacy',
      importPolicies: (settings?.import_policies ?? {}) as Record<
        string,
        unknown
      >,
    };
  }
}
