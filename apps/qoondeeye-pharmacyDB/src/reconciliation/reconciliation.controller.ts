import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { assertAllowedBranches } from '../common/branch-scope';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ReconciliationService } from './reconciliation.service';
import { RECONCILIATION_LOG_TYPES } from './reconciliation.types';

function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1);
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

type JwtPayload =
  | { type: 'super_admin'; role?: string }
  | { type: 'tenant_user'; role?: string; tenantSchema?: string };

@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
  ) {}

  private ensureTenant() {
    const t = this.tenantContext.getTenant();
    if (!t) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
    return t;
  }

  private ensureRunAuthorized(req: Request) {
    const jwtSecret = this.config.get<string>('JWT_SECRET') ?? 'changeme';
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['auth_token'];
    if (!token) {
      throw new ForbiddenException('Missing auth token');
    }
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as JwtPayload;
    } catch {
      throw new ForbiddenException('Invalid auth token');
    }
    if (payload.type === 'super_admin') return;
    const role = (payload.role ?? req.userRole ?? '').toLowerCase().trim();
    if (role !== 'admin' && role !== 'owner') {
      throw new ForbiddenException(
        'Running reconciliation requires admin or owner role',
      );
    }
  }

  @Post('run')
  async run(@Req() req: Request) {
    this.ensureRunAuthorized(req);
    const tenant = this.ensureTenant();
    const allowedBranchIds = assertAllowedBranches(req);
    const result = await this.reconciliationService.runFullReconciliation(
      tenant.id,
      { allowedBranchIds },
    );
    return {
      runId: result.runId,
      summary: result.summary,
    };
  }

  @Get('logs')
  async logs(
    @Req() req: Request,
    @Query('runId') runId?: string,
    @Query('severity') severity?: string,
    @Query('type') type?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    this.ensureTenant();
    const tenant = this.tenantContext.getTenant()!;
    const limit = Math.min(200, Math.max(1, Number(limitRaw ?? 50) || 50));
    const offset = Math.max(0, Number(offsetRaw ?? 0) || 0);

    const severityNorm =
      severity &&
      ['critical', 'warning', 'info'].includes(severity.toLowerCase())
        ? (severity.toLowerCase() as 'critical' | 'warning' | 'info')
        : undefined;
    const typeNorm =
      type &&
      (RECONCILIATION_LOG_TYPES as readonly string[]).includes(type.trim())
        ? type.trim()
        : undefined;

    const allowedBranchIds = req.allowedBranchIds ?? [];
    const { items, total } = await this.reconciliationService.findLogs({
      tenantId: tenant.id,
      runId: runId?.trim(),
      severity: severityNorm,
      type: typeNorm,
      limit,
      offset,
      allowedBranchIds:
        allowedBranchIds.length > 0 ? allowedBranchIds : undefined,
    });

    return {
      items: items.map((row: any) => ({
        id: row.id,
        runId: row.runId,
        type: row.type,
        entityId: row.entityId,
        entityDisplay: row.entityDisplay ?? null,
        entityCode: row.entityCode ?? null,
        severity: row.severity,
        message: row.message,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    };
  }

  @Get('runs/latest')
  async latestRun(@Req() req: Request) {
    this.ensureTenant();
    const tenant = this.tenantContext.getTenant()!;
    const run = await this.reconciliationService.findLatestCompletedRun(
      tenant.id,
    );
    if (!run) {
      return { run: null };
    }
    return {
      run: {
        id: run.id,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        status: run.status,
        summary: run.summary,
      },
    };
  }

  @Get('health-snapshots')
  async healthSnapshots(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('checkKey') checkKey?: string,
    @Query('limit') limitRaw?: string,
  ) {
    this.ensureTenant();
    const tenant = this.tenantContext.getTenant()!;
    const limit = Math.min(500, Math.max(1, Number(limitRaw ?? 100) || 100));
    const rows = await this.reconciliationService.listHealthSnapshots({
      tenantId: tenant.id,
      fromTs: from,
      toTs: to,
      checkKey,
      limit,
    });
    return {
      items: rows.map((row) => ({
        snapshotHour: new Date(row.snapshot_hour).toISOString(),
        checkKey: row.check_key,
        status: row.status,
        summary: row.summary,
        sourceRunId: row.source_run_id,
      })),
      limit,
    };
  }
}
