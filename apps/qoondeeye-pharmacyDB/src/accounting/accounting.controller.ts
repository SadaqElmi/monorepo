import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  ForbiddenException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
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
import { UpdateChartOfAccountReconciliationDto } from './dto/update-chart-of-account-reconciliation.dto';
import { CreateChartOfAccountDto } from './dto/create-chart-of-account.dto';
import { UpdateChartOfAccountDto } from './dto/update-chart-of-account.dto';
import { ChartOfAccountsMergeService } from './chart-of-accounts-merge.service';
import { BranchSecurityMetricsService } from './branch-security-metrics.service';
import { AuditLogService } from './audit-log.service';
import { isGlobalBranchRole } from '../common/branch-scope/branch-scope.util';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
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
  allow_reconciliation: boolean;
  payment_method_key: string | null;
  parent_id: string | null;
  created_at: Date;
}

interface ChartOfAccountCrudRecord {
  id: string;
  branch_id: string;
  code: string | null;
  name: string;
  account_type: string;
  account_key: string | null;
  parent_id: string | null;
  active: boolean;
  allow_reconciliation: boolean;
  description: string | null;
  is_system: boolean;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

type ChartOfAccountCrudResponse = Omit<
  ChartOfAccountCrudRecord,
  'branch_id' | 'is_system'
>;

const CHART_OF_ACCOUNT_TYPE_CODES = new Set([
  'asset_cash',
  'asset_current',
  'asset_receivable',
  'asset_fixed',
  'liability_current',
  'liability_payable',
  'equity',
  'income',
  'expense',
  'cost_of_goods_sold',
  'asset',
  'liability',
  'section',
]);

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
    private readonly auditLog: AuditLogService,
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

  private canManageSystemAccounts(req: FastifyRequest): boolean {
    const role = req.userRole?.trim().toLowerCase() ?? '';
    return role === 'admin' || role === 'owner' || role === 'super_admin';
  }

  private accountCrudSelectSql(): string {
    return `id::text AS id,
            branch_id::text AS branch_id,
            code,
            name,
            account_type,
            account_key,
            parent_id::text AS parent_id,
            COALESCE(active, TRUE) AS active,
            COALESCE(allow_reconciliation, FALSE) AS allow_reconciliation,
            description,
            COALESCE(is_system, FALSE) AS is_system,
            created_at,
            updated_at`;
  }

  private accountCrudResponse(
    row: ChartOfAccountCrudRecord,
  ): ChartOfAccountCrudResponse {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      account_type: row.account_type,
      account_key: row.account_key,
      parent_id: row.parent_id,
      active: row.active,
      allow_reconciliation: row.allow_reconciliation,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private resolveAliasedString(
    camelValue: string | null | undefined,
    snakeValue: string | null | undefined,
    fieldName: string,
  ): string | null | undefined {
    if (
      camelValue !== undefined &&
      camelValue !== null &&
      snakeValue !== undefined &&
      snakeValue !== null &&
      camelValue.trim() !== snakeValue.trim()
    ) {
      throw new BadRequestException(
        `${fieldName} and ${fieldName.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)} must match`,
      );
    }
    return camelValue ?? snakeValue ?? undefined;
  }

  private normalizeNullableString(
    value: string | null | undefined,
  ): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeAccountType(
    value: string | null | undefined,
  ): string | undefined {
    if (value === undefined || value === null) return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (!CHART_OF_ACCOUNT_TYPE_CODES.has(normalized)) {
      throw new BadRequestException(`Unsupported account type: ${normalized}`);
    }
    return normalized;
  }

  private requireAccountValue(
    value: string | null | undefined,
    label: string,
  ): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required`);
    }
    return trimmed;
  }

  private async countAccountJournalLines(
    tx: {
      $queryRawUnsafe<T = unknown>(
        query: string,
        ...values: unknown[]
      ): Promise<T>;
    },
    accountId: string,
  ): Promise<number> {
    const [usage] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*)::bigint AS c
       FROM journal_lines
       WHERE account_id = $1::uuid`,
      accountId,
    );
    return Number(usage?.c ?? 0);
  }

  private async countAccountChildren(
    tx: {
      $queryRawUnsafe<T = unknown>(
        query: string,
        ...values: unknown[]
      ): Promise<T>;
    },
    accountId: string,
  ): Promise<number> {
    const [children] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*)::bigint AS c
       FROM chart_of_accounts
       WHERE parent_id = $1::uuid`,
      accountId,
    );
    return Number(children?.c ?? 0);
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
  @UseGuards(PermissionGuard)
  @RequirePermissions('close_period')
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
  @UseGuards(PermissionGuard)
  @RequirePermissions('reopen_period')
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
        `SELECT id, branch_id, code, name, account_type, account_key, is_system, allow_reconciliation, payment_method_key, parent_id, created_at
         FROM chart_of_accounts
         WHERE branch_id = $1::uuid
         ORDER BY code NULLS LAST, name`,
        target,
      ),
    );
  }

  @Get('reconciliation/accounts')
  async reconciliationAccounts(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
  ) {
    this.ensureTenant();
    const target = resolveSingleBranchId(req, branchId);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<ChartOfAccountsListRow[]>(
        `SELECT id, branch_id, code, name, account_type, account_key, is_system, allow_reconciliation, payment_method_key, parent_id, created_at
         FROM chart_of_accounts
         WHERE branch_id = $1::uuid
           AND allow_reconciliation = TRUE
           AND COALESCE(active, TRUE) = TRUE
         ORDER BY code NULLS LAST, name`,
        target,
      ),
    );
  }

  @Get('accounts')
  async listAccounts(
    @Req() req: FastifyRequest,
    @Query('branchId') branchId?: string,
  ): Promise<ChartOfAccountCrudResponse[]> {
    this.ensureTenant();
    const branchIds = branchId?.trim()
      ? [resolveSingleBranchId(req, branchId)]
      : assertAllowedBranches(req);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const rows = await tx.$queryRawUnsafe<ChartOfAccountCrudRecord[]>(
        `SELECT ${this.accountCrudSelectSql()}
         FROM chart_of_accounts
         WHERE branch_id = ANY($1::uuid[])
         ORDER BY code NULLS LAST, name`,
        branchIds,
      );
      return rows.map((row) => this.accountCrudResponse(row));
    });
  }

  @Get('accounts/:id')
  async getAccount(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ChartOfAccountCrudResponse> {
    this.ensureTenant();
    const allowed = assertAllowedBranches(req);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [account] = await tx.$queryRawUnsafe<ChartOfAccountCrudRecord[]>(
        `SELECT ${this.accountCrudSelectSql()}
         FROM chart_of_accounts
         WHERE id = $1::uuid
           AND branch_id = ANY($2::uuid[])`,
        id,
        allowed,
      );
      if (!account) {
        throw new ForbiddenException('Account not found');
      }
      return this.accountCrudResponse(account);
    });
  }

  @Post('accounts')
  @UseGuards(PermissionGuard)
  @RequirePermissions('manage_accounting_configuration')
  async createAccount(
    @Req() req: FastifyRequest,
    @Body() dto: CreateChartOfAccountDto,
  ): Promise<ChartOfAccountCrudResponse> {
    this.ensureTenant();
    const allowed = assertAllowedBranches(req);
    const requestedBranchId = dto.branchId?.trim() || req.branchId;
    if (
      !requestedBranchId ||
      requestedBranchId.toLowerCase() === 'all' ||
      !allowed.includes(requestedBranchId)
    ) {
      throw new BadRequestException(
        'Select a single branch before creating an account',
      );
    }

    const name = this.requireAccountValue(dto.name, 'Account name');
    const accountType = this.normalizeAccountType(
      this.resolveAliasedString(
        dto.accountType,
        dto.account_type,
        'accountType',
      ),
    );
    if (!accountType) {
      throw new BadRequestException('Account type is required');
    }
    const accountKey = this.requireAccountValue(
      this.resolveAliasedString(dto.accountKey, dto.account_key, 'accountKey'),
      'Account key',
    );
    const code = this.normalizeNullableString(dto.code);
    const description = this.normalizeNullableString(dto.description);
    const active = dto.active ?? true;

    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [duplicate] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text AS id
         FROM chart_of_accounts
         WHERE branch_id = $1::uuid
           AND account_key = $2
         LIMIT 1`,
        requestedBranchId,
        accountKey,
      );
      if (duplicate) {
        throw new BadRequestException('Account key already exists');
      }

      const [created] = await tx.$queryRawUnsafe<ChartOfAccountCrudRecord[]>(
        `INSERT INTO chart_of_accounts (
           branch_id, code, name, account_type, account_key, active, description, is_system
         )
         VALUES ($1::uuid, $2, $3, $4, $5, $6::boolean, $7, FALSE)
         RETURNING ${this.accountCrudSelectSql()}`,
        requestedBranchId,
        code,
        name,
        accountType,
        accountKey,
        active,
        description,
      );
      const response = this.accountCrudResponse(created);
      await this.auditLog.append(tx, {
        branchId: created.branch_id,
        actorUserId: req.userId ?? null,
        tableName: 'chart_of_accounts',
        recordId: created.id,
        entityType: 'chart_of_accounts',
        entityId: created.id,
        action: 'create',
        oldPayload: null,
        newPayload: response,
      });
      return response;
    });
  }

  @Patch('accounts/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('manage_accounting_configuration')
  async updateAccount(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateChartOfAccountDto,
  ): Promise<ChartOfAccountCrudResponse> {
    this.ensureTenant();
    const allowed = assertAllowedBranches(req);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [account] = await tx.$queryRawUnsafe<ChartOfAccountCrudRecord[]>(
        `SELECT ${this.accountCrudSelectSql()}
         FROM chart_of_accounts
         WHERE id = $1::uuid`,
        id,
      );
      if (!account || !allowed.includes(account.branch_id)) {
        throw new ForbiddenException('Account not found');
      }
      if (account.is_system && !this.canManageSystemAccounts(req)) {
        throw new ForbiddenException(
          'System accounts can only be changed by admin or owner',
        );
      }

      const rawAccountType = this.resolveAliasedString(
        dto.accountType,
        dto.account_type,
        'accountType',
      );
      const rawAccountKey = this.resolveAliasedString(
        dto.accountKey,
        dto.account_key,
        'accountKey',
      );
      const nextName =
        dto.name !== undefined
          ? this.requireAccountValue(dto.name, 'Account name')
          : account.name;
      const nextCode =
        dto.code !== undefined
          ? this.normalizeNullableString(dto.code)
          : account.code;
      const nextAccountType =
        rawAccountType !== undefined
          ? this.normalizeAccountType(rawAccountType)
          : account.account_type;
      if (!nextAccountType) {
        throw new BadRequestException('Account type is required');
      }
      const nextAccountKey =
        rawAccountKey !== undefined
          ? this.requireAccountValue(rawAccountKey, 'Account key')
          : account.account_key;
      if (!nextAccountKey) {
        throw new BadRequestException('Account key is required');
      }
      const nextActive = dto.active ?? account.active;
      const requestedReconciliation =
        dto.allowReconciliation ?? dto.allow_reconciliation;
      if (
        dto.allowReconciliation !== undefined &&
        dto.allow_reconciliation !== undefined &&
        dto.allowReconciliation !== dto.allow_reconciliation
      ) {
        throw new BadRequestException(
          'allowReconciliation and allow_reconciliation must match',
        );
      }
      const nextAllowReconciliation =
        requestedReconciliation !== undefined
          ? requestedReconciliation
          : account.allow_reconciliation;
      const nextDescription =
        dto.description !== undefined
          ? this.normalizeNullableString(dto.description)
          : account.description;

      const typeChanged = nextAccountType !== account.account_type;
      const keyChanged = nextAccountKey !== account.account_key;
      if (typeChanged || keyChanged) {
        const lineCount = await this.countAccountJournalLines(tx, account.id);
        if (lineCount > 0 && typeChanged) {
          throw new BadRequestException(
            'Account type cannot be changed after journal entries have been posted',
          );
        }
        if (lineCount > 0 && keyChanged) {
          throw new BadRequestException(
            'Account key cannot be changed after journal entries have been posted',
          );
        }
      }

      if (keyChanged) {
        const [duplicate] = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id::text AS id
           FROM chart_of_accounts
           WHERE branch_id = $1::uuid
             AND account_key = $2
             AND id <> $3::uuid
           LIMIT 1`,
          account.branch_id,
          nextAccountKey,
          account.id,
        );
        if (duplicate) {
          throw new BadRequestException('Account key already exists');
        }
      }

      const [updated] = await tx.$queryRawUnsafe<ChartOfAccountCrudRecord[]>(
        `UPDATE chart_of_accounts
         SET code = $2,
             name = $3,
             account_type = $4,
             account_key = $5,
             active = $6::boolean,
             allow_reconciliation = $7::boolean,
             description = $8,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
         RETURNING ${this.accountCrudSelectSql()}`,
        account.id,
        nextCode,
        nextName,
        nextAccountType,
        nextAccountKey,
        nextActive,
        nextAllowReconciliation,
        nextDescription,
      );
      const oldPayload = this.accountCrudResponse(account);
      const newPayload = this.accountCrudResponse(updated);
      await this.auditLog.append(tx, {
        branchId: account.branch_id,
        actorUserId: req.userId ?? null,
        tableName: 'chart_of_accounts',
        recordId: account.id,
        entityType: 'chart_of_accounts',
        entityId: account.id,
        action: 'update',
        oldPayload,
        newPayload,
      });
      return newPayload;
    });
  }

  @Delete('accounts/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('manage_accounting_configuration')
  async deleteAccount(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ChartOfAccountCrudResponse> {
    this.ensureTenant();
    const allowed = assertAllowedBranches(req);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [account] = await tx.$queryRawUnsafe<ChartOfAccountCrudRecord[]>(
        `SELECT ${this.accountCrudSelectSql()}
         FROM chart_of_accounts
         WHERE id = $1::uuid`,
        id,
      );
      if (!account || !allowed.includes(account.branch_id)) {
        throw new ForbiddenException('Account not found');
      }
      if (account.is_system && !this.canManageSystemAccounts(req)) {
        throw new ForbiddenException(
          'System accounts can only be archived by admin or owner',
        );
      }

      const lineCount = await this.countAccountJournalLines(tx, account.id);
      const childCount = await this.countAccountChildren(tx, account.id);
      if (lineCount > 0 || childCount > 0 || account.is_system) {
        const [archived] = await tx.$queryRawUnsafe<ChartOfAccountCrudRecord[]>(
          `UPDATE chart_of_accounts
           SET active = FALSE,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1::uuid
           RETURNING ${this.accountCrudSelectSql()}`,
          account.id,
        );
        const oldPayload = this.accountCrudResponse(account);
        const newPayload = this.accountCrudResponse(archived);
        await this.auditLog.append(tx, {
          branchId: account.branch_id,
          actorUserId: req.userId ?? null,
          tableName: 'chart_of_accounts',
          recordId: account.id,
          entityType: 'chart_of_accounts',
          entityId: account.id,
          action: 'archive',
          oldPayload,
          newPayload,
        });
        return newPayload;
      }

      const oldPayload = this.accountCrudResponse(account);
      await this.auditLog.append(tx, {
        branchId: account.branch_id,
        actorUserId: req.userId ?? null,
        tableName: 'chart_of_accounts',
        recordId: account.id,
        entityType: 'chart_of_accounts',
        entityId: account.id,
        action: 'delete',
        oldPayload,
        newPayload: null,
      });
      await tx.$queryRawUnsafe(
        `DELETE FROM chart_of_accounts
         WHERE id = $1::uuid`,
        account.id,
      );
      return oldPayload;
    });
  }

  @Patch('chart-of-accounts/:id/allow-reconciliation')
  @UseGuards(PermissionGuard)
  @RequirePermissions('manage_accounting_configuration')
  async updateChartOfAccountReconciliation(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateChartOfAccountReconciliationDto,
  ) {
    this.ensureTenant();
    const requested = dto.allowReconciliation ?? dto.allow_reconciliation;
    if (requested === undefined) {
      throw new BadRequestException('allowReconciliation is required');
    }
    if (
      dto.allowReconciliation !== undefined &&
      dto.allow_reconciliation !== undefined &&
      dto.allowReconciliation !== dto.allow_reconciliation
    ) {
      throw new BadRequestException(
        'allowReconciliation and allow_reconciliation must match',
      );
    }

    const allowed = assertAllowedBranches(req);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [account] = await tx.$queryRawUnsafe<ChartOfAccountsListRow[]>(
        `SELECT id, branch_id, code, name, account_type, account_key, is_system, allow_reconciliation, payment_method_key, parent_id, created_at
         FROM chart_of_accounts
         WHERE id = $1::uuid`,
        id,
      );
      if (!account || !allowed.includes(account.branch_id)) {
        throw new ForbiddenException('Account not found');
      }
      const role = req.userRole?.trim().toLowerCase() ?? '';
      const canChangeSystemAccount =
        role === 'admin' || role === 'owner' || role === 'super_admin';
      if (account.is_system && !canChangeSystemAccount) {
        throw new ForbiddenException(
          'System account reconciliation can only be changed by admin or owner',
        );
      }
      if (account.allow_reconciliation === requested) {
        return account;
      }

      const [updated] = await tx.$queryRawUnsafe<ChartOfAccountsListRow[]>(
        `UPDATE chart_of_accounts
         SET allow_reconciliation = $2::boolean
         WHERE id = $1::uuid
         RETURNING id, branch_id, code, name, account_type, account_key, is_system, allow_reconciliation, payment_method_key, parent_id, created_at`,
        id,
        requested,
      );

      await this.auditLog.append(tx, {
        branchId: account.branch_id,
        actorUserId: req.userId ?? null,
        tableName: 'chart_of_accounts',
        recordId: account.id,
        entityType: 'chart_of_accounts',
        entityId: account.id,
        action: 'update_allow_reconciliation',
        oldPayload: {
          allow_reconciliation: account.allow_reconciliation,
          account_key: account.account_key,
          code: account.code,
          name: account.name,
        },
        newPayload: {
          allow_reconciliation: updated.allow_reconciliation,
          account_key: updated.account_key,
          code: updated.code,
          name: updated.name,
        },
      });

      return updated;
    });
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
  @UseGuards(PermissionGuard)
  @RequirePermissions('post_journal')
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
