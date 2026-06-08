import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { resolveReportBranchScope } from '../common/branch-scope';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditLogService } from './audit-log.service';

@Controller('audit')
@UseGuards(PermissionGuard)
export class AuditController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly auditLog: AuditLogService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  @Get('verify')
  @RequirePermissions('view_audit_logs')
  async verify(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('from') fromTs?: string,
    @Query('to') toTs?: string,
    @Query('limit') limitRaw?: string,
  ) {
    this.ensureTenant();
    const scope = resolveReportBranchScope(req, {
      branchId,
      branchIds,
      aggregateAll:
        aggregateAll === 'true' ||
        aggregateAll === '1' ||
        aggregateAll === 'yes',
    });
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const limit = Math.min(
      50000,
      Math.max(1, parseInt(limitRaw ?? '20000', 10) || 20000),
    );
    const result = await this.auditLog.verifyChainInSchema({
      schemaName: schema,
      branchIds: scope.branchIds,
      fromTs,
      toTs,
      limit,
    });
    return { ...result, scopeMeta: scope };
  }

  @Get('export')
  @RequirePermissions('export_audit_package')
  async export(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('from') fromTs?: string,
    @Query('to') toTs?: string,
  ) {
    this.ensureTenant();
    const scope = resolveReportBranchScope(req, {
      branchId,
      branchIds,
      aggregateAll:
        aggregateAll === 'true' ||
        aggregateAll === '1' ||
        aggregateAll === 'yes',
    });
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const escapeCsv = (v: unknown): string => {
      let s: string;
      if (v === null || v === undefined) {
        s = '';
      } else if (typeof v === 'string') {
        s = v;
      } else if (
        typeof v === 'number' ||
        typeof v === 'boolean' ||
        typeof v === 'bigint'
      ) {
        s = String(v);
      } else if (v instanceof Date) {
        s = v.toISOString();
      } else {
        s = JSON.stringify(v);
      }
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      'id,eventTs,entityType,entityId,action,branchId,userId,prevHash,auditHash,beforeJson,afterJson',
    ];
    const rows = await this.auditLog.listChainRowsInSchema({
      schemaName: schema,
      branchIds: scope.branchIds,
      fromTs,
      toTs,
      limit: 50000,
    });
    if (!rows.length) {
      lines.push(
        ['', '', '', '', '', '', '', '', '', '', ''].map(escapeCsv).join(','),
      );
    } else {
      for (const row of rows) {
        lines.push(
          [
            row.id,
            row.eventTs,
            row.entityType,
            row.entityId,
            row.action,
            row.branchId ?? '',
            row.userId ?? '',
            row.prevHash ?? '',
            row.auditHash ?? '',
            JSON.stringify(row.beforeJson ?? {}),
            JSON.stringify(row.afterJson ?? {}),
          ]
            .map(escapeCsv)
            .join(','),
        );
      }
    }
    const csv = `${lines.join('\n')}\n`;
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      `attachment; filename="audit-chain-export-${Date.now()}.csv"`,
    );
    return res.status(200).send(csv);
  }
}
