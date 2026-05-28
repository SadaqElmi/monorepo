import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { FinancialReportsService } from '../accounting/financial-reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TransferRepairConfirmDto } from './dto/transfer-repair-confirm.dto';
import { TransfersService } from './transfers.service';
import { getAuthTokenFromHeaders } from '../common/security/auth-token.util';

type JwtPayload =
  | { type: 'super_admin'; role?: string; sub?: string }
  | {
      type: 'tenant_user';
      role?: string;
      sub?: string;
      tenantSchema?: string;
    };

@Controller('transfers')
export class TransferRepairController {
  constructor(
    private readonly transfersService: TransfersService,
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly financialReports: FinancialReportsService,
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

  private ensureRepairAuthorized(req: FastifyRequest) {
    const upstreamRole = (req.userRole ?? '').toLowerCase().trim();
    if (upstreamRole === 'super_admin' || upstreamRole === 'admin' || upstreamRole === 'owner') {
      return;
    }

    const jwtSecret = this.config.get<string>('JWT_SECRET') ?? 'changeme';
    const token = getAuthTokenFromHeaders(req.headers);
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
    const role = (payload.role ?? '').toLowerCase().trim();
    if (role !== 'admin' && role !== 'owner') {
      throw new ForbiddenException(
        'Transfer repair requires admin, owner, or super_admin',
      );
    }
  }

  private async allBranchIds(schema: string): Promise<string[]> {
    const rows = await this.prisma.withTenantSchema(schema, async (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text AS id FROM branches ORDER BY name`,
      ),
    );
    return (rows ?? []).map((r) => r.id);
  }

  private eventContext(req: FastifyRequest) {
    const pick = (v: string | string[] | undefined | null): string | null => {
      if (typeof v === 'string' && v.trim()) return v.trim();
      return null;
    };
    return {
      idempotencyKey: pick(
        req.idempotencyKey ?? req.headers['x-idempotency-key'],
      ),
      correlationId: pick(req.correlationId ?? req.headers['x-correlation-id']),
      causationId: pick(req.causationId ?? req.headers['x-causation-id']),
    };
  }

  private actor(req: FastifyRequest) {
    const jwtSecret = this.config.get<string>('JWT_SECRET') ?? 'changeme';
    const token = getAuthTokenFromHeaders(req.headers);
    let userId: string | null = null;
    let userRole: string | null = null;
    if (token) {
      try {
        const payload = jwt.verify(token, jwtSecret) as JwtPayload;
        userId = (payload as { sub?: string }).sub ?? null;
        userRole =
          payload.type === 'super_admin'
            ? 'super_admin'
            : (payload.role ?? null);
      } catch {
        /* handled by ensureRepairAuthorized */
      }
    }
    return { userId, userRole };
  }

  @Post(':id/repair/journal-links')
  async repairJournalLinks(
    @Param('id') id: string,
    @Body() body: TransferRepairConfirmDto,
    @Req() req: FastifyRequest,
  ) {
    this.ensureRepairAuthorized(req);
    const tenant = this.ensureTenant();
    const schema = tenant.schemaName;
    const allowedBranchIds = await this.allBranchIds(schema);
    return this.transfersService.repairTransferJournalLinks(
      schema,
      id,
      body,
      allowedBranchIds,
      this.actor(req),
      this.eventContext(req),
    );
  }

  @Post(':id/repair/approval-from-replay')
  async repairApprovalFromReplay(
    @Param('id') id: string,
    @Body() body: TransferRepairConfirmDto,
    @Req() req: FastifyRequest,
  ) {
    this.ensureRepairAuthorized(req);
    const tenant = this.ensureTenant();
    const schema = tenant.schemaName;
    const allowedBranchIds = await this.allBranchIds(schema);
    return this.transfersService.repairTransferApprovalFromReplay(
      schema,
      id,
      body,
      allowedBranchIds,
      this.actor(req),
      this.eventContext(req),
    );
  }

  @Post(':id/repair/recreate-missing-journals')
  async recreateMissingJournals(
    @Param('id') id: string,
    @Body() body: TransferRepairConfirmDto,
    @Req() req: FastifyRequest,
  ) {
    this.ensureRepairAuthorized(req);
    const tenant = this.ensureTenant();
    const schema = tenant.schemaName;
    const allowedBranchIds = await this.allBranchIds(schema);
    return this.transfersService.recreateMissingTransferJournals(
      schema,
      id,
      body,
      allowedBranchIds,
      this.actor(req),
      this.eventContext(req),
    );
  }

  @Post('repairs/auto-fix')
  async autoFix(@Req() req: FastifyRequest) {
    this.ensureRepairAuthorized(req);
    const tenant = this.ensureTenant();
    const schema = tenant.schemaName;
    const allowedBranchIds = await this.allBranchIds(schema);
    const enabled = ['1', 'true', 'yes', 'on'].includes(
      (process.env.AUTO_REPAIR_ENABLED ?? '').trim().toLowerCase(),
    );
    const actor = this.actor(req);
    const eventContext = this.eventContext(req);
    const mismatchRows = await this.financialReports.listInterbranchMismatches(
      schema,
      allowedBranchIds,
    );

    const actions: Array<Record<string, unknown>> = [];
    for (const row of mismatchRows.slice(0, 20)) {
      if (row.fixSuggestionCode === 'repair_transfer_journal') {
        if (!enabled) {
          actions.push({
            issue: row.reasonCode,
            transferId: row.transferId,
            suggested_fix: 'repair_transfer_journal',
            applied: false,
          });
          continue;
        }
        const result = await this.transfersService.repairTransferJournalLinks(
          schema,
          row.transferId,
          { confirm: true },
          allowedBranchIds,
          actor,
          eventContext,
        );
        actions.push({
          issue: row.reasonCode,
          transferId: row.transferId,
          suggested_fix: 'repair_transfer_journal',
          applied: true,
          result,
        });
      } else if (row.fixSuggestionCode === 'complete_receive') {
        actions.push({
          issue: row.reasonCode,
          transferId: row.transferId,
          suggested_fix: 'complete_receive',
          applied: false,
        });
      }
    }

    const readiness = await this.financialReports.getCloseReadiness(
      schema,
      allowedBranchIds,
      new Date().toISOString().slice(0, 10),
    );

    return {
      issue: 'interbranch_and_transfer_health',
      suggested_fix: enabled
        ? 'applied_safe_repair_actions'
        : 'set_AUTO_REPAIR_ENABLED=true_to_apply',
      applied: enabled,
      readinessStatus: readiness.status,
      actions,
    };
  }
}
