import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { TenantService } from '../tenant/tenant.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { UomsService } from '../uoms/uoms.service';
import { toPagedResult, type PagedResult } from '../common/pagination.util';
import {
  PURCHASE_HEADER_SELECT,
  PURCHASE_ITEM_SELECT,
  PurchasesWorkflowService,
  type PurchaseDraftHeaderInput,
} from './purchases-workflow.service';
import type { PurchaseWorkflowMode } from './purchase-workflow.types';
import {
  isPurchaseEditableStatus,
  purchaseHasPostedInventory,
  purchaseHasPostedInvoice,
} from './purchase-workflow.types';
import { syncPurchaseInvoiceFields } from './purchase-invoice-sync.util';

export type PurchaseMutationContext = {
  actorUserId?: string | null;
};

export interface PurchaseListRow {
  id: string;
  supplier_id: string | null;
  branch_id: string;
  invoice_number: string | null;
  supplier_invoice_no: string | null;
  purchase_order_no: string | null;
  status: string;
  total_amount: number | string | null;
  purchase_date: Date | string | null;
  on_credit: boolean;
  created_at: Date;
  item_count: number;
}

export interface PurchaseRow {
  id: string;
  supplier_id: string | null;
  branch_id: string;
  invoice_number: string | null;
  supplier_invoice_no?: string | null;
  purchase_order_no?: string | null;
  total_amount: number | string | null;
  purchase_date: Date | string | null;
  order_date?: Date | string | null;
  posting_date?: Date | string | null;
  due_date?: Date | string | null;
  status?: string;
  notes?: string | null;
  on_credit: boolean;
  released_at?: Date | string | null;
  received_at?: Date | string | null;
  invoiced_at?: Date | string | null;
  created_at: Date;
}

export interface PurchaseItemDetailRow {
  id: string;
  purchase_id: string;
  branch_id: string;
  product_id: string | null;
  batch_id: string | null;
  uom_id?: string | null;
  quantity: number | string;
  quantity_received: number | string;
  conversion_factor_snapshot?: number | string;
  base_quantity?: number | string;
  base_unit_cost?: number | string | null;
  cost_price: number | string | null;
  selling_price: number | string | null;
  update_selling_price?: boolean;
  expiry_date: Date | string | null;
  batch_number: string | null;
  line_discount?: number | string | null;
  tax_amount?: number | string | null;
  line_notes?: string | null;
  planned_batch_number?: string | null;
  planned_expiry_date?: Date | string | null;
  uom_code?: string | null;
  uom_symbol?: string | null;
  item_no?: string | null;
  product_name?: string | null;
}

export interface PurchaseBatchShortRow {
  id: string;
  branch_id: string;
  product_id: string;
  quantity: number | string;
}

export interface PurchaseUpdateRow {
  id: string;
  supplier_id: string | null;
  branch_id: string;
  invoice_number: string | null;
  total_amount: number | string | null;
  purchase_date: Date | string | null;
  created_at: Date;
}

export interface PurchaseItemRevertRow {
  id: string;
  branch_id: string;
  product_id: string | null;
  batch_id: string | null;
  quantity: number | string;
  base_quantity?: number | string;
  cost_price: number | string | null;
}

export interface BatchIdQtyLockRow {
  id: string;
  quantity: number | string;
}

export interface PurchaseRefundInsertRow {
  id: string;
  branch_id: string;
  purchase_id: string;
  amount: number | string;
  refund_date: Date | string;
  on_credit: boolean;
  notes: string | null;
  created_at: Date;
}

export interface PurchaseLockRow {
  id: string;
  branch_id: string;
  purchase_date: Date | string | null;
  created_at: Date;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly tenantService: TenantService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly workflow: PurchasesWorkflowService,
    private readonly uomsService: UomsService,
  ) {}

  private toDraftInput(dto: {
    supplierId?: string;
    invoiceNumber?: string;
    supplierInvoiceNo?: string;
    purchaseOrderNo?: string;
    totalAmount?: number;
    purchaseDate?: string;
    orderDate?: string;
    postingDate?: string;
    dueDate?: string;
    notes?: string;
    onCredit?: boolean;
    items: Array<{
      productId: string;
      uomId?: string;
      quantity: number;
      batchNumber?: string;
      costPrice?: number;
      sellingPrice?: number;
      updateSellingPrice?: boolean;
      expiryDate?: string;
      lineDiscount?: number;
      taxAmount?: number;
      lineNotes?: string;
    }>;
  }): PurchaseDraftHeaderInput {
    return {
      supplierId: dto.supplierId,
      invoiceNumber: dto.invoiceNumber,
      supplierInvoiceNo: dto.supplierInvoiceNo,
      purchaseOrderNo: dto.purchaseOrderNo,
      totalAmount: dto.totalAmount,
      purchaseDate: dto.purchaseDate,
      orderDate: dto.orderDate,
      postingDate: dto.postingDate,
      dueDate: dto.dueDate,
      notes: dto.notes,
      onCredit: dto.onCredit,
      items: dto.items.map((i) => ({
        productId: i.productId,
        uomId: i.uomId,
        quantity: i.quantity,
        batchNumber: i.batchNumber,
        costPrice: i.costPrice,
        sellingPrice: i.sellingPrice,
        updateSellingPrice: i.updateSellingPrice,
        expiryDate: i.expiryDate,
        lineDiscount: i.lineDiscount,
        taxAmount: i.taxAmount,
        lineNotes: i.lineNotes,
      })),
    };
  }

  async findAll(schemaName: string, allowedBranchIds: string[]) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<PurchaseListRow[]>(
        `SELECT p.id,
                p.supplier_id,
                p.branch_id,
                p.invoice_number,
                p.supplier_invoice_no,
                p.purchase_order_no,
                p.status,
                p.total_amount,
                p.purchase_date,
                p.on_credit,
                p.created_at,
                (
                  SELECT COUNT(*)::int
                  FROM purchase_items pi
                  WHERE pi.purchase_id = p.id
                ) AS item_count
         FROM purchases p
         WHERE p.branch_id = ANY($1::uuid[])
         ORDER BY p.purchase_date DESC NULLS LAST, p.created_at DESC`,
        allowedBranchIds,
      ),
    );
  }

  async findAllPaged(
    schemaName: string,
    allowedBranchIds: string[],
    skip: number,
    take: number,
  ): Promise<PagedResult<PurchaseListRow>> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM purchases p WHERE p.branch_id = ANY($1::uuid[])`,
        allowedBranchIds,
      );
      const total = Number(countRow?.c ?? 0);
      const items = await tx.$queryRawUnsafe<PurchaseListRow[]>(
        `SELECT p.id,
                p.supplier_id,
                p.branch_id,
                p.invoice_number,
                p.supplier_invoice_no,
                p.purchase_order_no,
                p.status,
                p.total_amount,
                p.purchase_date,
                p.on_credit,
                p.created_at,
                (
                  SELECT COUNT(*)::int
                  FROM purchase_items pi
                  WHERE pi.purchase_id = p.id
                ) AS item_count
         FROM purchases p
         WHERE p.branch_id = ANY($1::uuid[])
         ORDER BY p.purchase_date DESC NULLS LAST, p.created_at DESC
         LIMIT $2 OFFSET $3`,
        allowedBranchIds,
        take,
        skip,
      );
      const page = Math.floor(skip / take) + 1;
      return toPagedResult(items, total, page, take);
    });
  }

  /** Row shape for line-pricing-by-product (catalog + purchase lines). */
  private static readonly LINE_PRICING_ROW_SQL = `
         WITH selected_supplier_name AS (
           SELECT id, name
           FROM suppliers
           WHERE $2::uuid IS NOT NULL
             AND id = $2::uuid
         ),
         selected_uom AS (
           SELECT DISTINCT ON (pu.product_id)
             pu.product_id,
             pu.uom_id,
             u.code AS uom_code,
             u.symbol AS uom_symbol,
             pu.conversion_factor_to_base
           FROM product_uoms pu
           JOIN uoms u ON u.id = pu.uom_id AND u.active IS TRUE
           WHERE pu.is_active IS TRUE
             AND ($3::uuid IS NULL OR pu.product_id = $3::uuid)
             AND ($4::uuid IS NULL OR pu.uom_id = $4::uuid)
           ORDER BY
             pu.product_id,
             CASE
               WHEN $4::uuid IS NOT NULL THEN 0
               WHEN pu.is_purchase_default IS TRUE THEN 0
               WHEN pu.is_base IS TRUE THEN 1
               ELSE 2
             END,
             pu.conversion_factor_to_base ASC,
             pu.id ASC
         ),
         base_uom AS (
           SELECT DISTINCT ON (pu.product_id)
             pu.product_id,
             pu.uom_id AS base_uom_id,
             u.code AS base_uom_code,
             u.symbol AS base_uom_symbol
           FROM product_uoms pu
           JOIN uoms u ON u.id = pu.uom_id AND u.active IS TRUE
           WHERE pu.is_active IS TRUE
             AND pu.is_base IS TRUE
             AND ($3::uuid IS NULL OR pu.product_id = $3::uuid)
           ORDER BY pu.product_id, pu.id ASC
         ),
         uom_price AS (
           SELECT DISTINCT ON (pup.product_id, pup.uom_id)
             pup.product_id,
             pup.uom_id,
             pup.selling_price,
             pup.cost_price,
             pup.initial_cost_price,
             pup.last_purchase_cost,
             pup.last_purchase_at
           FROM product_uom_prices pup
           WHERE pup.active IS TRUE
           ORDER BY pup.product_id, pup.uom_id, pup.updated_at DESC NULLS LAST, pup.created_at DESC
         ),
         base_uom_price AS (
           SELECT DISTINCT ON (pup.product_id)
             pup.product_id,
             pup.cost_price,
             pup.last_purchase_cost
           FROM product_uom_prices pup
           JOIN product_uoms pu
             ON pu.product_id = pup.product_id
            AND pu.uom_id = pup.uom_id
           WHERE pup.active IS TRUE
             AND pu.is_base IS TRUE
             AND pu.is_active IS TRUE
           ORDER BY pup.product_id, pup.updated_at DESC NULLS LAST, pup.created_at DESC
         ),
         default_group AS (
           SELECT id
           FROM price_groups
           WHERE is_default IS TRUE
             AND active IS TRUE
           ORDER BY updated_at DESC NULLS LAST, created_at DESC
           LIMIT 1
         ),
         default_group_price AS (
           SELECT DISTINCT ON (pgp.product_id, pgp.uom_id)
             pgp.product_id,
             pgp.uom_id,
             pgp.selling_price
           FROM product_price_group_prices pgp
           JOIN default_group dg ON dg.id = pgp.price_group_id
           WHERE pgp.active IS TRUE
           ORDER BY pgp.product_id, pgp.uom_id, pgp.updated_at DESC NULLS LAST, pgp.created_at DESC
         ),
         supplier_uom_cost AS (
           SELECT
             product_id,
             supplier_id,
             uom_id,
             current_cost_price,
             last_purchase_cost,
             last_purchase_at
           FROM product_supplier_uom_costs
           WHERE $2::uuid IS NOT NULL
             AND supplier_id = $2::uuid
         ),
         preferred_supplier AS (
           SELECT DISTINCT ON (ps.product_id)
             ps.product_id,
             ps.supplier_id,
             s.name AS supplier_name,
             ps.last_cost_price
           FROM product_suppliers ps
           JOIN suppliers s ON s.id = ps.supplier_id
           WHERE ps.is_preferred
           ORDER BY ps.product_id, ps.updated_at DESC NULLS LAST, ps.id DESC
         ),
         selected_supplier AS (
           SELECT
             ps.product_id,
             ps.supplier_id,
             s.name AS supplier_name,
             ps.last_cost_price
           FROM product_suppliers ps
           JOIN suppliers s ON s.id = ps.supplier_id
           WHERE $2::uuid IS NOT NULL
             AND ps.supplier_id = $2::uuid
         ),
         supplier_purchase_line AS (
           SELECT DISTINCT ON (pi.product_id, pi.uom_id)
             pi.product_id,
             pi.uom_id,
             pi.cost_price
           FROM purchase_items pi
           JOIN purchases p ON p.id = pi.purchase_id
           WHERE $2::uuid IS NOT NULL
             AND p.supplier_id = $2::uuid
             AND pi.product_id IS NOT NULL
             AND pi.uom_id IS NOT NULL
             AND pi.cost_price IS NOT NULL
             AND COALESCE(pi.branch_id, p.branch_id) = ANY($1::uuid[])
             AND COALESCE(p.status, 'draft') IN ('invoiced', 'closed')
           ORDER BY
             pi.product_id,
             pi.uom_id,
             p.posting_date DESC NULLS LAST,
             p.purchase_date DESC NULLS LAST,
             p.created_at DESC NULLS LAST,
             pi.id DESC
         ),
         generic_purchase_line AS (
           SELECT DISTINCT ON (pi.product_id, pi.uom_id)
             pi.product_id,
             pi.uom_id,
             pi.cost_price
           FROM purchase_items pi
           JOIN purchases p ON p.id = pi.purchase_id
           WHERE pi.product_id IS NOT NULL
             AND pi.uom_id IS NOT NULL
             AND pi.cost_price IS NOT NULL
             AND COALESCE(pi.branch_id, p.branch_id) = ANY($1::uuid[])
             AND COALESCE(p.status, 'draft') IN ('invoiced', 'closed')
           ORDER BY
             pi.product_id,
             pi.uom_id,
             p.posting_date DESC NULLS LAST,
             p.purchase_date DESC NULLS LAST,
             p.created_at DESC NULLS LAST,
             pi.id DESC
         ),
         purchase_line_batch AS (
           SELECT DISTINCT ON (pi.product_id)
             pi.product_id,
             COALESCE(
               NULLIF(TRIM(b.batch_number), ''),
               NULLIF(TRIM(pi.planned_batch_number), '')
             ) AS batch_number,
             COALESCE(
               pi.expiry_date,
               pi.planned_expiry_date,
               b.expiry_date
             ) AS expiry_date
           FROM purchase_items pi
           JOIN purchases p ON p.id = pi.purchase_id
           LEFT JOIN batches b ON b.id = pi.batch_id
           WHERE pi.product_id IS NOT NULL
             AND COALESCE(pi.branch_id, p.branch_id) = ANY($1::uuid[])
             AND (
               (b.batch_number IS NOT NULL AND TRIM(b.batch_number) <> '')
               OR (pi.planned_batch_number IS NOT NULL AND TRIM(pi.planned_batch_number) <> '')
             )
           ORDER BY
             pi.product_id,
             p.purchase_date DESC NULLS LAST,
             pi.id DESC
         ),
         latest_batch AS (
           SELECT DISTINCT ON (b.product_id)
             b.product_id,
             b.batch_number,
             b.expiry_date,
             b.cost_price,
             b.selling_price
           FROM batches b
           WHERE b.product_id IS NOT NULL
             AND b.branch_id = ANY($1::uuid[])
           ORDER BY
             b.product_id,
             CASE
               WHEN b.batch_number IS NOT NULL AND TRIM(b.batch_number) <> ''
               THEN 0
               ELSE 1
             END,
             b.created_at DESC NULLS LAST,
             b.id DESC
         ),
         batch_pricing AS (
           SELECT
             b.product_id,
             CASE
               WHEN SUM(CASE WHEN COALESCE(b.quantity, 0) > 0 THEN b.quantity ELSE 0 END) > 0
               THEN NULLIF((
                 SUM(CASE WHEN COALESCE(b.quantity, 0) > 0 THEN b.quantity * COALESCE(b.cost_price, 0) ELSE 0 END)
                 / NULLIF(SUM(CASE WHEN COALESCE(b.quantity, 0) > 0 THEN b.quantity ELSE 0 END), 0)
               ), 0)
               ELSE MAX(b.cost_price)
             END AS cost_price,
             (ARRAY_AGG(b.selling_price ORDER BY b.created_at DESC, b.id DESC)
                FILTER (WHERE b.selling_price IS NOT NULL AND b.selling_price > 0))[1] AS selling_price
           FROM batches b
           WHERE b.product_id IS NOT NULL
             AND b.branch_id = ANY($1::uuid[])
           GROUP BY b.product_id
         )
         SELECT
           pr.id AS product_id,
           su.uom_id,
           su.uom_code,
           su.uom_symbol,
           bu.base_uom_id,
           bu.base_uom_code,
           bu.base_uom_symbol,
           COALESCE(su.conversion_factor_to_base, 1) AS conversion_factor_to_base,
           COALESCE(
             NULLIF(suc.last_purchase_cost, 0),
             NULLIF(suc.current_cost_price, 0),
             base_up.last_purchase_cost * COALESCE(su.conversion_factor_to_base, 1),
             base_up.cost_price * COALESCE(su.conversion_factor_to_base, 1),
             NULLIF(spl.cost_price, 0),
             NULLIF(gpl.cost_price, 0),
             NULLIF(sel.last_cost_price, 0) * COALESCE(su.conversion_factor_to_base, 1),
             NULLIF(pref.last_cost_price, 0) * COALESCE(su.conversion_factor_to_base, 1),
             bp.cost_price * COALESCE(su.conversion_factor_to_base, 1),
             lb.cost_price * COALESCE(su.conversion_factor_to_base, 1)
           ) AS cost_price,
           COALESCE(
             NULLIF(dgp.selling_price, 0),
             NULLIF(up.selling_price, 0),
             bp.selling_price * COALESCE(su.conversion_factor_to_base, 1),
             NULLIF(lb.selling_price, 0) * COALESCE(su.conversion_factor_to_base, 1),
             pr.list_price * COALESCE(su.conversion_factor_to_base, 1)
           ) AS selling_price,
           CASE
             WHEN suc.last_purchase_cost IS NOT NULL THEN 'supplier_uom_last_purchase_cost'
             WHEN suc.current_cost_price IS NOT NULL THEN 'supplier_uom_current_cost'
             WHEN base_up.last_purchase_cost IS NOT NULL THEN 'product_uom_last_purchase_cost'
             WHEN base_up.cost_price IS NOT NULL THEN 'product_uom_current_cost'
             WHEN spl.cost_price IS NOT NULL THEN 'supplier_purchase_line'
             WHEN gpl.cost_price IS NOT NULL THEN 'purchase_line'
             WHEN sel.last_cost_price IS NOT NULL THEN 'supplier_product_legacy'
             WHEN pref.last_cost_price IS NOT NULL THEN 'preferred_supplier_legacy'
             WHEN bp.cost_price IS NOT NULL THEN 'batch_average'
             WHEN lb.cost_price IS NOT NULL THEN 'batch_latest'
             ELSE NULL
           END AS cost_price_source,
           CASE
             WHEN dgp.selling_price IS NOT NULL THEN 'default_price_group'
             WHEN up.selling_price IS NOT NULL THEN 'product_uom_selling_price'
             WHEN bp.selling_price IS NOT NULL THEN 'batch_average'
             WHEN lb.selling_price IS NOT NULL THEN 'batch_latest'
             WHEN pr.list_price IS NOT NULL THEN 'legacy_list_price'
             ELSE NULL
           END AS selling_price_source,
           COALESCE(
             NULLIF(TRIM(lb.batch_number), ''),
             NULLIF(TRIM(plb.batch_number), '')
           ) AS batch_number,
           COALESCE(lb.expiry_date, plb.expiry_date) AS expiry_date,
           COALESCE($2::uuid, suc.supplier_id, sel.supplier_id, pref.supplier_id, pr.supplier_id) AS supplier_id,
           COALESCE(ssn.name, sel.supplier_name, pref.supplier_name, ps.name) AS supplier_name
         FROM products pr
         LEFT JOIN selected_uom su ON su.product_id = pr.id
         LEFT JOIN base_uom bu ON bu.product_id = pr.id
         LEFT JOIN uom_price up ON up.product_id = pr.id AND up.uom_id = su.uom_id
         LEFT JOIN base_uom_price base_up ON base_up.product_id = pr.id
         LEFT JOIN default_group_price dgp ON dgp.product_id = pr.id AND dgp.uom_id = su.uom_id
         LEFT JOIN supplier_uom_cost suc ON suc.product_id = pr.id AND suc.uom_id = su.uom_id
         LEFT JOIN selected_supplier sel ON sel.product_id = pr.id
         LEFT JOIN selected_supplier_name ssn ON TRUE
         LEFT JOIN preferred_supplier pref ON pref.product_id = pr.id
         LEFT JOIN supplier_purchase_line spl ON spl.product_id = pr.id AND spl.uom_id = su.uom_id
         LEFT JOIN generic_purchase_line gpl ON gpl.product_id = pr.id AND gpl.uom_id = su.uom_id
         LEFT JOIN latest_batch lb ON lb.product_id = pr.id
         LEFT JOIN purchase_line_batch plb ON plb.product_id = pr.id
         LEFT JOIN batch_pricing bp ON bp.product_id = pr.id
         LEFT JOIN suppliers ps ON ps.id = pr.supplier_id
         WHERE (pr.branch_id IS NULL OR pr.branch_id = ANY($1::uuid[]))
           AND ($3::uuid IS NULL OR pr.id = $3::uuid)
           AND ($4::uuid IS NULL OR su.uom_id IS NOT NULL)`;

  private mapLinePricingRow(row: {
    product_id: string;
    uom_id?: string | null;
    uom_code?: string | null;
    uom_symbol?: string | null;
    base_uom_id?: string | null;
    base_uom_code?: string | null;
    base_uom_symbol?: string | null;
    conversion_factor_to_base?: unknown;
    cost_price: unknown;
    selling_price: unknown;
    cost_price_source?: string | null;
    selling_price_source?: string | null;
    batch_number: string | null;
    expiry_date: Date | string | null;
    supplier_id: string | null;
    supplier_name: string | null;
  }) {
    const expiry = row.expiry_date;
    return {
      product_id: row.product_id,
      uom_id: row.uom_id ?? null,
      uom_code: row.uom_code ?? null,
      uom_symbol: row.uom_symbol ?? null,
      base_uom_id: row.base_uom_id ?? null,
      base_uom_code: row.base_uom_code ?? null,
      base_uom_symbol: row.base_uom_symbol ?? null,
      conversion_factor_to_base: row.conversion_factor_to_base ?? 1,
      cost_price: row.cost_price ?? null,
      selling_price: row.selling_price ?? null,
      cost_price_source: row.cost_price_source ?? null,
      selling_price_source: row.selling_price_source ?? null,
      batch_number: row.batch_number ?? null,
      expiry_date:
        expiry == null
          ? null
          : typeof expiry === 'string'
            ? expiry.slice(0, 10)
            : expiry.toISOString().slice(0, 10),
      supplier_id: row.supplier_id ?? null,
      supplier_name: row.supplier_name ?? null,
    };
  }

  private async queryLinePricingRows(
    schemaName: string,
    allowedBranchIds: string[],
    productId?: string,
    supplierId?: string | null,
    uomId?: string | null,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const orderBy = productId ? '' : ` ORDER BY pr.name ASC`;
    const sql = PurchasesService.LINE_PRICING_ROW_SQL + orderBy;
    const params = [
      allowedBranchIds,
      supplierId ?? null,
      productId ?? null,
      uomId ?? null,
    ];
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          product_id: string;
          uom_id: string | null;
          uom_code: string | null;
          uom_symbol: string | null;
          base_uom_id: string | null;
          base_uom_code: string | null;
          base_uom_symbol: string | null;
          conversion_factor_to_base: unknown;
          cost_price: unknown;
          selling_price: unknown;
          cost_price_source: string | null;
          selling_price_source: string | null;
          batch_number: string | null;
          expiry_date: Date | string | null;
          supplier_id: string | null;
          supplier_name: string | null;
        }>
      >(sql, ...params),
    );
    return rows.map((row) => this.mapLinePricingRow(row));
  }

  /**
   * Product pricing for the items catalog.
   * Inventory batch cost/batch first, then posted purchases, then list price (sell).
   */
  async findLinePricingByProduct(
    schemaName: string,
    allowedBranchIds: string[],
    supplierId?: string | null,
  ) {
    return this.queryLinePricingRows(schemaName, allowedBranchIds, undefined, supplierId);
  }

  /** Pricing for one product (purchase line form). */
  async findLinePricingForProduct(
    schemaName: string,
    allowedBranchIds: string[],
    productId: string,
    supplierId?: string | null,
    uomId?: string | null,
  ) {
    const rows = await this.queryLinePricingRows(
      schemaName,
      allowedBranchIds,
      productId,
      supplierId,
      uomId,
    );
    return rows[0] ?? null;
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<PurchaseRow[]>(
        `SELECT ${PURCHASE_HEADER_SELECT}
         FROM purchases p
         WHERE p.id = $1 AND p.branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!row) return null;

      const items = await tx.$queryRawUnsafe<PurchaseItemDetailRow[]>(
        `SELECT ${PURCHASE_ITEM_SELECT}
         FROM purchase_items pi
         LEFT JOIN batches b ON b.id = pi.batch_id
         LEFT JOIN uoms u ON u.id = pi.uom_id
         LEFT JOIN products pr ON pr.id = pi.product_id
         WHERE pi.purchase_id = $1
         ORDER BY pi.id`,
        id,
      );

      return { ...row, items };
    });
  }

  async create(
    schemaName: string,
    branchId: string,
    dto: {
      workflow?: PurchaseWorkflowMode;
      supplierId?: string;
      invoiceNumber?: string;
      supplierInvoiceNo?: string;
      purchaseOrderNo?: string;
      totalAmount?: number;
      purchaseDate?: string;
      orderDate?: string;
      postingDate?: string;
      dueDate?: string;
      notes?: string;
      onCredit?: boolean;
      items: Array<{
        productId: string;
        uomId?: string;
        quantity: number;
        batchNumber?: string;
        costPrice?: number;
        sellingPrice?: number;
        updateSellingPrice?: boolean;
        expiryDate?: string;
        lineDiscount?: number;
        taxAmount?: number;
        lineNotes?: string;
      }>;
    },
    ctx?: PurchaseMutationContext,
    businessType = 'pharmacy',
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const mode = dto.workflow ?? 'immediate';
    const draftInput = this.toDraftInput(dto);
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (mode === 'draft') {
        return this.workflow.createPurchaseDraftInTx(
          tx,
          branchId,
          draftInput,
          ctx,
        );
      }
      return this.workflow.createPurchaseImmediateInTx(
        tx,
        branchId,
        draftInput,
        ctx,
      );
    });
    if (mode !== 'draft') {
      await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
        schemaName,
        branchIds: [branchId],
      });
    }
    return row;
  }

  /** Used by import commit when receive_on_import / legacy immediate paths. */
  async createInTransaction(
    tx: Prisma.TransactionClient,
    branchId: string,
    dto: {
      supplierId?: string;
      invoiceNumber?: string;
      supplierInvoiceNo?: string;
      purchaseOrderNo?: string;
      totalAmount?: number;
      purchaseDate?: string;
      orderDate?: string;
      postingDate?: string;
      dueDate?: string;
      notes?: string;
      onCredit?: boolean;
      workflow?: PurchaseWorkflowMode;
      items: Array<{
        productId: string;
        uomId?: string;
        quantity: number;
        batchNumber?: string;
        costPrice?: number;
        sellingPrice?: number;
        updateSellingPrice?: boolean;
        expiryDate?: string;
        lineDiscount?: number;
        taxAmount?: number;
        lineNotes?: string;
      }>;
    },
    ctx?: PurchaseMutationContext,
    opts?: { businessType?: string; receiveAndInvoice?: boolean },
  ): Promise<PurchaseRow> {
    const draftInput = this.toDraftInput(dto);
    const mode =
      dto.workflow ?? (opts?.receiveAndInvoice === false ? 'draft' : 'immediate');

    if (mode === 'draft') {
      return this.workflow.createPurchaseDraftInTx(
        tx,
        branchId,
        draftInput,
        ctx,
      );
    }
    return this.workflow.createPurchaseImmediateInTx(
      tx,
      branchId,
      draftInput,
      ctx,
    );
  }

  async createPurchaseDraftInTx(
    tx: Prisma.TransactionClient,
    branchId: string,
    dto: PurchaseDraftHeaderInput,
    ctx?: PurchaseMutationContext,
  ) {
    return this.workflow.createPurchaseDraftInTx(tx, branchId, dto, ctx);
  }

  async receivePurchaseInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    allowedBranchIds: string[],
    opts: { businessType?: string },
    ctx?: PurchaseMutationContext,
  ) {
    return this.workflow.receivePurchaseInTx(
      tx,
      purchaseId,
      allowedBranchIds,
      opts,
      ctx,
    );
  }

  async postPurchaseInvoiceInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    return this.workflow.postPurchaseInvoiceInTx(
      tx,
      purchaseId,
      allowedBranchIds,
      ctx,
    );
  }

  async release(
    schemaName: string,
    purchaseId: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, (tx) =>
      this.workflow.releasePurchaseInTx(tx, purchaseId, allowedBranchIds, ctx),
    );
    return row;
  }

  async receive(
    schemaName: string,
    purchaseId: string,
    allowedBranchIds: string[],
    businessType: string,
    ctx?: PurchaseMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, (tx) =>
      this.workflow.receivePurchaseInTx(
        tx,
        purchaseId,
        allowedBranchIds,
        { businessType },
        ctx,
      ),
    );
    await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
      schemaName,
      branchIds: [row.branch_id],
    });
    return row;
  }

  async postInvoice(
    schemaName: string,
    purchaseId: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, (tx) =>
      this.workflow.postPurchaseInvoiceInTx(
        tx,
        purchaseId,
        allowedBranchIds,
        ctx,
      ),
    );
    await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
      schemaName,
      branchIds: [row.branch_id],
    });
    return row;
  }

  async close(
    schemaName: string,
    purchaseId: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      this.workflow.closePurchaseInTx(tx, purchaseId, allowedBranchIds, ctx),
    );
  }

  async cancel(
    schemaName: string,
    purchaseId: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const out = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const purchase = await this.workflow.loadPurchaseForWorkflow(
        tx,
        purchaseId,
        allowedBranchIds,
      );
      if (!purchase) throw new BadRequestException('Purchase not found');
      return this.workflow.cancelPurchaseInTx(
        tx,
        purchaseId,
        allowedBranchIds,
        (t, p) => this.revertPurchaseItemsStock(t, p),
        async (t, p) => {
          const invTotal = Number(p.total_amount ?? 0);
          if (invTotal <= 0) return;
          const entryDate =
            p.posting_date ?? p.purchase_date ?? p.created_at ?? new Date();
          await this.accountingPosting.reversePurchaseJournal(t, {
            branchId: p.branch_id,
            purchaseId: String(p.id),
            inventoryTotal: invTotal,
            entryDate,
            onCredit: Boolean(p.on_credit),
            supplierId: p.supplier_id ?? null,
          });
        },
        ctx,
      );
    });
    await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
      schemaName,
      branchIds: allowedBranchIds,
    });
    return out;
  }

  async revertInTransaction(
    tx: Prisma.TransactionClient,
    purchase: PurchaseRow,
    ctx?: PurchaseMutationContext,
  ): Promise<{ itemsReverted: number }> {
    const [full] = await tx.$queryRawUnsafe<
      Array<PurchaseRow & { status: string }>
    >(
      `SELECT ${PURCHASE_HEADER_SELECT} FROM purchases p WHERE p.id = $1::uuid`,
      purchase.id,
    );
    const p = full ?? purchase;
    const status = p.status ?? 'closed';

    const entryDateForLock =
      p.posting_date ?? p.purchase_date ?? p.created_at ?? new Date();
    await this.lockDates.assertDocumentDateOpen(
      tx,
      p.branch_id,
      entryDateForLock,
    );

    let itemCount = 0;
    if (purchaseHasPostedInventory(status)) {
      itemCount = await this.revertPurchaseItemsStock(tx, {
        id: p.id,
        branch_id: p.branch_id,
      });
    } else {
      await tx.$queryRawUnsafe(
        `DELETE FROM purchase_items WHERE purchase_id = $1::uuid`,
        p.id,
      );
    }

    const invTotal = Number(p.total_amount ?? 0);
    const entryDate =
      p.posting_date ?? p.purchase_date ?? p.created_at ?? new Date();
    if (invTotal > 0 && purchaseHasPostedInvoice(status)) {
      await this.accountingPosting.reversePurchaseJournal(tx, {
        branchId: p.branch_id,
        purchaseId: String(p.id),
        inventoryTotal: invTotal,
        entryDate,
        onCredit: Boolean(p.on_credit),
        supplierId: p.supplier_id ?? null,
      });
    }

    await tx.$queryRawUnsafe(`DELETE FROM purchases WHERE id = $1::uuid`, p.id);

    await this.auditLog.append(tx, {
      branchId: purchase.branch_id,
      actorUserId: ctx?.actorUserId ?? null,
      tableName: 'purchases',
      recordId: purchase.id,
      action: 'import_reverse',
      entityType: 'purchase',
      entityId: purchase.id,
      oldPayload: { itemsReverted: itemCount },
    });

    return { itemsReverted: itemCount };
  }

  async update(
    schemaName: string,
    id: string,
    branchId: string,
    allowedBranchIds: string[],
    dto: {
      supplierId?: string;
      invoiceNumber?: string;
      supplierInvoiceNo?: string;
      purchaseOrderNo?: string;
      totalAmount?: number;
      purchaseDate?: string;
      orderDate?: string;
      postingDate?: string;
      dueDate?: string;
      notes?: string;
      items?: Array<{
        productId: string;
        uomId?: string;
        quantity: number;
        batchNumber?: string;
        costPrice?: number;
        sellingPrice?: number;
        updateSellingPrice?: boolean;
        expiryDate?: string;
        lineDiscount?: number;
        taxAmount?: number;
        lineNotes?: string;
      }>;
    },
    ctx?: PurchaseMutationContext,
  ) {
    if (dto.items?.length) {
      await this.tenantService.applyTenantSchemaPatches(schemaName);
      const updated = await this.prisma.withTenantSchema(
        schemaName,
        async (tx) =>
          this.updateDraftWithItemsInTx(
            tx,
            id,
            branchId,
            allowedBranchIds,
            { ...dto, items: dto.items! },
            ctx,
          ),
      );
      if (updated?.branch_id) {
        await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
          schemaName,
          branchIds: [updated.branch_id],
        });
      }
      return updated;
    }
    const updatedPurchase = await this.prisma.withTenantSchema(
      schemaName,
      async (tx) => {
        const [existing] = await tx.$queryRawUnsafe<
          {
            id: string;
            branch_id: string;
            purchase_date: Date | string | null;
            created_at: Date | string | null;
          }[]
        >(
          `SELECT id, branch_id, purchase_date, created_at
         FROM purchases
         WHERE id = $1::uuid AND branch_id = ANY($2::uuid[])`,
          id,
          allowedBranchIds,
        );
        if (!existing) {
          return null;
        }
        const priorDate =
          existing.purchase_date != null
            ? existing.purchase_date
            : (existing.created_at ?? new Date());
        await this.lockDates.assertDocumentDateOpen(
          tx,
          existing.branch_id,
          priorDate,
        );
        const newDateRaw = dto.purchaseDate?.trim();
        if (newDateRaw) {
          await this.lockDates.assertDocumentDateOpen(
            tx,
            branchId,
            newDateRaw.slice(0, 10),
          );
        }

        const [existingHeader] = await tx.$queryRawUnsafe<
          Array<{ status: string; invoice_number: string | null; supplier_invoice_no: string | null }>
        >(
          `SELECT status, invoice_number, supplier_invoice_no FROM purchases WHERE id = $1::uuid`,
          id,
        );
        if (!existingHeader) {
          return null;
        }
        const invoices = syncPurchaseInvoiceFields({
          invoiceNumber: dto.invoiceNumber ?? existingHeader.invoice_number,
          supplierInvoiceNo:
            dto.supplierInvoiceNo ?? existingHeader.supplier_invoice_no,
        });
        const [row] = await tx.$queryRawUnsafe<PurchaseUpdateRow[]>(
          `UPDATE purchases
         SET supplier_id = COALESCE($2, supplier_id),
             branch_id = $3,
             invoice_number = COALESCE($4, invoice_number),
             supplier_invoice_no = COALESCE($5, supplier_invoice_no),
             purchase_order_no = COALESCE($6, purchase_order_no),
             total_amount = COALESCE($7, total_amount),
             purchase_date = COALESCE($8, purchase_date),
             order_date = COALESCE($9, order_date),
             posting_date = COALESCE($10, posting_date),
             due_date = COALESCE($11, due_date),
             notes = COALESCE($12, notes)
         WHERE id = $1 AND branch_id = ANY($13::uuid[])
         RETURNING id, supplier_id, branch_id, invoice_number, total_amount, purchase_date, created_at`,
          id,
          dto.supplierId ?? null,
          branchId,
          invoices.invoice_number,
          invoices.supplier_invoice_no,
          dto.purchaseOrderNo?.trim() || null,
          dto.totalAmount ?? null,
          dto.purchaseDate ?? null,
          dto.orderDate?.trim()?.slice(0, 10) ?? null,
          dto.postingDate?.trim()?.slice(0, 10) ?? null,
          dto.dueDate?.trim()?.slice(0, 10) ?? null,
          dto.notes?.trim() ?? null,
          allowedBranchIds,
        );
        if (row) {
          await this.workflow.upsertSupplierLinksForPurchaseInTx(tx, row.id);
          await this.auditLog.append(tx, {
            branchId: row.branch_id,
            actorUserId: ctx?.actorUserId ?? null,
            tableName: 'purchases',
            recordId: row.id,
            action: 'update',
            newPayload: {
              invoice_number: row.invoice_number,
              total_amount: row.total_amount,
              purchase_date: row.purchase_date,
            },
          });
        }
        return row ?? null;
      },
    );
    if (updatedPurchase?.branch_id) {
      await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
        schemaName,
        branchIds: [updatedPurchase.branch_id],
      });
    }
    return updatedPurchase;
  }

  async remove(
    schemaName: string,
    id: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    const out = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [purchase] = await tx.$queryRawUnsafe<
        Array<PurchaseRow & { status: string }>
      >(
        `SELECT ${PURCHASE_HEADER_SELECT}
         FROM purchases p
         WHERE p.id = $1 AND p.branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!purchase) {
        throw new BadRequestException('Purchase not found');
      }

      const reverted = await this.revertInTransaction(tx, purchase, ctx);
      return {
        deleted: true,
        itemsReverted: reverted.itemsReverted,
        branch_id: purchase.branch_id,
      };
    });
    await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
      schemaName,
      branchIds: [out.branch_id],
    });
    return { deleted: out.deleted, itemsReverted: out.itemsReverted };
  }

  /**
   * Deletes all line items after reversing aggregate inventory, subtracting linked
   * batch quantities, and deleting batch rows that reach zero.
   * @returns number of items reverted
   */
  private async revertPurchaseItemsStock(
    tx: Prisma.TransactionClient,
    purchase: { id: string; branch_id: string },
  ): Promise<number> {
    const items = await tx.$queryRawUnsafe<PurchaseItemRevertRow[]>(
      `SELECT id, branch_id, product_id, batch_id, quantity, base_quantity, cost_price
       FROM purchase_items
       WHERE purchase_id = $1
       ORDER BY id`,
      purchase.id,
    );

    if (!items.length) {
      return 0;
    }

    const reversible = items.filter(
      (row): row is PurchaseItemRevertRow & { product_id: string } => {
        const q = Number(row.base_quantity ?? row.quantity ?? 0);
        return row.product_id != null && row.product_id !== '' && q > 0;
      },
    );

    for (const item of reversible) {
      const qty = Number(item.base_quantity ?? item.quantity ?? 0);
      if (item.batch_id) {
        const [batch] = await tx.$queryRawUnsafe<BatchIdQtyLockRow[]>(
          `SELECT id, quantity
           FROM batches
           WHERE id = $1
           FOR UPDATE`,
          item.batch_id,
        );
        const batchQty = Number(batch?.quantity ?? 0);
        if (!batch || batchQty < qty) {
          throw new BadRequestException(
            'Cannot delete purchase item because some stock was already consumed.',
          );
        }
      }
    }

    for (const item of reversible) {
      const qty = Number(item.base_quantity ?? item.quantity ?? 0);

      await this.inventoryService.decreaseStock(tx, {
        branchId: item.branch_id ?? purchase.branch_id,
        productId: item.product_id,
        quantity: qty,
      });

      if (item.batch_id) {
        await tx.$queryRawUnsafe(
          `UPDATE batches
           SET quantity = quantity - $2
           WHERE id = $1`,
          item.batch_id,
          qty,
        );
      }
    }

    // Clear line items before deleting batches — avoids FK violations when
    // purchase_items_batch_id_fkey is NO ACTION / RESTRICT (not ON DELETE SET NULL).
    await tx.$queryRawUnsafe(
      `DELETE FROM purchase_items WHERE purchase_id = $1`,
      purchase.id,
    );

    for (const item of reversible) {
      if (item.batch_id) {
        await tx.$queryRawUnsafe(
          `DELETE FROM batches
           WHERE id = $1 AND COALESCE(quantity, 0) <= 0`,
          item.batch_id,
        );
      }
    }

    return items.length;
  }

  /**
   * Supplier credit note (financial): posts Dr AP or Cash / Cr Inventory for the amount.
   * Does not change purchase line items or stock (operational returns use other flows).
   */
  async createRefund(
    schemaName: string,
    branchId: string,
    purchaseId: string,
    allowedBranchIds: string[],
    dto: {
      amount: number;
      refundDate?: string;
      onCredit?: boolean;
      notes?: string;
    },
    ctx?: PurchaseMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const amt = Number(dto.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new BadRequestException('Refund amount must be greater than 0');
    }
    const refundRow = await this.prisma.withTenantSchema(
      schemaName,
      async (tx) => {
        const [purchase] = await tx.$queryRawUnsafe<PurchaseRow[]>(
          `SELECT id, branch_id, supplier_id, total_amount, purchase_date, on_credit, created_at
         FROM purchases
         WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
          purchaseId,
          allowedBranchIds,
        );
        if (!purchase || purchase.branch_id !== branchId) {
          throw new BadRequestException('Purchase not found');
        }
        const onCredit =
          dto.onCredit !== undefined
            ? Boolean(dto.onCredit)
            : Boolean(purchase.on_credit);
        const dateStr =
          (dto.refundDate?.trim() || '').slice(0, 10) ||
          (purchase.purchase_date != null
            ? String(purchase.purchase_date).slice(0, 10)
            : String(purchase.created_at ?? new Date()).slice(0, 10));

        await this.lockDates.assertDocumentDateOpen(tx, branchId, dateStr);

        const [refundRow] = await tx.$queryRawUnsafe<PurchaseRefundInsertRow[]>(
          `INSERT INTO purchase_refunds (
           branch_id, purchase_id, amount, refund_date, on_credit, notes
         )
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4::date, $5, $6)
         RETURNING id, branch_id, purchase_id, amount, refund_date, on_credit, notes, created_at`,
          branchId,
          purchaseId,
          amt,
          dateStr,
          onCredit,
          dto.notes?.trim() || null,
        );

        await this.accountingPosting.postPurchaseRefundJournal(tx, {
          branchId,
          refundId: refundRow.id,
          amount: amt,
          entryDate: dateStr,
          onCredit,
          supplierId: purchase.supplier_id ?? null,
        });

        await this.auditLog.append(tx, {
          branchId,
          actorUserId: ctx?.actorUserId ?? null,
          tableName: 'purchase_refunds',
          recordId: refundRow.id,
          action: 'create',
          newPayload: {
            purchase_id: purchaseId,
            amount: amt,
            refund_date: dateStr,
          },
        });

        return refundRow;
      },
    );
    await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
      schemaName,
      branchIds: [branchId],
    });
    return refundRow;
  }

  private async updateDraftWithItemsInTx(
    tx: Prisma.TransactionClient,
    id: string,
    branchId: string,
    allowedBranchIds: string[],
    dto: {
      supplierId?: string;
      invoiceNumber?: string;
      supplierInvoiceNo?: string;
      purchaseOrderNo?: string;
      totalAmount?: number;
      purchaseDate?: string;
      orderDate?: string;
      postingDate?: string;
      dueDate?: string;
      notes?: string;
      items: Array<{
        productId: string;
        uomId?: string;
        quantity: number;
        batchNumber?: string;
        costPrice?: number;
        sellingPrice?: number;
        updateSellingPrice?: boolean;
        expiryDate?: string;
        lineDiscount?: number;
        taxAmount?: number;
        lineNotes?: string;
      }>;
    },
    ctx?: PurchaseMutationContext,
  ) {
    const purchase = await this.workflow.loadPurchaseForWorkflow(
      tx,
      id,
      allowedBranchIds,
    );
    if (!purchase) return null;
    if (!isPurchaseEditableStatus(purchase.status)) {
      throw new BadRequestException(
        'Only draft or released purchases can have lines edited',
      );
    }

    await tx.$executeRawUnsafe(
      `DELETE FROM purchase_items WHERE purchase_id = $1::uuid`,
      id,
    );

    const draftInput = this.toDraftInput({
      ...dto,
      items: dto.items,
    });
    const totalAmount =
      dto.totalAmount != null && dto.totalAmount > 0
        ? dto.totalAmount
        : this.workflow.computeLineTotal(draftInput.items);

    const invoices = syncPurchaseInvoiceFields({
      invoiceNumber: dto.invoiceNumber,
      supplierInvoiceNo: dto.supplierInvoiceNo,
    });

    await tx.$executeRawUnsafe(
      `UPDATE purchases
       SET supplier_id = COALESCE($2, supplier_id),
           branch_id = $3,
           invoice_number = COALESCE($4, invoice_number),
           supplier_invoice_no = COALESCE($5, supplier_invoice_no),
           purchase_order_no = COALESCE($6, purchase_order_no),
           total_amount = $7,
           purchase_date = COALESCE($8, purchase_date),
           order_date = COALESCE($9, order_date),
           posting_date = COALESCE($10, posting_date),
           due_date = COALESCE($11, due_date),
           notes = COALESCE($12, notes)
       WHERE id = $1::uuid`,
      id,
      dto.supplierId ?? null,
      branchId,
      invoices.invoice_number,
      invoices.supplier_invoice_no,
      dto.purchaseOrderNo?.trim() || null,
      totalAmount,
      dto.purchaseDate?.trim()?.slice(0, 10) ?? null,
      dto.orderDate?.trim()?.slice(0, 10) ?? null,
      dto.postingDate?.trim()?.slice(0, 10) ?? null,
      dto.dueDate?.trim()?.slice(0, 10) ?? null,
      dto.notes?.trim() ?? null,
    );

    for (const item of dto.items) {
      const resolvedUom = await this.uomsService.resolveProductUomForDocument(
        tx,
        {
          productId: item.productId,
          uomId: item.uomId,
          defaultKind: 'purchase',
        },
      );
      const baseQuantity = this.uomsService.toBaseQuantity(
        item.quantity,
        resolvedUom.conversionFactorToBase,
      );
      const baseUnitCost = this.uomsService.toBaseUnitCost(
        item.costPrice,
        resolvedUom.conversionFactorToBase,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO purchase_items (
           purchase_id, branch_id, product_id, uom_id, quantity, quantity_received,
           conversion_factor_snapshot, base_quantity, base_unit_cost,
           cost_price, selling_price, update_selling_price, expiry_date, line_discount, tax_amount, line_notes,
           planned_batch_number, planned_expiry_date
         )
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        id,
        branchId,
        item.productId,
        resolvedUom.uomId,
        item.quantity,
        resolvedUom.conversionFactorToBase,
        baseQuantity,
        baseUnitCost,
        item.costPrice ?? null,
        item.sellingPrice ?? null,
        item.updateSellingPrice === true,
        item.expiryDate ?? null,
        item.lineDiscount ?? 0,
        item.taxAmount ?? 0,
        item.lineNotes?.trim() || null,
        item.batchNumber?.trim() || null,
        item.expiryDate ?? null,
      );
    }

    await this.workflow.upsertSupplierLinksForPurchaseInTx(tx, id);

    await this.auditLog.append(tx, {
      branchId,
      actorUserId: ctx?.actorUserId ?? null,
      tableName: 'purchases',
      recordId: id,
      action: 'purchase_draft_update',
      entityType: 'purchase',
      entityId: id,
    });

    const [row] = await tx.$queryRawUnsafe<PurchaseRow[]>(
      `SELECT ${PURCHASE_HEADER_SELECT} FROM purchases p WHERE p.id = $1::uuid`,
      id,
    );
    return row ?? null;
  }

  async removeItems(
    schemaName: string,
    id: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    const out = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [purchase] = await tx.$queryRawUnsafe<PurchaseLockRow[]>(
        `SELECT id, branch_id, purchase_date, created_at
         FROM purchases
         WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!purchase) {
        throw new BadRequestException('Purchase not found');
      }

      const docDate =
        purchase.purchase_date != null
          ? purchase.purchase_date
          : (purchase.created_at ?? new Date());
      await this.lockDates.assertDocumentDateOpen(
        tx,
        purchase.branch_id,
        docDate,
      );

      const count = await this.revertPurchaseItemsStock(tx, {
        id: purchase.id,
        branch_id: purchase.branch_id,
      });
      await tx.$queryRawUnsafe(
        `UPDATE purchases
         SET total_amount = 0
         WHERE id = $1`,
        id,
      );

      await this.auditLog.append(tx, {
        branchId: purchase.branch_id,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'purchases',
        recordId: id,
        action: 'remove_items',
        newPayload: { lines_removed: count },
      });

      return { deleted: true, count, branch_id: purchase.branch_id };
    });
    await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
      schemaName,
      branchIds: [out.branch_id],
    });
    return { deleted: out.deleted, count: out.count };
  }
}
