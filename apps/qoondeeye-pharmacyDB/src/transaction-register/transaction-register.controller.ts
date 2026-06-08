import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import ExcelJS from 'exceljs';
import { assertAllowedBranches } from '../common/branch-scope';
import { parsePagedQueryParam } from '../common/pagination.util';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantService } from '../tenant/tenant.service';
import {
  TransactionRegisterExportQueryDto,
  TransactionRegisterQueryDto,
} from './dto/transaction-register-query.dto';
import { TransactionRegisterService } from './transaction-register.service';
import type { TransactionRegisterListRow } from './transaction-register.types';

const EXPORT_COLUMNS: Array<{ key: keyof TransactionRegisterListRow; header: string }> = [
  { key: 'transaction_no', header: 'Transaction No.' },
  { key: 'receipt_no', header: 'Receipt No.' },
  { key: 'member_card_no', header: 'Member Card No.' },
  { key: 'pos_receipt_no', header: 'POS Receipt No.' },
  { key: 'transaction_type', header: 'Transaction Type' },
  { key: 'store_no', header: 'Store No.' },
  { key: 'terminal_no', header: 'POS Terminal No.' },
  { key: 'staff_code', header: 'Staff ID' },
  { key: 'transaction_at', header: 'Date/Time' },
  { key: 'customer_no', header: 'Customer No.' },
  { key: 'customer_order_id', header: 'Customer Order ID' },
  { key: 'sales_type', header: 'Sales Type' },
  { key: 'gross_amount', header: 'Gross Amount' },
  { key: 'net_amount', header: 'Net Amount' },
  { key: 'payment_amount', header: 'Payment Amount' },
  { key: 'discount_amount', header: 'Discount Amount' },
  { key: 'cost_amount', header: 'Cost Amount' },
  { key: 'manager_id', header: 'Manager ID' },
  { key: 'statement_no', header: 'Statement No.' },
  { key: 'posted_statement_no', header: 'Posted Statement No.' },
  { key: 'refund_status', header: 'Refund Status' },
];

function escapeCsv(v: unknown): string {
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
}

@Controller('pos/transaction-register')
@UseGuards(PermissionGuard)
export class TransactionRegisterController {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly tenantService: TenantService,
    private readonly registerService: TransactionRegisterService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  private resolveBranchIds(req: FastifyRequest, branchId?: string): string[] {
    const allowed = assertAllowedBranches(req);
    const narrow = branchId?.trim();
    if (narrow && narrow.toLowerCase() !== 'all') {
      if (!allowed.includes(narrow)) {
        throw new ForbiddenException('Branch not in your allowed scope');
      }
      return [narrow];
    }
    return allowed;
  }

  private buildQuery(
    req: FastifyRequest,
    dto: TransactionRegisterQueryDto,
    branchIds: string[],
    paged: { page: number; limit: number; skip: number },
  ) {
    return {
      branchIds,
      page: paged.page,
      limit: paged.limit,
      skip: paged.skip,
      dateFrom: dto.date_from ?? null,
      dateTo: dto.date_to ?? null,
      terminalId: dto.terminal_id ?? null,
      staffId: dto.staff_id ?? null,
      receiptNo: dto.receipt_no ?? null,
      transactionNo: dto.transaction_no ?? null,
      customerId: dto.customer_id ?? null,
      customerQ: dto.customer_q ?? null,
      transactionType: dto.transaction_type ?? null,
      refundStatus: dto.refund_status ?? null,
      statementId: dto.statement_id ?? null,
      managerId: dto.manager_id ?? null,
      sortBy: dto.sort_by ?? null,
      sortDir: dto.sort_dir ?? 'desc',
    };
  }

  @Get('export')
  @RequirePermissions('view_transaction_register')
  async export(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Query() dto: TransactionRegisterExportQueryDto,
  ) {
    this.ensureTenant();
    const branchIds = this.resolveBranchIds(req, dto.branch_id);
    const schema = this.tenantContext.getSchemaName()!;
    await this.tenantService.applyTenantSchemaPatches(schema);
    const tenantId = this.tenantContext.getTenant()?.id ?? null;

    const rows = await this.registerService.listForExport(
      schema,
      tenantId,
      this.buildQuery(req, dto, branchIds, { page: 1, limit: 1, skip: 0 }),
    );

    if (dto.format === 'csv') {
      const lines = [EXPORT_COLUMNS.map((c) => c.header).join(',')];
      for (const row of rows) {
        lines.push(
          EXPORT_COLUMNS.map((c) => escapeCsv(row[c.key])).join(','),
        );
      }
      const csv = `${lines.join('\n')}\n`;
      res.header('Content-Type', 'text/csv; charset=utf-8');
      res.header(
        'Content-Disposition',
        `attachment; filename="transaction-register-${Date.now()}.csv"`,
      );
      return res.status(200).send(csv);
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Transaction Register');
    ws.addRow(EXPORT_COLUMNS.map((c) => c.header));
    for (const row of rows) {
      ws.addRow(EXPORT_COLUMNS.map((c) => row[c.key] ?? ''));
    }
    const buffer = await wb.xlsx.writeBuffer();
    res.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.header(
      'Content-Disposition',
      `attachment; filename="transaction-register-${Date.now()}.xlsx"`,
    );
    return res.status(200).send(Buffer.from(buffer));
  }

  @Get()
  @RequirePermissions('view_transaction_register')
  async list(@Req() req: FastifyRequest, @Query() dto: TransactionRegisterQueryDto) {
    this.ensureTenant();
    const paged = parsePagedQueryParam(dto.page, dto.limit, { maxLimit: 200 });
    if (!paged) {
      throw new BadRequestException(
        'Query parameter "page" is required for transaction register',
      );
    }
    const branchIds = this.resolveBranchIds(req, dto.branch_id);
    const schema = this.tenantContext.getSchemaName()!;
    const tenantId = this.tenantContext.getTenant()?.id ?? null;
    return this.registerService.list(
      schema,
      tenantId,
      this.buildQuery(req, dto, branchIds, paged),
    );
  }

  @Get(':registerId')
  @RequirePermissions('view_transaction_register')
  async detail(
    @Req() req: FastifyRequest,
    @Param('registerId') registerId: string,
  ) {
    this.ensureTenant();
    const allowed = assertAllowedBranches(req);
    const schema = this.tenantContext.getSchemaName()!;
    const tenantId = this.tenantContext.getTenant()?.id ?? null;
    const detail = await this.registerService.getDetail(
      schema,
      tenantId,
      decodeURIComponent(registerId),
      allowed,
    );
    if (!detail) {
      throw new NotFoundException('Transaction not found');
    }
    return detail;
  }
}
