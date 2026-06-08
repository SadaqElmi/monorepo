import { Injectable, NotFoundException } from '@nestjs/common';
import { toPagedResult, type PagedResult } from '../common/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

export type SupplierType = 'local' | 'international';

export interface SupplierRow {
  id: string;
  name: string | null;
  supplier_type: SupplierType;
  country: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date | null;
}

export type SupplierListFilters = {
  q?: string;
  supplierType?: SupplierType;
  active?: boolean;
};

export type SupplierStatsRow = {
  totalPurchases: number;
  totalPurchaseAmount: number;
  lastPurchaseDate: Date | string | null;
  outstandingBalance: number;
};

export type SupplierStatementLineRow = {
  date: Date | string;
  source_type: string;
  source_id: string | null;
  reference: string | null;
  description: string;
  debit: number | string;
  credit: number | string;
  running_balance: number | string;
  branch_id: string;
  branch_name: string | null;
};

export type SupplierPriceHistoryRow = {
  date: Date | string | null;
  purchase_id: string;
  supplier_invoice_no: string | null;
  item_no: string | null;
  product_name: string;
  quantity: number | string | null;
  cost_price: number | string | null;
  selling_price: number | string | null;
  batch_number: string | null;
  expiry_date: Date | string | null;
  branch_name: string | null;
};

export type ProductsBySupplierReportRow = {
  supplierId: string;
  supplierName: string | null;
  supplierType: SupplierType;
  country: string | null;
  city: string | null;
  productId: string;
  itemNo: string | null;
  productName: string;
  isPreferred: boolean;
  lastCostPrice: number | string | null;
  lastPurchaseDate: Date | string | null;
};

export type PurchasesBySupplierReportRow = {
  supplierId: string;
  supplierName: string | null;
  supplierType: SupplierType;
  country: string | null;
  city: string | null;
  purchaseCount: number | string;
  totalPurchaseAmount: number | string;
  lastPurchaseDate: Date | string | null;
};

export type TopSupplierSpendReportRow = PurchasesBySupplierReportRow & {
  rank: number | string;
};

type TxLike = {
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
};

const SUPPLIER_SELECT = `
  id,
  name,
  COALESCE(supplier_type, 'local') AS supplier_type,
  country,
  city,
  phone,
  email,
  address,
  COALESCE(active, TRUE) AS active,
  created_at,
  updated_at
`;

const AP_ACCOUNT_KEYS = [
  'accounts_payable',
  'payables',
  'supplier_control',
] as const;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private normalizeSupplierType(value?: string | null): SupplierType {
    return value === 'international' ? 'international' : 'local';
  }

  private buildListWhere(filters: SupplierListFilters = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const q = filters.q?.trim();
    if (q) {
      params.push(`%${q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
      const p = `$${params.length}`;
      clauses.push(
        `(name ILIKE ${p} ESCAPE '\\' OR phone ILIKE ${p} ESCAPE '\\' OR email ILIKE ${p} ESCAPE '\\' OR country ILIKE ${p} ESCAPE '\\' OR city ILIKE ${p} ESCAPE '\\')`,
      );
    }
    if (filters.supplierType) {
      params.push(filters.supplierType);
      clauses.push(`COALESCE(supplier_type, 'local') = $${params.length}`);
    }
    if (filters.active !== undefined) {
      params.push(filters.active);
      clauses.push(`COALESCE(active, TRUE) = $${params.length}`);
    }
    return {
      sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }

  async findAll(schemaName: string, filters: SupplierListFilters = {}) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const where = this.buildListWhere(filters);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<SupplierRow[]>(
        `SELECT ${SUPPLIER_SELECT}
         FROM suppliers
         ${where.sql}
         ORDER BY COALESCE(name, '') ASC, created_at DESC`,
        ...where.params,
      ),
    );
  }

  async findAllPaged(
    schemaName: string,
    filters: SupplierListFilters,
    page: number,
    limit: number,
    skip: number,
  ): Promise<PagedResult<SupplierRow>> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const where = this.buildListWhere(filters);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM suppliers ${where.sql}`,
        ...where.params,
      );
      const items = await tx.$queryRawUnsafe<SupplierRow[]>(
        `SELECT ${SUPPLIER_SELECT}
         FROM suppliers
         ${where.sql}
         ORDER BY COALESCE(name, '') ASC, created_at DESC
         LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
        ...where.params,
        limit,
        skip,
      );
      return toPagedResult(items, Number(countRow?.c ?? 0), page, limit);
    });
  }

  async findOne(schemaName: string, id: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<SupplierRow[]>(
        `SELECT ${SUPPLIER_SELECT}
         FROM suppliers
         WHERE id = $1::uuid`,
        id,
      );
      return row ?? null;
    });
  }

  async create(
    schemaName: string,
    dto: {
      name?: string;
      supplierType?: string;
      country?: string | null;
      city?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      active?: boolean;
    },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<SupplierRow[]>(
        `INSERT INTO suppliers (
           name, supplier_type, country, city, phone, email, address, active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE))
         RETURNING ${SUPPLIER_SELECT}`,
        dto.name?.trim() || null,
        this.normalizeSupplierType(dto.supplierType),
        dto.country?.trim() || null,
        dto.city?.trim() || null,
        dto.phone?.trim() || null,
        dto.email?.trim() || null,
        dto.address?.trim() || null,
        dto.active ?? true,
      );
      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    dto: {
      name?: string | null;
      supplierType?: string | null;
      country?: string | null;
      city?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      active?: boolean | null;
    },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const has = (key: keyof typeof dto) =>
      Object.prototype.hasOwnProperty.call(dto, key);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<SupplierRow[]>(
        `UPDATE suppliers
         SET name = CASE WHEN $2::boolean THEN NULLIF(TRIM($3::text), '') ELSE name END,
             supplier_type = CASE WHEN $4::boolean THEN $5::text ELSE supplier_type END,
             country = CASE WHEN $6::boolean THEN NULLIF(TRIM($7::text), '') ELSE country END,
             city = CASE WHEN $8::boolean THEN NULLIF(TRIM($9::text), '') ELSE city END,
             phone = CASE WHEN $10::boolean THEN NULLIF(TRIM($11::text), '') ELSE phone END,
             email = CASE WHEN $12::boolean THEN NULLIF(TRIM($13::text), '') ELSE email END,
             address = CASE WHEN $14::boolean THEN NULLIF(TRIM($15::text), '') ELSE address END,
             active = CASE WHEN $16::boolean THEN COALESCE($17::boolean, TRUE) ELSE active END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
         RETURNING ${SUPPLIER_SELECT}`,
        id,
        has('name'),
        dto.name ?? null,
        has('supplierType'),
        this.normalizeSupplierType(dto.supplierType),
        has('country'),
        dto.country ?? null,
        has('city'),
        dto.city ?? null,
        has('phone'),
        dto.phone ?? null,
        has('email'),
        dto.email ?? null,
        has('address'),
        dto.address ?? null,
        has('active'),
        dto.active ?? null,
      );
      return row ?? null;
    });
  }

  async remove(schemaName: string, id: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(`DELETE FROM suppliers WHERE id = $1::uuid`, id);
      return { deleted: true };
    });
  }

  async stats(
    schemaName: string,
    supplierId: string,
    branchIds: string[],
  ): Promise<SupplierStatsRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<
        Array<{
          total_purchases: number | string;
          total_purchase_amount: number | string | null;
          last_purchase_date: Date | string | null;
          outstanding_balance: number | string | null;
        }>
      >(
        `SELECT
           (SELECT COUNT(*)::int
            FROM purchases p
            WHERE p.supplier_id = $1::uuid
              AND p.branch_id = ANY($2::uuid[])) AS total_purchases,
           (SELECT COALESCE(SUM(COALESCE(p.total_amount, 0)), 0)
            FROM purchases p
            WHERE p.supplier_id = $1::uuid
              AND p.branch_id = ANY($2::uuid[])) AS total_purchase_amount,
           (SELECT MAX(p.purchase_date)
            FROM purchases p
            WHERE p.supplier_id = $1::uuid
              AND p.branch_id = ANY($2::uuid[])) AS last_purchase_date,
           (SELECT COALESCE(SUM(jl.credit - jl.debit), 0)
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            JOIN chart_of_accounts coa ON coa.id = jl.account_id
            WHERE jl.partner_kind = 'supplier'
              AND jl.partner_id = $1::uuid
              AND je.branch_id = ANY($2::uuid[])
              AND coa.account_key = ANY($3::text[])) AS outstanding_balance`,
        supplierId,
        branchIds,
        AP_ACCOUNT_KEYS,
      );
      return {
        totalPurchases: Number(row?.total_purchases ?? 0),
        totalPurchaseAmount: Number(row?.total_purchase_amount ?? 0),
        lastPurchaseDate: row?.last_purchase_date ?? null,
        outstandingBalance: Number(row?.outstanding_balance ?? 0),
      };
    });
  }

  async products(
    schemaName: string,
    supplierId: string,
    branchIds: string[],
    page: number,
    limit: number,
    skip: number,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c
         FROM product_suppliers ps
         JOIN products p ON p.id = ps.product_id
         WHERE ps.supplier_id = $1::uuid
           AND (p.branch_id IS NULL OR p.branch_id = ANY($2::uuid[]))`,
        supplierId,
        branchIds,
      );
      const items = await tx.$queryRawUnsafe<
        Array<{
          itemNo: string | null;
          productId: string;
          productName: string;
          lastCostPrice: number | string | null;
          lastPurchaseDate: Date | string | null;
          preferredSupplier: boolean;
          supplierItemCode: string | null;
        }>
      >(
        `WITH latest_purchase AS (
           SELECT pi.product_id, MAX(p.purchase_date) AS last_purchase_date
           FROM purchase_items pi
           JOIN purchases p ON p.id = pi.purchase_id
           WHERE p.supplier_id = $1::uuid
             AND p.branch_id = ANY($2::uuid[])
             AND pi.product_id IS NOT NULL
           GROUP BY pi.product_id
         )
         SELECT
           p.item_no AS "itemNo",
           p.id AS "productId",
           p.name AS "productName",
           ps.last_cost_price AS "lastCostPrice",
           latest_purchase.last_purchase_date AS "lastPurchaseDate",
           ps.is_preferred AS "preferredSupplier",
           ps.supplier_item_code AS "supplierItemCode"
         FROM product_suppliers ps
         JOIN products p ON p.id = ps.product_id
         LEFT JOIN latest_purchase ON latest_purchase.product_id = p.id
         WHERE ps.supplier_id = $1::uuid
           AND (p.branch_id IS NULL OR p.branch_id = ANY($2::uuid[]))
         ORDER BY p.name ASC, p.item_no ASC
         LIMIT $3 OFFSET $4`,
        supplierId,
        branchIds,
        limit,
        skip,
      );
      return toPagedResult(
        items,
        Number(countRow?.c ?? 0),
        page,
        limit,
      );
    });
  }

  async purchases(
    schemaName: string,
    supplierId: string,
    branchIds: string[],
    page: number,
    limit: number,
    skip: number,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c
         FROM purchases p
         WHERE p.supplier_id = $1::uuid
           AND p.branch_id = ANY($2::uuid[])`,
        supplierId,
        branchIds,
      );
      const items = await tx.$queryRawUnsafe<
        Array<{
          purchaseNumber: string | null;
          purchaseId: string;
          supplierInvoiceNumber: string | null;
          date: Date | string | null;
          branchId: string;
          branchName: string | null;
          amount: number | string | null;
          status: string;
        }>
      >(
        `SELECT
           COALESCE(p.invoice_number, p.purchase_order_no, p.id::text) AS "purchaseNumber",
           p.id AS "purchaseId",
           p.supplier_invoice_no AS "supplierInvoiceNumber",
           p.purchase_date AS "date",
           p.branch_id AS "branchId",
           b.name AS "branchName",
           p.total_amount AS "amount",
           COALESCE(p.status, 'closed') AS "status"
         FROM purchases p
         LEFT JOIN branches b ON b.id = p.branch_id
         WHERE p.supplier_id = $1::uuid
           AND p.branch_id = ANY($2::uuid[])
         ORDER BY p.purchase_date DESC NULLS LAST, p.created_at DESC
         LIMIT $3 OFFSET $4`,
        supplierId,
        branchIds,
        limit,
        skip,
      );
      return toPagedResult(
        items,
        Number(countRow?.c ?? 0),
        page,
        limit,
      );
    });
  }

  async statement(
    schemaName: string,
    supplierId: string,
    branchIds: string[],
    filters: { from?: string; to?: string; page: number; limit: number; skip: number },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const from = filters.from?.trim() || null;
    const to = filters.to?.trim() || null;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.assertSupplierExists(tx, supplierId);
      const summary = await this.statementSummary(
        tx,
        supplierId,
        branchIds,
        from,
        to,
      );
      const items = await this.statementRows(
        tx,
        supplierId,
        branchIds,
        from,
        to,
        filters.limit,
        filters.skip,
        Number(summary.openingBalance),
      );
      return {
        openingBalance: Number(summary.openingBalance),
        totalDebits: Number(summary.totalDebits),
        totalCredits: Number(summary.totalCredits),
        closingBalance: Number(summary.closingBalance),
        ...toPagedResult(
          items,
          Number(summary.total),
          filters.page,
          filters.limit,
        ),
      };
    });
  }

  private statementBaseCte() {
    return `
      WITH statement_lines AS (
        SELECT
          jl.id AS line_id,
          je.id AS entry_id,
          je.entry_date AS date,
          je.created_at AS entry_created_at,
          je.source_type,
          je.source_id,
          COALESCE(
            sp.reference,
            p.supplier_invoice_no,
            p.invoice_number,
            p.purchase_order_no,
            pr.notes,
            je.source_id::text
          ) AS reference,
          COALESCE(je.description, '') AS description,
          jl.credit AS debit,
          jl.debit AS credit,
          (jl.credit - jl.debit) AS signed_amount,
          je.branch_id,
          b.name AS branch_name
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        JOIN chart_of_accounts coa ON coa.id = jl.account_id
        LEFT JOIN branches b ON b.id = je.branch_id
        LEFT JOIN purchases p
          ON p.id = je.source_id
         AND je.source_type IN ('purchase', 'purchase_reversal')
        LEFT JOIN supplier_payments sp
          ON sp.id = je.source_id
         AND je.source_type = 'ap_payment'
        LEFT JOIN purchase_refunds pr
          ON pr.id = je.source_id
         AND je.source_type = 'purchase_refund'
        WHERE jl.partner_kind = 'supplier'
          AND jl.partner_id = $1::uuid
          AND je.branch_id = ANY($2::uuid[])
          AND coa.account_key = ANY($3::text[])
      ),
      opening AS (
        SELECT COALESCE(SUM(signed_amount), 0) AS balance
        FROM statement_lines
        WHERE $4::date IS NOT NULL
          AND date < $4::date
      ),
      filtered AS (
        SELECT *
        FROM statement_lines
        WHERE ($4::date IS NULL OR date >= $4::date)
          AND ($5::date IS NULL OR date <= $5::date)
      )`;
  }

  private async statementSummary(
    tx: TxLike,
    supplierId: string,
    branchIds: string[],
    from: string | null,
    to: string | null,
  ) {
    const [row] = await tx.$queryRawUnsafe<
      Array<{
        opening_balance: number | string;
        total_debits: number | string;
        total_credits: number | string;
        closing_balance: number | string;
        total: number | string;
      }>
    >(
      `${this.statementBaseCte()}
       SELECT
         (SELECT balance FROM opening) AS opening_balance,
         COALESCE((SELECT SUM(debit) FROM filtered), 0) AS total_debits,
         COALESCE((SELECT SUM(credit) FROM filtered), 0) AS total_credits,
         (SELECT balance FROM opening)
           + COALESCE((SELECT SUM(signed_amount) FROM filtered), 0) AS closing_balance,
         COALESCE((SELECT COUNT(*) FROM filtered), 0) AS total`,
      supplierId,
      branchIds,
      AP_ACCOUNT_KEYS,
      from,
      to,
    );
    return {
      openingBalance: Number(row?.opening_balance ?? 0),
      totalDebits: Number(row?.total_debits ?? 0),
      totalCredits: Number(row?.total_credits ?? 0),
      closingBalance: Number(row?.closing_balance ?? 0),
      total: Number(row?.total ?? 0),
    };
  }

  private async statementRows(
    tx: TxLike,
    supplierId: string,
    branchIds: string[],
    from: string | null,
    to: string | null,
    limit: number,
    skip: number,
    openingBalance: number,
  ): Promise<SupplierStatementLineRow[]> {
    return tx.$queryRawUnsafe<SupplierStatementLineRow[]>(
      `${this.statementBaseCte()}
       SELECT
         date,
         source_type,
         source_id,
         reference,
         description,
         debit,
         credit,
         ($6::numeric + SUM(signed_amount) OVER (
           ORDER BY date ASC, entry_created_at ASC, line_id ASC
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         )) AS running_balance,
         branch_id,
         branch_name
       FROM filtered
       ORDER BY date ASC, entry_created_at ASC, line_id ASC
       LIMIT $7 OFFSET $8`,
      supplierId,
      branchIds,
      AP_ACCOUNT_KEYS,
      from,
      to,
      openingBalance,
      limit,
      skip,
    );
  }

  async priceHistory(
    schemaName: string,
    supplierId: string,
    branchIds: string[],
    filters: {
      productId?: string;
      from?: string;
      to?: string;
      page: number;
      limit: number;
      skip: number;
    },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const productId = filters.productId?.trim() || null;
    const from = filters.from?.trim() || null;
    const to = filters.to?.trim() || null;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.assertSupplierExists(tx, supplierId);
      const [summary] = await tx.$queryRawUnsafe<
        Array<{
          total: number | string;
          last_cost: number | string | null;
          min_cost: number | string | null;
          max_cost: number | string | null;
          average_cost: number | string | null;
        }>
      >(
        `SELECT
           COUNT(*)::int AS total,
           (ARRAY_AGG(pi.cost_price ORDER BY p.purchase_date DESC NULLS LAST, p.created_at DESC NULLS LAST, pi.id DESC)
              FILTER (WHERE pi.cost_price IS NOT NULL))[1] AS last_cost,
           MIN(pi.cost_price) FILTER (WHERE pi.cost_price IS NOT NULL) AS min_cost,
           MAX(pi.cost_price) FILTER (WHERE pi.cost_price IS NOT NULL) AS max_cost,
           AVG(pi.cost_price) FILTER (WHERE pi.cost_price IS NOT NULL) AS average_cost
         FROM purchase_items pi
         JOIN purchases p ON p.id = pi.purchase_id
         WHERE p.supplier_id = $1::uuid
           AND p.branch_id = ANY($2::uuid[])
           AND pi.product_id IS NOT NULL
           AND ($3::uuid IS NULL OR pi.product_id = $3::uuid)
           AND ($4::date IS NULL OR p.purchase_date >= $4::date)
           AND ($5::date IS NULL OR p.purchase_date <= $5::date)`,
        supplierId,
        branchIds,
        productId,
        from,
        to,
      );
      const items = await tx.$queryRawUnsafe<SupplierPriceHistoryRow[]>(
        `SELECT
           p.purchase_date AS date,
           p.id AS purchase_id,
           p.supplier_invoice_no,
           pr.item_no,
           pr.name AS product_name,
           pi.quantity,
           pi.cost_price,
           pi.selling_price,
           COALESCE(b.batch_number, pi.planned_batch_number) AS batch_number,
           COALESCE(pi.expiry_date, pi.planned_expiry_date, b.expiry_date) AS expiry_date,
           br.name AS branch_name
         FROM purchase_items pi
         JOIN purchases p ON p.id = pi.purchase_id
         JOIN products pr ON pr.id = pi.product_id
         LEFT JOIN batches b ON b.id = pi.batch_id
         LEFT JOIN branches br ON br.id = p.branch_id
         WHERE p.supplier_id = $1::uuid
           AND p.branch_id = ANY($2::uuid[])
           AND pi.product_id IS NOT NULL
           AND ($3::uuid IS NULL OR pi.product_id = $3::uuid)
           AND ($4::date IS NULL OR p.purchase_date >= $4::date)
           AND ($5::date IS NULL OR p.purchase_date <= $5::date)
         ORDER BY p.purchase_date DESC NULLS LAST, p.created_at DESC NULLS LAST, pi.id DESC
         LIMIT $6 OFFSET $7`,
        supplierId,
        branchIds,
        productId,
        from,
        to,
        filters.limit,
        filters.skip,
      );
      return {
        summary: {
          lastCost: summary?.last_cost ?? null,
          minCost: summary?.min_cost ?? null,
          maxCost: summary?.max_cost ?? null,
          averageCost: summary?.average_cost ?? null,
        },
        ...toPagedResult(
          items,
          Number(summary?.total ?? 0),
          filters.page,
          filters.limit,
        ),
      };
    });
  }

  async productsBySupplierReport(
    schemaName: string,
    branchIds: string[],
    filters: {
      supplierId?: string;
      q?: string;
      supplierType?: SupplierType;
      active?: boolean;
      page: number;
      limit: number;
      skip: number;
    },
  ): Promise<PagedResult<ProductsBySupplierReportRow>> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const params: unknown[] = [branchIds];
    const clauses = [
      `(p.branch_id IS NULL OR p.branch_id = ANY($1::uuid[]))`,
    ];
    const supplierId = filters.supplierId?.trim();
    if (supplierId) {
      params.push(supplierId);
      clauses.push(`ps.supplier_id = $${params.length}::uuid`);
    }
    if (filters.supplierType) {
      params.push(filters.supplierType);
      clauses.push(`COALESCE(s.supplier_type, 'local') = $${params.length}`);
    }
    if (filters.active !== undefined) {
      params.push(filters.active);
      clauses.push(`COALESCE(s.active, TRUE) = $${params.length}`);
    }
    const q = filters.q?.trim();
    if (q) {
      params.push(`%${q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
      const pIndex = `$${params.length}`;
      clauses.push(
        `(s.name ILIKE ${pIndex} ESCAPE '\\' OR p.name ILIKE ${pIndex} ESCAPE '\\' OR p.item_no ILIKE ${pIndex} ESCAPE '\\')`,
      );
    }
    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c
         FROM product_suppliers ps
         JOIN suppliers s ON s.id = ps.supplier_id
         JOIN products p ON p.id = ps.product_id
         ${whereSql}`,
        ...params,
      );
      const items = await tx.$queryRawUnsafe<ProductsBySupplierReportRow[]>(
        `WITH latest_purchase AS (
           SELECT DISTINCT ON (p2.supplier_id, pi.product_id)
             p2.supplier_id,
             pi.product_id,
             p2.purchase_date AS last_purchase_date
           FROM purchase_items pi
           JOIN purchases p2 ON p2.id = pi.purchase_id
           WHERE p2.branch_id = ANY($1::uuid[])
             AND p2.supplier_id IS NOT NULL
             AND pi.product_id IS NOT NULL
           ORDER BY
             p2.supplier_id,
             pi.product_id,
             p2.purchase_date DESC NULLS LAST,
             p2.created_at DESC NULLS LAST,
             pi.id DESC
         )
         SELECT
           s.id AS "supplierId",
           s.name AS "supplierName",
           COALESCE(s.supplier_type, 'local') AS "supplierType",
           s.country,
           s.city,
           p.id AS "productId",
           p.item_no AS "itemNo",
           p.name AS "productName",
           ps.is_preferred AS "isPreferred",
           ps.last_cost_price AS "lastCostPrice",
           latest_purchase.last_purchase_date AS "lastPurchaseDate"
         FROM product_suppliers ps
         JOIN suppliers s ON s.id = ps.supplier_id
         JOIN products p ON p.id = ps.product_id
         LEFT JOIN latest_purchase
           ON latest_purchase.supplier_id = ps.supplier_id
          AND latest_purchase.product_id = ps.product_id
         ${whereSql}
         ORDER BY COALESCE(s.name, '') ASC, p.name ASC, p.item_no ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...params,
        filters.limit,
        filters.skip,
      );
      return toPagedResult(
        items,
        Number(countRow?.c ?? 0),
        filters.page,
        filters.limit,
      );
    });
  }

  async purchasesBySupplierReport(
    schemaName: string,
    branchIds: string[],
    filters: {
      supplierId?: string;
      q?: string;
      supplierType?: SupplierType;
      active?: boolean;
      from?: string;
      to?: string;
      page: number;
      limit: number;
      skip: number;
    },
  ): Promise<PagedResult<PurchasesBySupplierReportRow>> {
    return this.purchaseAggregateReport(schemaName, branchIds, filters, false);
  }

  async topSuppliersBySpendReport(
    schemaName: string,
    branchIds: string[],
    filters: {
      supplierId?: string;
      q?: string;
      supplierType?: SupplierType;
      active?: boolean;
      from?: string;
      to?: string;
      page: number;
      limit: number;
      skip: number;
    },
  ): Promise<PagedResult<TopSupplierSpendReportRow>> {
    return this.purchaseAggregateReport(schemaName, branchIds, filters, true);
  }

  private async purchaseAggregateReport(
    schemaName: string,
    branchIds: string[],
    filters: {
      supplierId?: string;
      q?: string;
      supplierType?: SupplierType;
      active?: boolean;
      from?: string;
      to?: string;
      page: number;
      limit: number;
      skip: number;
    },
    rankBySpend: false,
  ): Promise<PagedResult<PurchasesBySupplierReportRow>>;
  private async purchaseAggregateReport(
    schemaName: string,
    branchIds: string[],
    filters: {
      supplierId?: string;
      q?: string;
      supplierType?: SupplierType;
      active?: boolean;
      from?: string;
      to?: string;
      page: number;
      limit: number;
      skip: number;
    },
    rankBySpend: true,
  ): Promise<PagedResult<TopSupplierSpendReportRow>>;
  private async purchaseAggregateReport(
    schemaName: string,
    branchIds: string[],
    filters: {
      supplierId?: string;
      q?: string;
      supplierType?: SupplierType;
      active?: boolean;
      from?: string;
      to?: string;
      page: number;
      limit: number;
      skip: number;
    },
    rankBySpend: boolean,
  ): Promise<
    PagedResult<PurchasesBySupplierReportRow | TopSupplierSpendReportRow>
  > {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const params: unknown[] = [branchIds];
    const purchaseClauses = [
      `p.supplier_id IS NOT NULL`,
      `p.branch_id = ANY($1::uuid[])`,
    ];
    const from = filters.from?.trim();
    if (from) {
      params.push(from);
      purchaseClauses.push(`p.purchase_date >= $${params.length}::date`);
    }
    const to = filters.to?.trim();
    if (to) {
      params.push(to);
      purchaseClauses.push(`p.purchase_date <= $${params.length}::date`);
    }

    const supplierClauses: string[] = [];
    const supplierId = filters.supplierId?.trim();
    if (supplierId) {
      params.push(supplierId);
      supplierClauses.push(`s.id = $${params.length}::uuid`);
    }
    if (filters.supplierType) {
      params.push(filters.supplierType);
      supplierClauses.push(
        `COALESCE(s.supplier_type, 'local') = $${params.length}`,
      );
    }
    if (filters.active !== undefined) {
      params.push(filters.active);
      supplierClauses.push(`COALESCE(s.active, TRUE) = $${params.length}`);
    }
    const q = filters.q?.trim();
    if (q) {
      params.push(`%${q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
      const pIndex = `$${params.length}`;
      supplierClauses.push(
        `(s.name ILIKE ${pIndex} ESCAPE '\\' OR s.country ILIKE ${pIndex} ESCAPE '\\' OR s.city ILIKE ${pIndex} ESCAPE '\\')`,
      );
    }
    const supplierWhere = supplierClauses.length
      ? `WHERE ${supplierClauses.join(' AND ')}`
      : '';
    const baseCte = `
      WITH grouped AS (
        SELECT
          p.supplier_id,
          COUNT(*)::bigint AS purchase_count,
          COALESCE(SUM(COALESCE(p.total_amount, 0)), 0) AS total_purchase_amount,
          MAX(p.purchase_date) AS last_purchase_date
        FROM purchases p
        WHERE ${purchaseClauses.join(' AND ')}
        GROUP BY p.supplier_id
      ),
      report_rows AS (
        SELECT
          s.id AS "supplierId",
          s.name AS "supplierName",
          COALESCE(s.supplier_type, 'local') AS "supplierType",
          s.country,
          s.city,
          grouped.purchase_count AS "purchaseCount",
          grouped.total_purchase_amount AS "totalPurchaseAmount",
          grouped.last_purchase_date AS "lastPurchaseDate"
        FROM grouped
        JOIN suppliers s ON s.id = grouped.supplier_id
        ${supplierWhere}
      )`;
    const orderBy = rankBySpend
      ? `"totalPurchaseAmount" DESC, COALESCE("supplierName", '') ASC`
      : `COALESCE("supplierName", '') ASC`;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `${baseCte}
         SELECT COUNT(*)::bigint AS c FROM report_rows`,
        ...params,
      );
      const rankSelect = rankBySpend
        ? `DENSE_RANK() OVER (ORDER BY "totalPurchaseAmount" DESC) AS rank,`
        : '';
      const items = await tx.$queryRawUnsafe<
        Array<PurchasesBySupplierReportRow | TopSupplierSpendReportRow>
      >(
        `${baseCte}
         SELECT
           ${rankSelect}
           "supplierId",
           "supplierName",
           "supplierType",
           country,
           city,
           "purchaseCount",
           "totalPurchaseAmount",
           "lastPurchaseDate"
         FROM report_rows
         ORDER BY ${orderBy}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...params,
        filters.limit,
        filters.skip,
      );
      return toPagedResult(
        items,
        Number(countRow?.c ?? 0),
        filters.page,
        filters.limit,
      );
    });
  }

  private async assertSupplierExists(tx: TxLike, supplierId: string) {
    const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM suppliers WHERE id = $1::uuid`,
      supplierId,
    );
    if (!row) throw new NotFoundException('Supplier not found');
  }
}
