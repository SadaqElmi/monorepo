import {
  BadRequestException,
  Body,
  Controller,
  Get,
  ForbiddenException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  assertAllowedBranches,
  assertDtoBranchAllowed,
  resolveReportBranchScope,
  resolveSingleBranchId,
} from '../common/branch-scope';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from './journal.service';
import { CreateManualJournalDto } from './dto/create-manual-journal.dto';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { SupplierPaymentsService } from './supplier-payments.service';
import { CustomerPaymentsService } from './customer-payments.service';
import { JournalBooksSeedService } from './journal-books-seed.service';
import { FinancialReportsService } from './financial-reports.service';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { CreateFollowUpLevelDto } from './dto/create-follow-up-level.dto';
import { MergeChartOfAccountsDto } from './dto/merge-chart-of-accounts.dto';
import { ChartOfAccountsMergeService } from './chart-of-accounts-merge.service';
import { BranchSecurityMetricsService } from './branch-security-metrics.service';
import { isGlobalBranchRole } from '../common/branch-scope/branch-scope.util';
import {
  parsePagedQueryParam,
  toPagedResult,
} from '../common/pagination.util';

interface ChartOfAccountsListRow {
  id: string;
  branch_id: string;
  code: string | null;
  name: string;
  account_type: string;
  account_key: string | null;
  is_system: boolean;
  payment_method_key: string | null;
  parent_id: string | null;
  created_at: Date;
}

interface JournalEntryRow {
  id: string;
  branch_id: string;
  entry_date: Date;
  description: string | null;
  source_type: string | null;
  source_id: string | null;
  journal_book_id: string | null;
  created_at: Date;
}

interface JournalLineListRow {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number | string | null;
  credit: number | string | null;
  partner_kind: string | null;
  partner_id: string | null;
  account_name: string;
  account_key: string | null;
}

interface PaymentTermRow {
  id: string;
  branch_id: string;
  name: string;
  days_until_due: number;
  created_at: Date;
}

interface FollowUpLevelRow {
  id: string;
  branch_id: string;
  name: string;
  days_after_due: number;
  created_at: Date;
}

@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly supplierPayments: SupplierPaymentsService,
    private readonly customerPayments: CustomerPaymentsService,
    private readonly journalBooks: JournalBooksSeedService,
    private readonly financialReports: FinancialReportsService,
    private readonly chartOfAccountsMerge: ChartOfAccountsMergeService,
    private readonly branchSecurityMetrics: BranchSecurityMetricsService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  private branchOrThrow(req: FastifyRequest, branchId?: string): string {
    return resolveSingleBranchId(req, branchId);
  }

  private scopeHash(branchIds: string[]): string {
    const sorted = [...new Set(branchIds.filter(Boolean))].sort();
    const key = sorted.join(',');
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  @Get('supplier-payments')
  async listSupplierPayments(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const b = this.branchOrThrow(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const lim = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    return this.supplierPayments.findRecent(schema, b, lim);
  }

  @Post('supplier-payments')
  async createSupplierPayment(
    @Req() req: FastifyRequest,
    @Body() dto: CreateSupplierPaymentDto,
  ) {
    this.ensureTenant();
    assertDtoBranchAllowed(req, dto.branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.supplierPayments.create(schema, dto.branchId, dto, {
      actorUserId: req.userId,
    });
  }

  @Get('customer-payments')
  async listCustomerPayments(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const b = this.branchOrThrow(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const lim = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    return this.customerPayments.findRecent(schema, b, lim);
  }

  @Post('customer-payments')
  async createCustomerPayment(
    @Req() req: FastifyRequest,
    @Body() dto: CreateCustomerPaymentDto,
  ) {
    this.ensureTenant();
    assertDtoBranchAllowed(req, dto.branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.customerPayments.create(schema, dto.branchId, dto, {
      actorUserId: req.userId,
    });
  }

  @Get('journal-books')
  async listJournalBooks(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
  ) {
    this.ensureTenant();
    const b = this.branchOrThrow(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      await this.journalBooks.ensureBooksForBranch(tx, b);
      return this.journalBooks.listBooks(tx, b);
    });
  }

  @Get('journal-lines')
  async journalLines(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('accountKey') accountKey?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
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
    const branches = scope.branchIds;
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const take = Math.min(
      2000,
      Math.max(1, parseInt(limit ?? '500', 10) || 500),
    );
    const fromD = from?.trim() || '1970-01-01';
    const toD = to?.trim() || '2099-12-31';
    return this.prisma.withTenantSchema(schema, async (tx) => {
      return tx.$queryRawUnsafe<
        {
          line_id: string;
          journal_entry_id: string;
          entry_date: string;
          description: string | null;
          source_type: string;
          source_id: string | null;
          account_id: string;
          account_key: string | null;
          account_name: string | null;
          debit: string;
          credit: string;
          partner_kind: string | null;
          partner_id: string | null;
        }[]
      >(
        `SELECT jl.id AS line_id,
                je.id AS journal_entry_id,
                je.entry_date::text AS entry_date,
                je.description,
                je.source_type,
                je.source_id::text,
                jl.account_id::text,
                coa.account_key,
                coa.name AS account_name,
                jl.debit::text,
                jl.credit::text,
                jl.partner_kind,
                jl.partner_id::text
         FROM journal_lines jl
         INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE je.branch_id = ANY($1::uuid[])
           AND je.entry_date >= $2::date
           AND je.entry_date <= $3::date
           AND ($4::varchar IS NULL OR coa.account_key = $4::varchar)
         ORDER BY je.entry_date DESC, je.created_at DESC, jl.id
         LIMIT $5`,
        branches,
        fromD,
        toD,
        accountKey?.trim() || null,
        take,
      );
    });
  }

  @Get('journal-audit')
  async journalAudit(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('asOf') asOf?: string,
  ) {
    this.ensureTenant();
    const b = this.branchOrThrow(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const dateStr = asOf?.trim() || new Date().toISOString().slice(0, 10);
    return this.financialReports.journalAudit(schema, [b], dateStr);
  }

  @Get('audit-trail')
  async auditTrail(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    this.ensureTenant();
    assertAllowedBranches(req);
    const target = resolveSingleBranchId(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);

    const paged = parsePagedQueryParam(page, limit, {
      defaultLimit: 50,
      maxLimit: 500,
    });
    if (paged) {
      return this.prisma.withTenantSchema(schema, async (tx) => {
        const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
          `SELECT COUNT(*)::bigint AS c
           FROM audit_logs
           WHERE branch_id IS NULL OR branch_id = $1::uuid`,
          target,
        );
        const total = Number(countRow?.c ?? 0);
        const rows = (await tx.$queryRawUnsafe(
          `SELECT id, branch_id::text, actor_user_id::text, table_name, record_id::text,
                  action, old_payload, new_payload, created_at
           FROM audit_logs
           WHERE branch_id IS NULL OR branch_id = $1::uuid
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          target,
          paged.limit,
          paged.skip,
        )) as unknown[];
        return toPagedResult(rows, total, paged.page, paged.limit);
      });
    }

    const take = Math.min(
      500,
      Math.max(1, parseInt(limit ?? '100', 10) || 100),
    );
    return this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT id, branch_id::text, actor_user_id::text, table_name, record_id::text,
                action, old_payload, new_payload, created_at
         FROM audit_logs
         WHERE branch_id IS NULL OR branch_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT $2`,
        target,
        take,
      ),
    );
  }

  @Get('close-readiness')
  async closeReadiness(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('branchIds') branchIds?: string,
    @Query('aggregateAll') aggregateAll?: string,
    @Query('asOf') asOf?: string,
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
    const asOfDate = asOf?.trim() || new Date().toISOString().slice(0, 10);
    const payload = await this.financialReports.getCloseReadiness(
      schema,
      scope.branchIds,
      asOfDate,
    );
    return { ...payload, scopeMeta: scope };
  }

  @Post('period/approve')
  async approvePeriod(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      asOf?: string;
      branchId?: string;
      branchIds?: string;
      aggregateAll?: boolean;
    },
  ) {
    this.ensureTenant();
    const scope = resolveReportBranchScope(req, {
      branchId: body.branchId,
      branchIds: body.branchIds,
      aggregateAll: Boolean(body.aggregateAll),
    });
    const asOfDate = body.asOf?.trim() || new Date().toISOString().slice(0, 10);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const workflow = await this.financialReports.approveAccountingPeriod(
      schema,
      scope.branchIds,
      asOfDate,
      req.userId ?? null,
      this.scopeHash(scope.branchIds),
    );
    return { workflow, scopeMeta: scope };
  }

  @Post('period/reopen')
  async reopenPeriod(
    @Req() req: FastifyRequest,
    @Body()
    body: {
      asOf?: string;
      branchId?: string;
      branchIds?: string;
      aggregateAll?: boolean;
    },
  ) {
    this.ensureTenant();
    const scope = resolveReportBranchScope(req, {
      branchId: body.branchId,
      branchIds: body.branchIds,
      aggregateAll: Boolean(body.aggregateAll),
    });
    const asOfDate = body.asOf?.trim() || new Date().toISOString().slice(0, 10);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const workflow = await this.financialReports.reopenAccountingPeriod(
      schema,
      scope.branchIds,
      asOfDate,
      req.userId ?? null,
      this.scopeHash(scope.branchIds),
    );
    return { workflow, scopeMeta: scope };
  }

  @Get('chart-of-accounts')
  async chartOfAccounts(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
  ) {
    this.ensureTenant();
    const target = resolveSingleBranchId(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<ChartOfAccountsListRow[]>(
        `SELECT id, branch_id, code, name, account_type, account_key, is_system, payment_method_key, parent_id, created_at
         FROM chart_of_accounts
         WHERE branch_id = $1::uuid
         ORDER BY code NULLS LAST, name`,
        target,
      ),
    );
  }

  @Get('journal-entries/:id')
  async journalEntryById(@Req() req: FastifyRequest, @Param('id') id: string) {
    this.ensureTenant();
    const allowed = assertAllowedBranches(req);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [entry] = await tx.$queryRawUnsafe<JournalEntryRow[]>(
        `SELECT id, branch_id, entry_date, description, source_type, source_id,
                journal_book_id, created_at
         FROM journal_entries
         WHERE id = $1::uuid`,
        id,
      );
      if (!entry || !allowed.includes(entry.branch_id)) {
        throw new ForbiddenException('Journal not found');
      }
      const lines = await tx.$queryRawUnsafe<JournalLineListRow[]>(
        `SELECT jl.id, jl.journal_entry_id, jl.account_id, jl.debit, jl.credit,
                jl.partner_kind, jl.partner_id,
                coa.name AS account_name, coa.account_key
         FROM journal_lines jl
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE jl.journal_entry_id = $1::uuid`,
        id,
      );
      return { ...entry, lines };
    });
  }

  @Get('journal-entries')
  async journalEntries(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
    @Query('sourceType') sourceType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.ensureTenant();
    const target = resolveSingleBranchId(req, branchId);
    const take = Math.min(
      500,
      Math.max(1, parseInt(limit ?? '100', 10) || 100),
    );
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const st = sourceType?.trim();
      const fromD = from?.trim();
      const toD = to?.trim();
      const conditions: string[] = ['branch_id = $1::uuid'];
      const params: unknown[] = [target];
      let p = 2;
      if (st) {
        conditions.push(`source_type = $${p}::varchar`);
        params.push(st);
        p++;
      }
      if (fromD) {
        conditions.push(`entry_date >= $${p}::date`);
        params.push(fromD);
        p++;
      }
      if (toD) {
        conditions.push(`entry_date <= $${p}::date`);
        params.push(toD);
        p++;
      }
      params.push(take);
      const whereSql = conditions.join(' AND ');
      const entries = await tx.$queryRawUnsafe<JournalEntryRow[]>(
        `SELECT id, branch_id, entry_date, description, source_type, source_id,
                journal_book_id, created_at
         FROM journal_entries
         WHERE ${whereSql}
         ORDER BY entry_date DESC, created_at DESC
         LIMIT $${p}`,
        ...params,
      );
      if (!entries.length) return [];
      const ids = entries.map((e) => e.id);
      const lines = await tx.$queryRawUnsafe<JournalLineListRow[]>(
        `SELECT jl.id, jl.journal_entry_id, jl.account_id, jl.debit, jl.credit,
                jl.partner_kind, jl.partner_id,
                coa.name AS account_name, coa.account_key
         FROM journal_lines jl
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE jl.journal_entry_id = ANY($1::uuid[])`,
        ids,
      );
      const byJe = new Map<string, JournalLineListRow[]>();
      for (const ln of lines) {
        const list = byJe.get(ln.journal_entry_id) ?? [];
        list.push(ln);
        byJe.set(ln.journal_entry_id, list);
      }
      return entries.map((e) => ({
        ...e,
        lines: byJe.get(e.id) ?? [],
      }));
    });
  }

  /**
   * Admin/owner: merge two COA rows in the same branch with the same `account_key`
   * (legacy duplicates). See ChartOfAccountsMergeService for eligibility SQL.
   */
  @Post('chart-of-accounts/merge')
  async mergeChartOfAccounts(
    @Req() req: FastifyRequest,
    @Body() dto: MergeChartOfAccountsDto,
  ) {
    this.ensureTenant();
    if (!isGlobalBranchRole(req)) {
      throw new ForbiddenException(
        'Chart of accounts merge requires admin or owner',
      );
    }
    assertDtoBranchAllowed(req, dto.branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.chartOfAccountsMerge.mergeDuplicatedAccounts(
      schema,
      dto.branchId,
      dto.sourceAccountId,
      dto.targetAccountId,
    );
  }

  @Post('journal-entries')
  async createManualJournal(
    @Req() req: FastifyRequest,
    @Body() dto: CreateManualJournalDto,
  ) {
    this.ensureTenant();
    assertDtoBranchAllowed(req, dto.branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const accountIds = dto.lines.map((l) => l.accountId);
      const uniqueIds = [...new Set(accountIds)];
      const found = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM chart_of_accounts
         WHERE branch_id = $1::uuid AND id = ANY($2::uuid[])`,
        dto.branchId,
        uniqueIds,
      );
      if (found.length !== uniqueIds.length) {
        throw new BadRequestException(
          'Every line must reference an account in this branch',
        );
      }
      const lines = dto.lines.map((ln) => ({
        accountId: ln.accountId,
        debit: ln.debit,
        credit: ln.credit,
      }));
      const result = await this.journalService.createBalancedEntry(tx, {
        branchId: dto.branchId,
        entryDate: dto.entryDate,
        description: dto.description ?? 'Manual journal',
        sourceType: 'manual',
        sourceId: null,
        lines,
      });
      if (!result) {
        throw new BadRequestException('Could not create journal entry');
      }
      const [entry] = await tx.$queryRawUnsafe<JournalEntryRow[]>(
        `SELECT id, branch_id, entry_date, description, source_type, source_id,
                journal_book_id, created_at
         FROM journal_entries WHERE id = $1::uuid`,
        result.id,
      );
      const jl = await tx.$queryRawUnsafe<JournalLineListRow[]>(
        `SELECT jl.id, jl.journal_entry_id, jl.account_id, jl.debit, jl.credit,
                jl.partner_kind, jl.partner_id,
                coa.name AS account_name, coa.account_key
         FROM journal_lines jl
         INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
         WHERE jl.journal_entry_id = $1::uuid`,
        result.id,
      );
      return { ...entry, lines: jl };
    });
  }

  @Get('payment-terms')
  async listPaymentTerms(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
  ) {
    this.ensureTenant();
    const b = this.branchOrThrow(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<PaymentTermRow[]>(
        `SELECT id, branch_id, name, days_until_due, created_at
         FROM payment_terms
         WHERE branch_id = $1::uuid
         ORDER BY name`,
        b,
      ),
    );
  }

  @Post('payment-terms')
  async createPaymentTerm(
    @Req() req: FastifyRequest,
    @Body() dto: CreatePaymentTermDto,
  ) {
    this.ensureTenant();
    assertDtoBranchAllowed(req, dto.branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<PaymentTermRow[]>(
        `INSERT INTO payment_terms (branch_id, name, days_until_due)
         VALUES ($1::uuid, $2, COALESCE($3, 0))
         RETURNING id, branch_id, name, days_until_due, created_at`,
        dto.branchId,
        dto.name.trim(),
        dto.daysUntilDue ?? 0,
      );
      return row;
    });
  }

  @Get('follow-up-levels')
  async listFollowUpLevels(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
  ) {
    this.ensureTenant();
    const b = this.branchOrThrow(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<FollowUpLevelRow[]>(
        `SELECT id, branch_id, name, days_after_due, created_at
         FROM follow_up_levels
         WHERE branch_id = $1::uuid
         ORDER BY days_after_due, name`,
        b,
      ),
    );
  }

  @Post('follow-up-levels')
  async createFollowUpLevel(
    @Req() req: FastifyRequest,
    @Body() dto: CreateFollowUpLevelDto,
  ) {
    this.ensureTenant();
    assertDtoBranchAllowed(req, dto.branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<FollowUpLevelRow[]>(
        `INSERT INTO follow_up_levels (branch_id, name, days_after_due)
         VALUES ($1::uuid, $2, COALESCE($3, 0))
         RETURNING id, branch_id, name, days_after_due, created_at`,
        dto.branchId,
        dto.name.trim(),
        dto.daysAfterDue ?? 0,
      );
      return row;
    });
  }

  @Get('configuration/summary')
  async configurationSummary(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
  ) {
    this.ensureTenant();
    const b = this.branchOrThrow(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      await this.journalBooks.ensureBooksForBranch(tx, b);
      const [coa] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM chart_of_accounts WHERE branch_id = $1::uuid`,
        b,
      );
      const [pt] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM payment_terms WHERE branch_id = $1::uuid`,
        b,
      );
      const [fu] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM follow_up_levels WHERE branch_id = $1::uuid`,
        b,
      );
      const [prov] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM online_payment_providers WHERE branch_id = $1::uuid`,
        b,
      );
      const [pm] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM payment_methods_catalog WHERE branch_id = $1::uuid`,
        b,
      );
      const books = await this.journalBooks.listBooks(tx, b);
      return {
        chartOfAccountsCount: Number(coa?.c ?? 0),
        paymentTermsCount: Number(pt?.c ?? 0),
        followUpLevelsCount: Number(fu?.c ?? 0),
        onlinePaymentProvidersCount: Number(prov?.c ?? 0),
        paymentMethodsCatalogCount: Number(pm?.c ?? 0),
        journalBooks: books,
      };
    });
  }

  @Get('security/branch-access-metrics')
  async branchAccessMetrics(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.ensureTenant();
    const allowed = assertAllowedBranches(req);
    const target = branchId?.trim();
    if (target && target !== 'all' && !allowed.includes(target)) {
      throw new ForbiddenException('Access denied to this branch');
    }
    const queryBranchIds =
      !target || target === 'all'
        ? allowed
        : allowed.includes(target)
          ? [target]
          : [];
    const fromDate = from?.trim() || '1970-01-01';
    const toDate = to?.trim() || '2099-12-31';

    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.branchSecurityMetrics.getBranchAccessMetrics({
      schemaName: schema,
      queryBranchIds,
      fromDate,
      toDate,
      branchScopeLabel: target && target !== 'all' ? target : 'allowed',
    });
  }
}
