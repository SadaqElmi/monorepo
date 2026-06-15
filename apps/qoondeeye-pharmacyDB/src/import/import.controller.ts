import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { ImportHandlerRegistry } from './import-handler.registry';
import { ImportJobsService } from './import-jobs.service';
import { ImportProgressService } from './import-progress.service';
import { ImportTemplateService } from './import-template.service';
import { ImportRollbackService } from './import-rollback.service';
import { ImportWorkerService } from './import-worker.service';
import type {
  ImportContext,
  ImportJobStatus,
  ImportType,
} from './types/import.types';
import { permissionForImportType } from './types/import.types';
import { resolveImportAllowedBranchIds } from './import-branch-scope.util';
import { PermissionGuard } from '../common/security/permission.guard';
import { userHasPermissions } from '../common/security/permission-resolve.util';
import { RequirePermissions } from '../common/security/require-permissions.decorator';

@Controller('imports')
@UseGuards(PermissionGuard)
export class ImportController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly prisma: PrismaService,
    private readonly jobs: ImportJobsService,
    private readonly template: ImportTemplateService,
    private readonly registry: ImportHandlerRegistry,
    private readonly progress: ImportProgressService,
    private readonly auditLog: AuditLogService,
    private readonly rollback: ImportRollbackService,
    private readonly worker: ImportWorkerService,
  ) {}

  private ensureTenant(): { schema: string; tenantId: string } {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException('Tenant context required');
    }
    return { schema: tenant.schemaName, tenantId: tenant.id };
  }

  private async buildImportContext(req: FastifyRequest): Promise<ImportContext> {
    const { schema, tenantId } = this.ensureTenant();

    const [settings] = await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<
        Array<{ business_type: string; import_policies: unknown }>
      >(`SELECT business_type, import_policies FROM tenant_settings LIMIT 1`),
    );

    const allowedBranchIds = await resolveImportAllowedBranchIds(
      req,
      schema,
      (schemaName) =>
        this.prisma.withTenantSchema(schemaName, (tx) =>
          tx
            .$queryRawUnsafe<Array<{ id: string }>>(
              `SELECT id::text AS id FROM branches ORDER BY name`,
            )
            .then((rows) => rows.map((r) => r.id)),
        ),
    );

    return {
      schemaName: schema,
      tenantId,
      userId: req.userId ?? null,
      allowedBranchIds,
      permissionCodes: req.permissionCodes ?? [],
      businessType: settings?.business_type ?? 'pharmacy',
      importPolicies: (settings?.import_policies ?? {}) as Record<
        string,
        unknown
      >,
    };
  }

  private async resolveHandlerForJob(schema: string, jobId: string) {
    const job = await this.jobs.getJob(schema, jobId);
    if (!job) throw new BadRequestException('Import job not found');
    return { job, handler: this.registry.get(job.importType) };
  }

  private parsePreviewRowUpdates(
    rows: Array<{ id?: unknown; rawData?: unknown }> | undefined,
  ): Array<{ id: string; rawData: Record<string, unknown> }> {
    if (!Array.isArray(rows) || !rows.length) {
      throw new BadRequestException('No edited rows supplied');
    }
    if (rows.length > 1000) {
      throw new BadRequestException('Too many edited rows supplied');
    }
    return rows.map((row, index) => {
      if (typeof row?.id !== 'string' || !row.id.trim()) {
        throw new BadRequestException(`Edited row ${index + 1} is missing id`);
      }
      if (
        row.rawData == null ||
        typeof row.rawData !== 'object' ||
        Array.isArray(row.rawData)
      ) {
        throw new BadRequestException(
          `Edited row ${index + 1} is missing rawData`,
        );
      }
      return {
        id: row.id,
        rawData: row.rawData as Record<string, unknown>,
      };
    });
  }

  @Get('product-import/template')
  @RequirePermissions('import_products')
  async downloadProductTemplate(@Res({ passthrough: true }) reply: FastifyReply) {
    const { schema } = this.ensureTenant();
    await this.tenantService.applyTenantSchemaPatches(schema);
    const buf = await this.template.generateProductTemplate(schema);
    reply.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    reply.header(
      'Content-Disposition',
      'attachment; filename="product-import-template.xlsx"',
    );
    return buf;
  }

  @Get('opening-stock-import/template')
  @RequirePermissions('import_opening_stock')
  async downloadOpeningStockTemplate(
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { schema } = this.ensureTenant();
    await this.tenantService.applyTenantSchemaPatches(schema);
    const buf = await this.template.generateOpeningStockTemplate(schema);
    reply.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    reply.header(
      'Content-Disposition',
      'attachment; filename="opening-stock-import-template.xlsx"',
    );
    return buf;
  }

  @Post('product-import/jobs')
  @RequirePermissions('import_products')
  async uploadProductJob(@Req() req: FastifyRequest) {
    return this.uploadJob(req, 'product');
  }

  @Post('opening-stock-import/jobs')
  @RequirePermissions('import_opening_stock')
  async uploadOpeningStockJob(@Req() req: FastifyRequest) {
    return this.uploadJob(req, 'opening_stock');
  }

  private async uploadJob(
    req: FastifyRequest,
    importType: ImportType,
    policySnapshot?: Record<string, unknown>,
  ) {
    const { schema } = this.ensureTenant();
    await this.tenantService.applyTenantSchemaPatches(schema);

    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }
    const buffer = await data.toBuffer();
    if (buffer.length > 50 * 1024 * 1024) {
      throw new BadRequestException('File exceeds 50MB limit');
    }

    const handler = this.registry.get(importType);
    const fileName = data.filename ?? 'import.xlsx';
    const storageDir = handler.storageDir();
    await fs.mkdir(storageDir, { recursive: true });

    const { id: jobId } = await this.jobs.createDraftJob(schema, {
      importType,
      fileName,
      fileStoragePath: '',
      fileSha256: '',
      createdBy: req.userId ?? null,
      policySnapshot: policySnapshot ?? {},
    });

    const storagePath = path.join(storageDir, `${schema}-${jobId}.xlsx`);
    await fs.writeFile(storagePath, buffer);

    const { totalRows, fileSha256 } = await handler.parseAndStage(
      schema,
      jobId,
      buffer,
      fileName,
    );

    await this.prisma.withTenantSchema(schema, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE import_jobs SET file_storage_path = $2, file_sha256 = $3, total_rows = $4 WHERE id = $1::uuid`,
        jobId,
        storagePath,
        fileSha256,
        totalRows,
      );
    });

    const job = await this.jobs.getJob(schema, jobId);
    return { job };
  }

  @Get('history')
  async listHistory(
    @Query('importType') importType = 'product',
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const { schema } = this.ensureTenant();
    return this.jobs.listJobsEnriched(
      schema,
      importType,
      Math.min(100, Number(limit) || 50),
      Number(offset) || 0,
    );
  }

  @Get()
  async listJobs(
    @Query('importType') importType = 'product',
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    const { schema } = this.ensureTenant();
    return this.jobs.listJobs(
      schema,
      importType,
      Math.min(100, Number(limit) || 20),
      Number(offset) || 0,
    );
  }

  @Get('center/dashboard')
  @RequirePermissions('view_import_center')
  async importCenterDashboard(
    @Query('importType') importType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('createdBy') createdBy?: string,
  ) {
    const { schema } = this.ensureTenant();
    return this.jobs.getImportCenterDashboard(schema, {
      importType: importType as ImportType | undefined,
      from,
      to,
      createdBy,
    });
  }

  @Get('center/jobs')
  @RequirePermissions('view_import_center')
  async importCenterJobs(
    @Query('importType') importType?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('createdBy') createdBy?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { schema } = this.ensureTenant();
    return this.jobs.listImportCenterJobs(schema, {
      importType: importType as ImportType | undefined,
      status: status as ImportJobStatus | undefined,
      from,
      to,
      createdBy,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('center/running')
  @RequirePermissions('view_import_center')
  async importCenterRunning(@Query('limit') limit = '20') {
    const { schema } = this.ensureTenant();
    const jobs = await this.jobs.listRunningImportJobs(
      schema,
      Math.min(50, Number(limit) || 20),
    );
    const items = await Promise.all(
      jobs.map(async (job) => {
        const progress = await this.progress.get(job.id);
        const processed = progress?.processed ?? job.processedRows;
        const total = progress?.total ?? job.totalRows;
        const pct =
          total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
        const remaining = Math.max(0, total - processed);
        const startedAt = job.createdAt;
        let estimatedCompletion: string | null = null;
        if (progress && processed > 0 && total > processed) {
          const elapsedMs = Date.now() - new Date(startedAt).getTime();
          const msPerRow = elapsedMs / processed;
          const eta = new Date(Date.now() + msPerRow * remaining);
          if (Number.isFinite(eta.getTime())) {
            estimatedCompletion = eta.toISOString();
          }
        }
        return {
          job,
          progress,
          progressPercent: pct,
          rowsProcessed: processed,
          rowsRemaining: remaining,
          startedAt,
          estimatedCompletion,
        };
      }),
    );
    return { items };
  }

  @Get('center/failed')
  @RequirePermissions('view_import_center')
  async importCenterFailed(
    @Query('limit') limit = '10',
    @Query('offset') offset = '0',
  ) {
    const { schema } = this.ensureTenant();
    return this.jobs.listFailedImportJobs(
      schema,
      Math.min(50, Number(limit) || 10),
      Number(offset) || 0,
    );
  }

  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string) {
    const { schema } = this.ensureTenant();
    const job = await this.jobs.getJob(schema, jobId);
    if (!job) throw new BadRequestException('Import job not found');
    const progress = await this.progress.get(jobId);
    return { job, progress };
  }

  @Post(':jobId/validate')
  async validateJob(@Param('jobId') jobId: string, @Req() req: FastifyRequest) {
    const { schema } = this.ensureTenant();
    const { job, handler } = await this.resolveHandlerForJob(schema, jobId);
    const perm = permissionForImportType(job.importType);
    if (!userHasPermissions(req, perm)) {
      throw new BadRequestException(`Missing permission: ${perm}`);
    }
    const ctx = await this.buildImportContext(req);
    await handler.validate(ctx.schemaName, jobId, ctx);
    const updated = await this.jobs.getJob(schema, jobId);
    return { job: updated };
  }

  @Get(':jobId/preview')
  async previewJob(
    @Param('jobId') jobId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const { schema } = this.ensureTenant();
    const { handler } = await this.resolveHandlerForJob(schema, jobId);
    return handler.buildPreview(
      schema,
      jobId,
      Math.max(1, Number(page) || 1),
      Math.min(200, Number(pageSize) || 50),
    );
  }

  @Patch(':jobId/preview-rows')
  async updatePreviewRows(
    @Param('jobId') jobId: string,
    @Body() body: { rows?: Array<{ id?: unknown; rawData?: unknown }> },
    @Req() req: FastifyRequest,
  ) {
    const ctx = await this.buildImportContext(req);
    const { handler } = await this.resolveHandlerForJob(ctx.schemaName, jobId);
    const rows = this.parsePreviewRowUpdates(body?.rows);
    await this.jobs.updatePreviewRowsRawData(ctx.schemaName, jobId, rows);
    await handler.validate(ctx.schemaName, jobId, ctx);
    return handler.buildPreview(ctx.schemaName, jobId, 1, 100);
  }

  @Post(':jobId/confirm')
  async confirmJob(@Param('jobId') jobId: string, @Req() req: FastifyRequest) {
    const { schema } = this.ensureTenant();
    const job = await this.jobs.getJob(schema, jobId);
    if (!job) throw new BadRequestException('Import job not found');

    await this.jobs.confirmJob(schema, jobId, req.userId ?? null);

    await this.prisma.withTenantSchema(schema, async (tx) => {
      await this.auditLog.append(tx, {
        branchId: null,
        actorUserId: req.userId ?? null,
        tableName: 'import_jobs',
        recordId: jobId,
        action: 'confirmed',
        entityType: 'import_job',
        entityId: jobId,
        newPayload: { importType: job.importType },
      });
    });

    const updated = await this.jobs.getJob(schema, jobId);
    return { job: updated };
  }

  @Post(':jobId/confirm-and-commit')
  async confirmAndCommitJob(
    @Param('jobId') jobId: string,
    @Req() req: FastifyRequest,
  ) {
    const { schema } = this.ensureTenant();
    const job = await this.jobs.getJob(schema, jobId);
    if (!job) throw new BadRequestException('Import job not found');

    if (job.status === 'preview') {
      await this.jobs.confirmJob(schema, jobId, req.userId ?? null);
      await this.prisma.withTenantSchema(schema, async (tx) => {
        await this.auditLog.append(tx, {
          branchId: null,
          actorUserId: req.userId ?? null,
          tableName: 'import_jobs',
          recordId: jobId,
          action: 'confirmed',
          entityType: 'import_job',
          entityId: jobId,
          newPayload: { importType: job.importType },
        });
      });
    } else if (job.status !== 'confirmed' && job.status !== 'committing') {
      throw new BadRequestException(
        `Job cannot be confirmed and committed from status: ${job.status}`,
      );
    }

    const ctx = await this.buildImportContext(req);
    const committed = await this.worker.runJobCommit(schema, jobId, ctx);
    const progress = await this.progress.get(jobId);
    return { job: committed, progress };
  }

  @Post(':jobId/commit')
  async commitJob(@Param('jobId') jobId: string, @Req() req: FastifyRequest) {
    const { schema } = this.ensureTenant();
    const job = await this.jobs.getJob(schema, jobId);
    if (!job) throw new BadRequestException('Import job not found');
    if (job.status !== 'confirmed' && job.status !== 'committing') {
      throw new BadRequestException(
        `Job must be confirmed before commit (status: ${job.status})`,
      );
    }

    const ctx = await this.buildImportContext(req);
    const committed = await this.worker.runJobCommit(schema, jobId, ctx);
    const progress = await this.progress.get(jobId);
    return { job: committed, progress };
  }

  @Post(':jobId/retry')
  async retryJob(@Param('jobId') jobId: string, @Req() req: FastifyRequest) {
    const { schema } = this.ensureTenant();
    const { job, handler } = await this.resolveHandlerForJob(schema, jobId);

    if (job.status === 'failed') {
      const hasPreview = job.summary && job.summary.errorRows === 0;
      if (hasPreview) {
        await this.jobs.updateStatus(schema, jobId, 'confirmed');
      } else {
        const ctx = await this.buildImportContext(req);
        await handler.validate(schema, jobId, ctx);
      }
    } else if (job.status === 'confirmed' || job.status === 'committing') {
      await this.jobs.updateStatus(schema, jobId, 'confirmed');
    }

    const updated = await this.jobs.getJob(schema, jobId);
    return { job: updated };
  }

  @Get(':jobId/detail')
  async getJobDetail(
    @Param('jobId') jobId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('filter') filter = 'all',
  ) {
    const { schema } = this.ensureTenant();
    const job = await this.jobs.getJob(schema, jobId);
    if (!job) throw new BadRequestException('Import job not found');

    const pageNum = Math.max(1, Number(page) || 1);
    const size = Math.min(200, Number(pageSize) || 50);
    const rowFilter =
      filter === 'errors' || filter === 'committed' ? filter : 'all';

    const [
      progress,
      rowCounts,
      { rows, total },
      canDownloadErrors,
      eligibility,
      actors,
      auditEvents,
    ] = await Promise.all([
      this.progress.get(jobId),
      this.jobs.getJobRowCounts(schema, jobId),
      this.jobs.getJobRowsFiltered(schema, jobId, pageNum, size, rowFilter),
      this.jobs.hasDownloadableErrors(schema, jobId, job.summary),
      this.rollback.getReverseEligibility(schema, jobId),
      this.jobs.getJobActors(schema, jobId),
      this.jobs.getImportJobAudit(schema, jobId),
    ]);

    return {
      job,
      progress,
      rowCounts,
      rows,
      page: pageNum,
      pageSize: size,
      totalPages: Math.max(1, Math.ceil(total / size)),
      canDownloadErrors,
      canReverse: eligibility.canReverse,
      reverseBlockReason: eligibility.reason,
      ...actors,
      auditEvents,
    };
  }

  @Post(':jobId/reverse')
  async reverseJob(@Param('jobId') jobId: string, @Req() req: FastifyRequest) {
    const { schema, tenantId } = this.ensureTenant();
    const result = await this.rollback.reverseCompletedJob(
      schema,
      tenantId,
      jobId,
      req.userId ?? null,
    );
    const job = await this.jobs.getJob(schema, jobId);
    return { job, ...result };
  }

  @Get(':jobId/cleanup-preview')
  @RequirePermissions('cleanup_import_products')
  async cleanupPreview(@Param('jobId') jobId: string) {
    const { schema } = this.ensureTenant();
    return this.rollback.getProductCleanupPreview(schema, jobId);
  }

  @Post(':jobId/cleanup-products')
  @RequirePermissions('cleanup_import_products')
  async cleanupProducts(
    @Param('jobId') jobId: string,
    @Req() req: FastifyRequest,
  ) {
    const { schema } = this.ensureTenant();
    return this.rollback.cleanupImportCreatedProducts(
      schema,
      jobId,
      req.userId ?? null,
    );
  }

  @Get(':jobId/errors/export')
  async exportErrors(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { schema } = this.ensureTenant();
    const { handler } = await this.resolveHandlerForJob(schema, jobId);
    const buf = await handler.generateErrorExport(schema, jobId);
    reply.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    reply.header(
      'Content-Disposition',
      `attachment; filename="import-errors-${jobId}.xlsx"`,
    );
    return buf;
  }
}
