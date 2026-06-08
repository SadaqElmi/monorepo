import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { toPagedResult, type PagedResult } from '../common/pagination.util';
import type {
  TransactionRegisterDetail,
  TransactionRegisterListRow,
  TransactionRegisterQuery,
} from './transaction-register.types';

type RawRegisterRow = {
  register_id: string;
  transaction_no: string;
  receipt_no: string | null;
  member_card_no: string | null;
  pos_receipt_no: string | null;
  transaction_type: string;
  store_no: string | null;
  branch_id: string;
  terminal_id: string | null;
  staff_id: string | null;
  staff_code: string | null;
  staff_name: string | null;
  transaction_at: Date;
  customer_id: string | null;
  customer_no: string | null;
  customer_name: string | null;
  customer_order_id: string | null;
  sales_type: string;
  payment_method: string | null;
  gross_amount: number | string | null;
  net_amount: number | string | null;
  payment_amount: number | string | null;
  discount_amount: number | string | null;
  cost_amount: number | string | null;
  manager_id: string | null;
  statement_no: string | null;
  posted_statement_no: string | null;
  refund_status: string | null;
  sale_id: string | null;
};

const EXPORT_MAX_ROWS = 50_000;

@Injectable()
export class TransactionRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private escapeLikePattern(raw: string): string {
    return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  private saleCostSubquery(alias: string): string {
    return `COALESCE((
      SELECT SUM(COALESCE(si.line_cost_snapshot, 0))
      FROM sale_items si
      WHERE si.sale_id = ${alias}.id
    ), (
      SELECT COALESCE(SUM(jl.debit), 0)
      FROM journal_entries je
      INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
      INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
        AND coa.account_type = 'cost_of_goods_sold'
      WHERE je.source_id = ${alias}.id
        AND je.source_type IN ('sale', 'customer_invoice')
    ), 0)`;
  }

  private saleDiscountSubquery(alias: string): string {
    return `COALESCE(${alias}.discount, 0) + COALESCE((
      SELECT SUM(COALESCE(si.line_discount, 0))
      FROM sale_items si
      WHERE si.sale_id = ${alias}.id
    ), 0)`;
  }

  private saleRefundStatusSubquery(alias: string): string {
    return `CASE
      WHEN COALESCE((
        SELECT SUM(COALESCE(sr2.refund_amount, 0))
        FROM sale_returns sr2
        WHERE sr2.sale_id = ${alias}.id
      ), 0) <= 0 THEN 'none'
      WHEN COALESCE((
        SELECT SUM(COALESCE(sr2.refund_amount, 0))
        FROM sale_returns sr2
        WHERE sr2.sale_id = ${alias}.id
      ), 0) >= COALESCE(${alias}.total_amount, 0) THEN 'full'
      ELSE 'partial'
    END`;
  }

  private openStatementSubquery(sessionCol: string): string {
    return `(
      SELECT pst.id::text
      FROM pos_statements pst
      WHERE pst.session_id = ${sessionCol}
        AND pst.status = 'open'
      ORDER BY pst.created_at DESC
      LIMIT 1
    )`;
  }

  private postedStatementSubquery(sessionCol: string): string {
    return `(
      SELECT pst.id::text
      FROM pos_statements pst
      WHERE pst.session_id = ${sessionCol}
        AND pst.status = 'posted'
      ORDER BY pst.posted_at DESC NULLS LAST, pst.created_at DESC
      LIMIT 1
    )`;
  }

  private registerUnionSql(): string {
    const saleCost = this.saleCostSubquery('s');
    const saleDiscount = this.saleDiscountSubquery('s');
    const refundStatus = this.saleRefundStatusSubquery('s');
    const openStmt = this.openStatementSubquery('s.pos_session_id');
    const postedStmt = this.postedStatementSubquery('s.pos_session_id');

    return `
      SELECT
        ('sale:' || s.id::text) AS register_id,
        CASE
          WHEN NULLIF(TRIM(s.receipt_number::text), '') IS NOT NULL THEN
            'TRX-' || LPAD(NULLIF(TRIM(s.receipt_number::text), ''), 5, '0')
          ELSE 'TRX-' || UPPER(LEFT(REPLACE(s.id::text, '-', ''), 8))
        END AS transaction_no,
        NULLIF(TRIM(s.receipt_number::text), '') AS receipt_no,
        NULL::text AS member_card_no,
        NULLIF(TRIM(s.receipt_number::text), '') AS pos_receipt_no,
        'sale'::text AS transaction_type,
        NULLIF(TRIM(b.code::text), '') AS store_no,
        s.branch_id,
        ps.device_id AS terminal_id,
        ps.staff_user_id AS staff_id,
        u.staff_id AS staff_code,
        u.name AS staff_name,
        s.sale_date AS transaction_at,
        s.customer_id,
        CASE WHEN s.customer_id IS NOT NULL THEN LEFT(s.customer_id::text, 8) ELSE NULL END AS customer_no,
        c.name AS customer_name,
        NULL::text AS customer_order_id,
        CASE WHEN COALESCE(s.on_account, FALSE) THEN 'Wholesale' ELSE 'Retail' END AS sales_type,
        CASE
          WHEN COALESCE(s.on_account, FALSE) THEN 'customer-credit'
          ELSE (
            SELECT p.method
            FROM payments p
            WHERE p.sale_id = s.id
            ORDER BY p.paid_at ASC NULLS LAST
            LIMIT 1
          )
        END AS payment_method,
        (COALESCE(s.total_amount, 0) + (${saleDiscount}))::numeric AS gross_amount,
        COALESCE(s.total_amount, 0)::numeric AS net_amount,
        COALESCE((
          SELECT SUM(COALESCE(p.amount, 0))
          FROM payments p
          WHERE p.sale_id = s.id
        ), CASE WHEN COALESCE(s.on_account, FALSE) THEN COALESCE(s.total_amount, 0) ELSE 0 END)::numeric AS payment_amount,
        (${saleDiscount})::numeric AS discount_amount,
        (${saleCost})::numeric AS cost_amount,
        (
          SELECT u2.staff_id
          FROM sale_items si2
          LEFT JOIN users u2 ON u2.id = ps.staff_user_id
          WHERE si2.sale_id = s.id
            AND LOWER(COALESCE(si2.discount_source, '')) = 'manager'
          LIMIT 1
        ) AS manager_id,
        ${openStmt} AS statement_no,
        ${postedStmt} AS posted_statement_no,
        (${refundStatus})::text AS refund_status,
        s.id AS sale_id
      FROM sales s
      INNER JOIN branches b ON b.id = s.branch_id
      LEFT JOIN pos_sessions ps ON ps.id = s.pos_session_id
      LEFT JOIN users u ON u.id = ps.staff_user_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.branch_id = ANY($1::uuid[])
        AND s.pos_session_id IS NOT NULL

      UNION ALL

      SELECT
        ('return:' || sr.id::text) AS register_id,
        'RTN-' || UPPER(LEFT(REPLACE(sr.id::text, '-', ''), 8)) AS transaction_no,
        NULLIF(TRIM(s.receipt_number::text), '') AS receipt_no,
        NULL::text AS member_card_no,
        NULLIF(TRIM(s.receipt_number::text), '') AS pos_receipt_no,
        'refund'::text AS transaction_type,
        NULLIF(TRIM(b.code::text), '') AS store_no,
        sr.branch_id,
        ps.device_id AS terminal_id,
        ps.staff_user_id AS staff_id,
        u.staff_id AS staff_code,
        u.name AS staff_name,
        sr.return_date AS transaction_at,
        s.customer_id,
        CASE WHEN s.customer_id IS NOT NULL THEN LEFT(s.customer_id::text, 8) ELSE NULL END AS customer_no,
        c.name AS customer_name,
        NULL::text AS customer_order_id,
        CASE WHEN COALESCE(s.on_account, FALSE) THEN 'Wholesale' ELSE 'Retail' END AS sales_type,
        COALESCE(sr.refund_method, 'refund') AS payment_method,
        COALESCE(sr.refund_amount, 0)::numeric AS gross_amount,
        COALESCE(sr.refund_amount, 0)::numeric AS net_amount,
        COALESCE(sr.refund_amount, 0)::numeric AS payment_amount,
        0::numeric AS discount_amount,
        COALESCE((
          SELECT COALESCE(SUM(jl.credit), 0)
          FROM journal_entries je
          INNER JOIN journal_lines jl ON jl.journal_entry_id = je.id
          INNER JOIN chart_of_accounts coa ON coa.id = jl.account_id
            AND coa.account_type = 'cost_of_goods_sold'
          WHERE je.source_id = sr.id
            AND je.source_type = 'sale_return'
        ), 0)::numeric AS cost_amount,
        NULL::text AS manager_id,
        ${this.openStatementSubquery('s.pos_session_id')} AS statement_no,
        ${this.postedStatementSubquery('s.pos_session_id')} AS posted_statement_no,
        NULL::text AS refund_status,
        sr.sale_id AS sale_id
      FROM sale_returns sr
      INNER JOIN sales s ON s.id = sr.sale_id
      INNER JOIN branches b ON b.id = sr.branch_id
      LEFT JOIN pos_sessions ps ON ps.id = s.pos_session_id
      LEFT JOIN users u ON u.id = ps.staff_user_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE sr.branch_id = ANY($1::uuid[])
        AND s.pos_session_id IS NOT NULL
    `;
  }

  private buildFilters(
    q: TransactionRegisterQuery,
    params: unknown[],
    startIndex: number,
  ): { filterSql: string; nextIndex: number } {
    const filters: string[] = [];
    let i = startIndex;

    const addParam = (value: unknown, clause: string) => {
      params.push(value);
      filters.push(clause.replace('$IDX', `$${i++}`));
    };

    if (q.dateFrom?.trim()) {
      addParam(q.dateFrom.trim().slice(0, 10), `AND r.transaction_at::date >= $IDX::date`);
    }
    if (q.dateTo?.trim()) {
      addParam(q.dateTo.trim().slice(0, 10), `AND r.transaction_at::date <= $IDX::date`);
    }
    if (q.terminalId?.trim()) {
      addParam(q.terminalId.trim(), `AND r.terminal_id = $IDX::uuid`);
    }
    if (q.staffId?.trim()) {
      addParam(q.staffId.trim(), `AND r.staff_id = $IDX::uuid`);
    }
    if (q.receiptNo?.trim()) {
      const pattern = `%${this.escapeLikePattern(q.receiptNo.trim())}%`;
      addParam(pattern, `AND COALESCE(r.receipt_no, '') ILIKE $IDX ESCAPE E'\\\\'`);
    }
    if (q.transactionNo?.trim()) {
      const pattern = `%${this.escapeLikePattern(q.transactionNo.trim())}%`;
      addParam(pattern, `AND r.transaction_no ILIKE $IDX ESCAPE E'\\\\'`);
    }
    if (q.customerId?.trim()) {
      addParam(q.customerId.trim(), `AND r.customer_id = $IDX::uuid`);
    }
    if (q.customerQ?.trim()) {
      const pattern = `%${this.escapeLikePattern(q.customerQ.trim())}%`;
      addParam(
        pattern,
        `AND (
          COALESCE(r.customer_name, '') ILIKE $IDX ESCAPE E'\\\\'
          OR COALESCE(r.customer_no, '') ILIKE $IDX ESCAPE E'\\\\'
        )`,
      );
    }
    if (q.transactionType?.trim()) {
      addParam(q.transactionType.trim(), `AND r.transaction_type = $IDX`);
    }
    if (q.refundStatus?.trim()) {
      addParam(q.refundStatus.trim(), `AND r.transaction_type = 'sale' AND r.refund_status = $IDX`);
    }
    if (q.statementId?.trim()) {
      addParam(
        q.statementId.trim(),
        `AND (r.statement_no = $IDX OR r.posted_statement_no = $IDX)`,
      );
    }
    if (q.managerId?.trim()) {
      addParam(q.managerId.trim(), `AND r.manager_id = $IDX`);
    }

    return { filterSql: filters.join('\n      '), nextIndex: i };
  }

  private resolveSort(q: TransactionRegisterQuery): string {
    const dir = q.sortDir === 'asc' ? 'ASC' : 'DESC';
    switch (q.sortBy) {
      case 'transaction_no':
        return `r.transaction_no ${dir}, r.transaction_at DESC`;
      case 'store_no':
        return `r.store_no ${dir} NULLS LAST, r.transaction_at DESC`;
      case 'terminal_no':
        return `r.terminal_id ${dir} NULLS LAST, r.transaction_at DESC`;
      case 'staff_id':
        return `r.staff_code ${dir} NULLS LAST, r.transaction_at DESC`;
      case 'net_amount':
        return `r.net_amount ${dir}, r.transaction_at DESC`;
      case 'transaction_at':
      default:
        return `r.transaction_at ${dir}, r.register_id DESC`;
    }
  }

  private toNumber(v: number | string | null | undefined): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private mapRow(row: RawRegisterRow): TransactionRegisterListRow {
    return {
      register_id: row.register_id,
      transaction_no: row.transaction_no,
      receipt_no: row.receipt_no,
      member_card_no: row.member_card_no,
      pos_receipt_no: row.pos_receipt_no,
      transaction_type: row.transaction_type as TransactionRegisterListRow['transaction_type'],
      store_no: row.store_no,
      branch_id: row.branch_id,
      terminal_id: row.terminal_id,
      terminal_no: null,
      staff_id: row.staff_id,
      staff_code: row.staff_code,
      staff_name: row.staff_name,
      transaction_at:
        row.transaction_at instanceof Date
          ? row.transaction_at.toISOString()
          : String(row.transaction_at),
      customer_id: row.customer_id,
      customer_no: row.customer_no,
      customer_name: row.customer_name,
      customer_order_id: row.customer_order_id,
      sales_type: row.sales_type,
      payment_method: row.payment_method,
      gross_amount: this.toNumber(row.gross_amount),
      net_amount: this.toNumber(row.net_amount),
      payment_amount: this.toNumber(row.payment_amount),
      discount_amount: this.toNumber(row.discount_amount),
      cost_amount: this.toNumber(row.cost_amount),
      manager_id: row.manager_id,
      statement_no: row.statement_no,
      posted_statement_no: row.posted_statement_no,
      refund_status: row.refund_status as TransactionRegisterListRow['refund_status'],
      sale_id: row.sale_id,
    };
  }

  private async resolveTerminalCodes(
    tenantId: string | null,
    rows: TransactionRegisterListRow[],
  ): Promise<void> {
    const deviceIds = [
      ...new Set(
        rows.map((r) => r.terminal_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!deviceIds.length || !tenantId) return;

    const devices = await this.prisma.$queryRawUnsafe<
      { id: string; device_code: string }[]
    >(
      `SELECT id::text AS id, device_code
       FROM public.pos_devices
       WHERE tenant_id = $1::uuid
         AND id = ANY($2::uuid[])`,
      tenantId,
      deviceIds,
    );
    const byId = new Map(devices.map((d) => [d.id, d.device_code]));
    for (const row of rows) {
      if (row.terminal_id) {
        row.terminal_no = byId.get(row.terminal_id) ?? row.terminal_id.slice(0, 8);
      }
    }
  }

  async list(
    schemaName: string,
    tenantId: string | null,
    q: TransactionRegisterQuery,
  ): Promise<PagedResult<TransactionRegisterListRow>> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const unionBody = this.registerUnionSql();
    const params: unknown[] = [q.branchIds];
    const { filterSql } = this.buildFilters(q, params, 2);
    const orderBy = this.resolveSort(q);
    const baseFrom = `
      FROM (${unionBody}) AS r
      WHERE 1=1
      ${filterSql}
    `;

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c ${baseFrom}`,
        ...params,
      );
      const total = Number(countRow?.c ?? 0);
      const limitParams = [...params, q.limit, q.skip];
      const rows = await tx.$queryRawUnsafe<RawRegisterRow[]>(
        `SELECT r.* ${baseFrom}
         ORDER BY ${orderBy}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...limitParams,
      );
      const items = rows.map((r) => this.mapRow(r));
      await this.resolveTerminalCodes(tenantId, items);
      return toPagedResult(items, total, q.page, q.limit);
    });
  }

  async listForExport(
    schemaName: string,
    tenantId: string | null,
    q: Omit<TransactionRegisterQuery, 'page' | 'limit' | 'skip'>,
  ): Promise<TransactionRegisterListRow[]> {
    if (!q.dateFrom?.trim() && !q.dateTo?.trim()) {
      throw new BadRequestException(
        'Export requires date_from and/or date_to to limit result size',
      );
    }
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const unionBody = this.registerUnionSql();
    const params: unknown[] = [q.branchIds];
    const { filterSql } = this.buildFilters(
      { ...q, page: 1, limit: EXPORT_MAX_ROWS, skip: 0 },
      params,
      2,
    );
    const orderBy = this.resolveSort({ ...q, page: 1, limit: EXPORT_MAX_ROWS, skip: 0 });
    const baseFrom = `
      FROM (${unionBody}) AS r
      WHERE 1=1
      ${filterSql}
    `;

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<RawRegisterRow[]>(
        `SELECT r.* ${baseFrom}
         ORDER BY ${orderBy}
         LIMIT ${EXPORT_MAX_ROWS}`,
        ...params,
      );
      const items = rows.map((r) => this.mapRow(r));
      await this.resolveTerminalCodes(tenantId, items);
      return items;
    });
  }

  parseRegisterId(registerId: string): { kind: 'sale' | 'return'; id: string } {
    const trimmed = registerId.trim();
    if (trimmed.startsWith('sale:')) {
      return { kind: 'sale', id: trimmed.slice(5) };
    }
    if (trimmed.startsWith('return:')) {
      return { kind: 'return', id: trimmed.slice(7) };
    }
    throw new BadRequestException(
      'Invalid register id. Expected sale:{uuid} or return:{uuid}',
    );
  }

  async getDetail(
    schemaName: string,
    tenantId: string | null,
    registerId: string,
    branchIds: string[],
  ): Promise<TransactionRegisterDetail | null> {
    const parsed = this.parseRegisterId(registerId);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      let header: RawRegisterRow | null = null;

      if (parsed.kind === 'sale') {
        const unionBody = this.registerUnionSql();
        const [row] = await tx.$queryRawUnsafe<RawRegisterRow[]>(
          `SELECT r.* FROM (${unionBody}) AS r
           WHERE r.register_id = $2
             AND r.branch_id = ANY($1::uuid[])`,
          branchIds,
          `sale:${parsed.id}`,
        );
        header = row ?? null;
      } else {
        const unionBody = this.registerUnionSql();
        const [row] = await tx.$queryRawUnsafe<RawRegisterRow[]>(
          `SELECT r.* FROM (${unionBody}) AS r
           WHERE r.register_id = $2
             AND r.branch_id = ANY($1::uuid[])`,
          branchIds,
          `return:${parsed.id}`,
        );
        header = row ?? null;
      }

      if (!header) return null;

      const base = this.mapRow(header);
      await this.resolveTerminalCodes(tenantId, [base]);

      const items: TransactionRegisterDetail['items'] = [];
      const payments: TransactionRegisterDetail['payments'] = [];
      let linkedSaleRegisterId: string | null = null;
      const linkedReturns: TransactionRegisterDetail['linked_returns'] = [];

      if (parsed.kind === 'sale') {
        const saleItems = await tx.$queryRawUnsafe<
          {
            product_id: string | null;
            item_no: string | null;
            product_name: string | null;
            entered_quantity: number | string | null;
            quantity: number | string | null;
            uom_code: string | null;
            uom_symbol: string | null;
            price: number | string | null;
            line_discount: number | string | null;
            total: number | string | null;
          }[]
        >(
          `SELECT si.product_id, p.item_no, p.name AS product_name,
                  si.entered_quantity, si.quantity, u.code AS uom_code, u.symbol AS uom_symbol,
                  si.price, si.line_discount, si.total
           FROM sale_items si
           LEFT JOIN products p ON p.id = si.product_id
           LEFT JOIN uoms u ON u.id = si.uom_id
           WHERE si.sale_id = $1::uuid
           ORDER BY si.id`,
          parsed.id,
        );
        for (const line of saleItems) {
          items.push({
            item_no: line.item_no,
            product_id: line.product_id,
            product_name: line.product_name,
            quantity: this.toNumber(line.entered_quantity ?? line.quantity),
            uom_code: line.uom_code,
            uom_symbol: line.uom_symbol,
            unit_price: this.toNumber(line.price),
            discount: this.toNumber(line.line_discount),
            net_amount: this.toNumber(line.total),
          });
        }

        const payRows = await tx.$queryRawUnsafe<
          { method: string | null; amount: number | string | null }[]
        >(
          `SELECT method, amount FROM payments WHERE sale_id = $1::uuid ORDER BY paid_at`,
          parsed.id,
        );
        for (const p of payRows) {
          payments.push({
            method: p.method ?? 'unknown',
            amount: this.toNumber(p.amount),
            bucket: this.paymentBucket(p.method),
          });
        }

        const returns = await tx.$queryRawUnsafe<
          {
            id: string;
            refund_amount: number | string | null;
            return_date: Date;
          }[]
        >(
          `SELECT id, refund_amount, return_date
           FROM sale_returns
           WHERE sale_id = $1::uuid
           ORDER BY return_date DESC`,
          parsed.id,
        );
        for (const ret of returns) {
          linkedReturns.push({
            register_id: `return:${ret.id}`,
            transaction_no: `RTN-${ret.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
            net_amount: this.toNumber(ret.refund_amount),
            return_date:
              ret.return_date instanceof Date
                ? ret.return_date.toISOString()
                : String(ret.return_date),
          });
        }
      } else {
        linkedSaleRegisterId = header.sale_id ? `sale:${header.sale_id}` : null;
        const returnItems = await tx.$queryRawUnsafe<
          {
            product_id: string | null;
            item_no: string | null;
            product_name: string | null;
            quantity: number | string | null;
            uom_code: string | null;
            uom_symbol: string | null;
            price: number | string | null;
            line_discount: number | string | null;
            total: number | string | null;
          }[]
        >(
          `SELECT sri.product_id, p.item_no, p.name AS product_name,
                  sri.quantity, u.code AS uom_code, u.symbol AS uom_symbol,
                  si.price, si.line_discount, si.total
           FROM sale_return_items sri
           LEFT JOIN products p ON p.id = sri.product_id
           LEFT JOIN sale_items si ON si.id = sri.sale_item_id
           LEFT JOIN uoms u ON u.id = sri.uom_id
           WHERE sri.sale_return_id = $1::uuid
           ORDER BY sri.id`,
          parsed.id,
        );
        for (const line of returnItems) {
          const qty = this.toNumber(line.quantity);
          const unitPrice = this.toNumber(line.price);
          items.push({
            item_no: line.item_no,
            product_id: line.product_id,
            product_name: line.product_name,
            quantity: qty,
            uom_code: line.uom_code,
            uom_symbol: line.uom_symbol,
            unit_price: unitPrice,
            discount: this.toNumber(line.line_discount),
            net_amount: this.toNumber(line.total) || unitPrice * qty,
          });
        }

        const [ret] = await tx.$queryRawUnsafe<
          { refund_method: string | null; refund_amount: number | string | null }[]
        >(
          `SELECT refund_method, refund_amount FROM sale_returns WHERE id = $1::uuid`,
          parsed.id,
        );
        if (ret) {
          payments.push({
            method: ret.refund_method ?? 'refund',
            amount: this.toNumber(ret.refund_amount),
            bucket: this.paymentBucket(ret.refund_method),
          });
        }
      }

      const [createdAudit] = await tx.$queryRawUnsafe<
        { actor_user_id: string | null; name: string | null; staff_code: string | null }[]
      >(
        `SELECT al.actor_user_id, u.name, u.staff_id AS staff_code
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.table_name = 'sales'
           AND al.record_id = $1::uuid
           AND al.action = 'create'
         ORDER BY al.created_at ASC
         LIMIT 1`,
        parsed.kind === 'sale' ? parsed.id : header.sale_id,
      );

      const [refundAudit] =
        parsed.kind === 'return'
          ? await tx.$queryRawUnsafe<
              { actor_user_id: string | null; name: string | null; staff_code: string | null }[]
            >(
              `SELECT al.actor_user_id, u.name, u.staff_id AS staff_code
               FROM audit_logs al
               LEFT JOIN users u ON u.id = al.actor_user_id
               WHERE al.table_name = 'sale_returns'
                 AND al.record_id = $1::uuid
                 AND al.action = 'create'
               ORDER BY al.created_at ASC
               LIMIT 1`,
              parsed.id,
            )
          : [null];

      const paymentSummary = this.summarizePayments(payments);
      const profit = base.net_amount - base.cost_amount;

      return {
        ...base,
        items,
        payments,
        payment_summary: paymentSummary,
        profit,
        created_by: createdAudit
          ? {
              user_id: createdAudit.actor_user_id,
              name: createdAudit.name,
              staff_code: createdAudit.staff_code,
            }
          : base.staff_id
            ? {
                user_id: base.staff_id,
                name: base.staff_name,
                staff_code: base.staff_code,
              }
            : null,
        refunded_by: refundAudit
          ? {
              user_id: refundAudit.actor_user_id,
              name: refundAudit.name,
              staff_code: refundAudit.staff_code,
            }
          : null,
        manager_override: base.manager_id,
        linked_sale_register_id: linkedSaleRegisterId,
        linked_returns: linkedReturns,
      };
    });
  }

  private paymentBucket(method: string | null | undefined): string {
    const m = (method ?? '').trim().toLowerCase();
    if (!m) return 'other';
    if (m.includes('cash')) return 'cash';
    if (m.includes('evc') || m.includes('wallet') || m.includes('mobile')) return 'evc';
    if (m.includes('card') || m.includes('visa') || m.includes('master')) return 'card';
    if (m.includes('bank') || m.includes('transfer')) return 'bank';
    return 'other';
  }

  private summarizePayments(payments: TransactionRegisterDetail['payments']): string {
    if (!payments.length) return '—';
    const buckets = new Set(payments.map((p) => p.bucket));
    if (buckets.size > 1) return 'Mixed';
    const bucket = payments[0]!.bucket;
    const labels: Record<string, string> = {
      cash: 'Cash',
      evc: 'EVC',
      bank: 'Bank',
      card: 'Card',
      other: payments[0]!.method,
    };
    return labels[bucket] ?? bucket;
  }
}
