import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { UomsService } from '../uoms/uoms.service';
import {
  isPurchaseEditableStatus,
  purchaseHasPostedInventory,
  purchaseHasPostedInvoice,
} from './purchase-workflow.types';
import { syncPurchaseInvoiceFields } from './purchase-invoice-sync.util';
import type {
  PurchaseBatchShortRow,
  PurchaseItemDetailRow,
  PurchaseMutationContext,
  PurchaseRow,
} from './purchases.service';

export type PurchaseDraftLineInput = {
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
};

export type PurchaseDraftHeaderInput = {
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
  items: PurchaseDraftLineInput[];
};

export const PURCHASE_HEADER_SELECT = `p.id, p.supplier_id, p.branch_id, p.invoice_number, p.supplier_invoice_no,
  p.purchase_order_no, p.total_amount, p.purchase_date, p.order_date, p.posting_date, p.due_date,
  p.status, p.notes, p.on_credit, p.released_at, p.received_at, p.invoiced_at, p.created_at`;

export const PURCHASE_HEADER_RETURNING = `id, supplier_id, branch_id, invoice_number, supplier_invoice_no,
  purchase_order_no, total_amount, purchase_date, order_date, posting_date, due_date,
  status, notes, on_credit, released_at, received_at, invoiced_at, created_at`;

export const PURCHASE_ITEM_SELECT = `pi.id, pi.purchase_id, pi.branch_id, pi.product_id, pi.batch_id, pi.quantity,
  pi.quantity_received, pi.uom_id, pi.conversion_factor_snapshot, pi.base_quantity, pi.base_unit_cost,
  pi.cost_price, pi.selling_price, pi.update_selling_price, pi.expiry_date, pi.line_discount, pi.tax_amount,
  pi.line_notes, pi.planned_batch_number, pi.planned_expiry_date,
  COALESCE(b.batch_number, pi.planned_batch_number) AS batch_number,
  u.code AS uom_code, u.symbol AS uom_symbol,
  pr.item_no, pr.name AS product_name`;

@Injectable()
export class PurchasesWorkflowService {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
    private readonly uomsService: UomsService,
  ) {}

  async getInvoiceBeforeReceive(
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const [row] = await tx.$queryRawUnsafe<
      Array<{ invoice_before_receive: boolean }>
    >(
      `SELECT COALESCE(invoice_before_receive, FALSE) AS invoice_before_receive
       FROM tenant_settings LIMIT 1`,
    );
    return Boolean(row?.invoice_before_receive);
  }

  computeLineTotal(items: PurchaseDraftLineInput[]): number {
    let total = 0;
    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      const cost = Number(item.costPrice ?? 0);
      const discount = Number(item.lineDiscount ?? 0);
      const tax = Number(item.taxAmount ?? 0);
      if (qty > 0) total += qty * cost - discount + tax;
    }
    return total;
  }

  resolveDocDate(dto: PurchaseDraftHeaderInput): string {
    const pd =
      dto.postingDate?.trim() ||
      dto.purchaseDate?.trim() ||
      dto.orderDate?.trim();
    if (pd && pd.length >= 10) return pd.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }

  private toDateOnly(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return value.toISOString().slice(0, 10);
    }
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return trimmed.slice(0, 10);
    return parsed.toISOString().slice(0, 10);
  }

  async loadPurchaseForWorkflow(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    allowedBranchIds: string[],
  ): Promise<(PurchaseRow & { status: string }) | null> {
    const [row] = await tx.$queryRawUnsafe<
      Array<PurchaseRow & { status: string }>
    >(
      `SELECT ${PURCHASE_HEADER_SELECT}
       FROM purchases p
       WHERE p.id = $1::uuid AND p.branch_id = ANY($2::uuid[])`,
      purchaseId,
      allowedBranchIds,
    );
    return row ?? null;
  }

  async createPurchaseDraftInTx(
    tx: Prisma.TransactionClient,
    branchId: string,
    dto: PurchaseDraftHeaderInput,
    ctx?: PurchaseMutationContext,
  ): Promise<PurchaseRow & { status: string }> {
    const effectiveDocDate = this.resolveDocDate(dto);
    await this.lockDates.assertDocumentDateOpen(
      tx,
      branchId,
      effectiveDocDate,
    );

    const invoices = syncPurchaseInvoiceFields({
      invoiceNumber: dto.invoiceNumber,
      supplierInvoiceNo: dto.supplierInvoiceNo,
    });
    const computedTotal = this.computeLineTotal(dto.items);
    const totalAmount =
      dto.totalAmount != null && dto.totalAmount > 0
        ? dto.totalAmount
        : computedTotal;

    const purchaseDate =
      dto.purchaseDate?.trim()?.slice(0, 10) ??
      dto.postingDate?.trim()?.slice(0, 10) ??
      effectiveDocDate;

    const [row] = await tx.$queryRawUnsafe<
      Array<PurchaseRow & { status: string }>
    >(
      `INSERT INTO purchases (
         supplier_id, branch_id, invoice_number, supplier_invoice_no, purchase_order_no,
         total_amount, purchase_date, order_date, posting_date, due_date, status, notes, on_credit
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, COALESCE($12, TRUE))
       RETURNING ${PURCHASE_HEADER_RETURNING}`,
      dto.supplierId ?? null,
      branchId,
      invoices.invoice_number,
      invoices.supplier_invoice_no,
      dto.purchaseOrderNo?.trim() || null,
      totalAmount ?? null,
      purchaseDate,
      dto.orderDate?.trim()?.slice(0, 10) ?? null,
      dto.postingDate?.trim()?.slice(0, 10) ?? purchaseDate,
      dto.dueDate?.trim()?.slice(0, 10) ?? null,
      dto.notes?.trim() || null,
      dto.onCredit ?? true,
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
      await tx.$queryRawUnsafe(
        `INSERT INTO purchase_items (
           purchase_id, branch_id, product_id, uom_id, quantity, quantity_received,
           conversion_factor_snapshot, base_quantity, base_unit_cost,
           cost_price, selling_price, update_selling_price, expiry_date, line_discount, tax_amount, line_notes,
           planned_batch_number, planned_expiry_date
         )
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        row.id,
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

    await this.upsertSupplierLinksForPurchaseInTx(tx, row.id);

    await this.auditLog.append(tx, {
      branchId,
      actorUserId: ctx?.actorUserId ?? null,
      tableName: 'purchases',
      recordId: row.id,
      action: 'purchase_draft_create',
      entityType: 'purchase',
      entityId: row.id,
      newPayload: {
        status: 'draft',
        invoice_number: row.invoice_number,
        total_amount: row.total_amount,
      },
    });

    return row;
  }

  async createPurchaseImmediateInTx(
    tx: Prisma.TransactionClient,
    branchId: string,
    dto: PurchaseDraftHeaderInput,
    ctx?: PurchaseMutationContext,
    businessType = 'pharmacy',
  ): Promise<PurchaseRow & { status: string }> {
    const draft = await this.createPurchaseDraftInTx(tx, branchId, dto, ctx);
    await this.receivePurchaseInTx(
      tx,
      draft.id,
      [draft.branch_id],
      { businessType },
      ctx,
    );
    const invoiced = await this.postPurchaseInvoiceInTx(
      tx,
      draft.id,
      [draft.branch_id],
      ctx,
    );
    await tx.$executeRawUnsafe(
      `UPDATE purchases SET status = 'closed' WHERE id = $1::uuid`,
      invoiced.id,
    );
    const [closed] = await tx.$queryRawUnsafe<
      Array<PurchaseRow & { status: string }>
    >(
      `SELECT ${PURCHASE_HEADER_SELECT} FROM purchases p WHERE p.id = $1::uuid`,
      draft.id,
    );
    return closed!;
  }

  async releasePurchaseInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ): Promise<PurchaseRow & { status: string }> {
    const purchase = await this.loadPurchaseForWorkflow(
      tx,
      purchaseId,
      allowedBranchIds,
    );
    if (!purchase) throw new BadRequestException('Purchase not found');
    if (purchase.status !== 'draft') {
      throw new BadRequestException(
        'Only draft purchases can be released',
      );
    }
    const [row] = await tx.$queryRawUnsafe<
      Array<PurchaseRow & { status: string }>
    >(
      `UPDATE purchases
       SET status = 'released', released_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING ${PURCHASE_HEADER_RETURNING}`,
      purchaseId,
    );
    await this.auditLog.append(tx, {
      branchId: purchase.branch_id,
      actorUserId: ctx?.actorUserId ?? null,
      tableName: 'purchases',
      recordId: purchaseId,
      action: 'purchase_release',
      entityType: 'purchase',
      entityId: purchaseId,
    });
    return row;
  }

  async receivePurchaseInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    allowedBranchIds: string[],
    opts: { businessType?: string },
    ctx?: PurchaseMutationContext,
  ): Promise<PurchaseRow & { status: string }> {
    const purchase = await this.loadPurchaseForWorkflow(
      tx,
      purchaseId,
      allowedBranchIds,
    );
    if (!purchase) throw new BadRequestException('Purchase not found');
    if (
      purchase.status !== 'draft' &&
      purchase.status !== 'released'
    ) {
      throw new BadRequestException(
        `Cannot receive purchase in status "${purchase.status}"`,
      );
    }

    const docDate =
      purchase.posting_date ??
      purchase.purchase_date ??
      purchase.created_at ??
      new Date();
    await this.lockDates.assertDocumentDateOpen(
      tx,
      purchase.branch_id,
      docDate,
    );

    const items = await tx.$queryRawUnsafe<
      Array<{
        id: string;
        product_id: string;
        quantity: number | string;
        quantity_received: number | string;
        conversion_factor_snapshot: number | string;
        base_quantity: number | string;
        base_unit_cost: unknown;
        cost_price: unknown;
        selling_price: unknown;
        planned_batch_number: string | null;
        planned_expiry_date: Date | string | null;
        expiry_date: Date | string | null;
      }>
    >(
      `SELECT id, product_id, quantity, quantity_received,
              conversion_factor_snapshot, base_quantity, base_unit_cost,
              cost_price, selling_price,
              planned_batch_number, planned_expiry_date, expiry_date
       FROM purchase_items WHERE purchase_id = $1 ORDER BY id`,
      purchaseId,
    );

    if (!items.length) {
      throw new BadRequestException('Purchase has no lines to receive');
    }

    const isPharmacy = opts.businessType === 'pharmacy';

    for (const item of items) {
      const qty = Number(item.base_quantity ?? item.quantity ?? 0);
      const enteredQty = Number(item.quantity ?? 0);
      if (qty <= 0) continue;
      const factor = Number(item.conversion_factor_snapshot ?? 1);
      const baseSellingPrice =
        item.selling_price == null
          ? null
          : Math.round((Number(item.selling_price) / factor + Number.EPSILON) * 100) / 100;
      const batchNum =
        item.planned_batch_number?.trim() || null;
      const expiry =
        this.toDateOnly(item.planned_expiry_date) ??
        this.toDateOnly(item.expiry_date);

      if (isPharmacy) {
        if (!batchNum) {
          throw new BadRequestException(
            'PHARMACY_BATCH_REQUIRED: batch_number required to receive',
          );
        }
        if (!expiry) {
          throw new BadRequestException(
            'PHARMACY_EXPIRY_REQUIRED: expiry_date required to receive',
          );
        }
      }

      const [batch] = await tx.$queryRawUnsafe<PurchaseBatchShortRow[]>(
        `INSERT INTO batches (branch_id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, branch_id, product_id, quantity`,
        purchase.branch_id,
        item.product_id,
        batchNum,
        expiry,
        qty,
        item.base_unit_cost ?? item.cost_price ?? null,
        baseSellingPrice,
      );

      await tx.$queryRawUnsafe(
        `UPDATE purchase_items
         SET batch_id = $2, quantity_received = $3, expiry_date = COALESCE($4, expiry_date)
         WHERE id = $1`,
        item.id,
        batch.id,
        enteredQty,
        expiry,
      );

      await this.inventoryService.increaseStock(tx, {
        branchId: purchase.branch_id,
        productId: item.product_id,
        quantity: qty,
      });
    }

    await this.upsertSupplierLinksForPurchaseInTx(tx, purchaseId);

    const [row] = await tx.$queryRawUnsafe<
      Array<PurchaseRow & { status: string }>
    >(
      `UPDATE purchases
       SET status = 'received', received_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING ${PURCHASE_HEADER_RETURNING}`,
      purchaseId,
    );

    await this.auditLog.append(tx, {
      branchId: purchase.branch_id,
      actorUserId: ctx?.actorUserId ?? null,
      tableName: 'purchases',
      recordId: purchaseId,
      action: 'purchase_receive',
      entityType: 'purchase',
      entityId: purchaseId,
    });

    return row;
  }

  async postPurchaseInvoiceInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ): Promise<PurchaseRow & { status: string }> {
    const purchase = await this.loadPurchaseForWorkflow(
      tx,
      purchaseId,
      allowedBranchIds,
    );
    if (!purchase) throw new BadRequestException('Purchase not found');
    if (purchase.status === 'invoiced' || purchase.status === 'closed') {
      throw new BadRequestException('Purchase invoice already posted');
    }
    if (purchase.status === 'cancelled') {
      throw new BadRequestException('Cannot invoice a cancelled purchase');
    }

    const invoiceBeforeReceive = await this.getInvoiceBeforeReceive(tx);
    if (!invoiceBeforeReceive && purchase.status !== 'received') {
      throw new BadRequestException('PURCHASE_NOT_RECEIVED');
    }

    const invTotal = Number(purchase.total_amount ?? 0);
    const entryDate =
      purchase.posting_date ??
      purchase.purchase_date ??
      purchase.created_at ??
      new Date();

    await this.lockDates.assertDocumentDateOpen(
      tx,
      purchase.branch_id,
      entryDate,
    );

    if (invTotal > 0) {
      await this.accountingPosting.postPurchaseJournal(tx, {
        branchId: purchase.branch_id,
        purchaseId: purchase.id,
        inventoryTotal: invTotal,
        entryDate,
        onCredit: Boolean(purchase.on_credit),
        supplierId: purchase.supplier_id ?? null,
      });
    }

    await this.promotePurchasePricingOnInvoicePostInTx(tx, purchaseId, ctx);

    const [row] = await tx.$queryRawUnsafe<
      Array<PurchaseRow & { status: string }>
    >(
      `UPDATE purchases
       SET status = 'invoiced', invoiced_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid
       RETURNING ${PURCHASE_HEADER_RETURNING}`,
      purchaseId,
    );

    await this.auditLog.append(tx, {
      branchId: purchase.branch_id,
      actorUserId: ctx?.actorUserId ?? null,
      tableName: 'purchases',
      recordId: purchaseId,
      action: 'purchase_invoice_post',
      entityType: 'purchase',
      entityId: purchaseId,
    });

    return row;
  }

  async closePurchaseInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ): Promise<PurchaseRow & { status: string }> {
    const purchase = await this.loadPurchaseForWorkflow(
      tx,
      purchaseId,
      allowedBranchIds,
    );
    if (!purchase) throw new BadRequestException('Purchase not found');
    if (purchase.status !== 'invoiced') {
      throw new BadRequestException('Only invoiced purchases can be closed');
    }
    const [row] = await tx.$queryRawUnsafe<
      Array<PurchaseRow & { status: string }>
    >(
      `UPDATE purchases SET status = 'closed' WHERE id = $1::uuid
       RETURNING ${PURCHASE_HEADER_RETURNING}`,
      purchaseId,
    );
    await this.auditLog.append(tx, {
      branchId: purchase.branch_id,
      actorUserId: ctx?.actorUserId ?? null,
      tableName: 'purchases',
      recordId: purchaseId,
      action: 'purchase_close',
      entityType: 'purchase',
      entityId: purchaseId,
    });
    return row;
  }

  async cancelPurchaseInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    allowedBranchIds: string[],
    revertStockFn: (
      tx: Prisma.TransactionClient,
      purchase: { id: string; branch_id: string },
    ) => Promise<number>,
    reverseJournalFn: (
      tx: Prisma.TransactionClient,
      purchase: PurchaseRow & { status: string },
    ) => Promise<void>,
    ctx?: PurchaseMutationContext,
  ): Promise<{ cancelled: true }> {
    const purchase = await this.loadPurchaseForWorkflow(
      tx,
      purchaseId,
      allowedBranchIds,
    );
    if (!purchase) throw new BadRequestException('Purchase not found');
    if (purchase.status === 'cancelled') {
      throw new BadRequestException('Purchase already cancelled');
    }

    if (purchaseHasPostedInvoice(purchase.status)) {
      await reverseJournalFn(tx, purchase);
    }
    if (purchaseHasPostedInventory(purchase.status)) {
      await revertStockFn(tx, {
        id: purchase.id,
        branch_id: purchase.branch_id,
      });
    }

    await tx.$executeRawUnsafe(
      `DELETE FROM purchase_items WHERE purchase_id = $1::uuid`,
      purchaseId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM purchases WHERE id = $1::uuid`,
      purchaseId,
    );

    await this.auditLog.append(tx, {
      branchId: purchase.branch_id,
      actorUserId: ctx?.actorUserId ?? null,
      tableName: 'purchases',
      recordId: purchaseId,
      action: 'purchase_cancel',
      entityType: 'purchase',
      entityId: purchaseId,
    });

    return { cancelled: true };
  }

  async upsertSupplierLinksForPurchaseInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
  ): Promise<void> {
    await tx.$queryRawUnsafe(
      `WITH purchase_supplier AS (
         SELECT id, supplier_id
         FROM purchases
         WHERE id = $1::uuid
           AND supplier_id IS NOT NULL
       ),
       latest_lines AS (
         SELECT DISTINCT ON (pi.product_id)
           pi.product_id,
           ps.supplier_id
         FROM purchase_items pi
         JOIN purchase_supplier ps ON ps.id = pi.purchase_id
         WHERE pi.product_id IS NOT NULL
         ORDER BY pi.product_id, pi.id DESC
       )
       INSERT INTO product_suppliers AS target (
         product_id, supplier_id, is_preferred
       )
       SELECT
         ll.product_id,
         ll.supplier_id,
         NOT EXISTS (
           SELECT 1
           FROM product_suppliers existing
           WHERE existing.product_id = ll.product_id
             AND existing.is_preferred
         )
       FROM latest_lines ll
       ON CONFLICT (product_id, supplier_id) DO UPDATE
         SET is_preferred = CASE
               WHEN target.is_preferred THEN TRUE
               WHEN NOT EXISTS (
                 SELECT 1
                 FROM product_suppliers existing
                 WHERE existing.product_id = EXCLUDED.product_id
                   AND existing.is_preferred
                   AND existing.supplier_id <> EXCLUDED.supplier_id
               ) THEN TRUE
               ELSE target.is_preferred
             END,
             updated_at = CURRENT_TIMESTAMP`,
      purchaseId,
    );
  }

  async promotePurchasePricingOnInvoicePostInTx(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    ctx?: PurchaseMutationContext,
  ): Promise<void> {
    await tx.$queryRawUnsafe(
      `WITH purchase_supplier AS (
         SELECT id, supplier_id
         FROM purchases
         WHERE id = $1::uuid
           AND supplier_id IS NOT NULL
       ),
       latest_lines AS (
         SELECT DISTINCT ON (pi.product_id)
           pi.product_id,
           ps.supplier_id,
           COALESCE(
             pi.base_unit_cost,
             CASE
               WHEN pi.conversion_factor_snapshot IS NOT NULL
                 AND pi.conversion_factor_snapshot > 0
               THEN pi.cost_price / pi.conversion_factor_snapshot
               ELSE pi.cost_price
             END
           ) AS cost_price
         FROM purchase_items pi
         JOIN purchase_supplier ps ON ps.id = pi.purchase_id
         WHERE pi.product_id IS NOT NULL
           AND pi.cost_price IS NOT NULL
         ORDER BY pi.product_id, pi.id DESC
       )
       INSERT INTO product_suppliers AS target (
         product_id, supplier_id, is_preferred, last_cost_price
       )
       SELECT
         ll.product_id,
         ll.supplier_id,
         NOT EXISTS (
           SELECT 1
           FROM product_suppliers existing
           WHERE existing.product_id = ll.product_id
             AND existing.is_preferred
         ),
         ll.cost_price
       FROM latest_lines ll
       ON CONFLICT (product_id, supplier_id) DO UPDATE
         SET last_cost_price = COALESCE(EXCLUDED.last_cost_price, target.last_cost_price),
             is_preferred = CASE
               WHEN target.is_preferred THEN TRUE
               WHEN NOT EXISTS (
                 SELECT 1
                 FROM product_suppliers existing
                 WHERE existing.product_id = EXCLUDED.product_id
                   AND existing.is_preferred
                   AND existing.supplier_id <> EXCLUDED.supplier_id
               ) THEN TRUE
               ELSE target.is_preferred
             END,
             updated_at = CURRENT_TIMESTAMP`,
      purchaseId,
    );

    await tx.$queryRawUnsafe(
      `WITH latest_lines AS (
         SELECT DISTINCT ON (pi.product_id, pi.uom_id)
           pi.id AS purchase_item_id,
           pi.product_id,
           pi.uom_id,
           p.supplier_id,
           pi.cost_price,
           pi.quantity AS entered_quantity,
           pi.base_quantity,
           pi.conversion_factor_snapshot,
           COALESCE(p.posting_date, p.purchase_date, p.created_at, CURRENT_TIMESTAMP)::timestamp AS purchase_date
         FROM purchase_items pi
         JOIN purchases p ON p.id = pi.purchase_id
         WHERE pi.purchase_id = $1::uuid
           AND p.supplier_id IS NOT NULL
           AND pi.product_id IS NOT NULL
           AND pi.uom_id IS NOT NULL
           AND pi.cost_price IS NOT NULL
         ORDER BY pi.product_id, pi.uom_id, pi.id DESC
       ),
       supplier_prices AS (
         SELECT ll.*,
                psuc.current_cost_price AS old_current_cost,
                psuc.last_purchase_cost AS old_last_purchase_cost
         FROM latest_lines ll
         LEFT JOIN product_supplier_uom_costs psuc
           ON psuc.product_id = ll.product_id
          AND psuc.supplier_id = ll.supplier_id
          AND psuc.uom_id = ll.uom_id
       ),
       history_insert AS (
         INSERT INTO supplier_price_history (
           product_id, supplier_id, uom_id, purchase_id, purchase_item_id,
           old_cost_price, new_cost_price, entered_quantity, base_quantity,
           conversion_factor_snapshot, purchase_date, source
         )
         SELECT product_id,
                supplier_id,
                uom_id,
                $1::uuid,
                purchase_item_id,
                COALESCE(old_last_purchase_cost, old_current_cost),
                cost_price,
                entered_quantity,
                base_quantity,
                conversion_factor_snapshot,
                purchase_date,
                'purchase_invoice'
         FROM supplier_prices
         RETURNING product_id
       )
       INSERT INTO product_supplier_uom_costs AS target (
         product_id, supplier_id, uom_id,
         current_cost_price, last_purchase_cost, last_purchase_at,
         last_purchase_id, last_purchase_item_id
       )
       SELECT product_id,
              supplier_id,
              uom_id,
              cost_price,
              cost_price,
              purchase_date,
              $1::uuid,
              purchase_item_id
       FROM supplier_prices
       ON CONFLICT (product_id, supplier_id, uom_id) DO UPDATE
         SET current_cost_price = EXCLUDED.current_cost_price,
             last_purchase_cost = EXCLUDED.last_purchase_cost,
             last_purchase_at = EXCLUDED.last_purchase_at,
             last_purchase_id = EXCLUDED.last_purchase_id,
             last_purchase_item_id = EXCLUDED.last_purchase_item_id,
             updated_at = CURRENT_TIMESTAMP`,
      purchaseId,
    );

    const sellingPriceUpdates = await tx.$queryRawUnsafe<
      Array<{
        product_id: string;
        uom_id: string;
        selling_price: string | number;
        old_selling_price: string | number | null;
      }>
    >(
      `WITH latest_lines AS (
         SELECT DISTINCT ON (pi.product_id, pi.uom_id)
           pi.product_id,
           pi.uom_id,
           pi.selling_price
         FROM purchase_items pi
         WHERE pi.purchase_id = $1::uuid
           AND pi.product_id IS NOT NULL
           AND pi.uom_id IS NOT NULL
           AND pi.update_selling_price IS TRUE
           AND pi.selling_price IS NOT NULL
         ORDER BY pi.product_id, pi.uom_id, pi.id DESC
       ),
       current_prices AS (
         SELECT ll.product_id,
                ll.uom_id,
                ll.selling_price AS purchase_selling_price,
                pup.selling_price AS old_selling_price
         FROM latest_lines ll
         LEFT JOIN LATERAL (
           SELECT selling_price
           FROM product_uom_prices
           WHERE product_id = ll.product_id
             AND uom_id = ll.uom_id
             AND active IS TRUE
           ORDER BY updated_at DESC NULLS LAST, created_at DESC
           LIMIT 1
         ) pup ON TRUE
       )
       SELECT product_id,
              uom_id,
              purchase_selling_price AS selling_price,
              old_selling_price
       FROM current_prices
       WHERE purchase_selling_price IS NOT NULL
         AND purchase_selling_price IS DISTINCT FROM old_selling_price`,
      purchaseId,
    );

    for (const row of sellingPriceUpdates) {
      const newPrice = Number(row.selling_price);
      if (!Number.isFinite(newPrice)) continue;

      await tx.$queryRawUnsafe(
        `INSERT INTO product_price_history (
           product_id, uom_id,
           old_selling_price, new_selling_price,
           change_reason, source, actor_user_id
         )
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric,
                 'Purchase selling price update', 'purchase', $5::uuid)`,
        row.product_id,
        row.uom_id,
        row.old_selling_price,
        newPrice,
        ctx?.actorUserId ?? null,
      );

      await this.uomsService.upsertSellingPriceInTx(
        tx,
        row.product_id,
        row.uom_id,
        newPrice,
      );
    }

    const costLines = await tx.$queryRawUnsafe<
      Array<{
        product_id: string;
        purchase_item_id: string;
        base_uom_id: string;
        base_unit_cost: string | number;
        old_cost_price: string | number | null;
        purchase_date: Date | string;
      }>
    >(
      `WITH latest_cost_lines AS (
         SELECT DISTINCT ON (pi.product_id)
           pi.id AS purchase_item_id,
           pi.product_id,
           COALESCE(
             pi.base_unit_cost,
             CASE
               WHEN pi.conversion_factor_snapshot IS NOT NULL
                 AND pi.conversion_factor_snapshot > 0
               THEN pi.cost_price / pi.conversion_factor_snapshot
               ELSE pi.cost_price
             END
           ) AS base_unit_cost,
           COALESCE(p.posting_date, p.purchase_date, p.created_at, CURRENT_TIMESTAMP)::timestamp AS purchase_date
         FROM purchase_items pi
         JOIN purchases p ON p.id = pi.purchase_id
         WHERE pi.purchase_id = $1::uuid
           AND pi.product_id IS NOT NULL
           AND pi.cost_price IS NOT NULL
         ORDER BY pi.product_id, pi.id DESC
       ),
       base_uoms AS (
         SELECT pu.product_id, pu.uom_id AS base_uom_id
         FROM product_uoms pu
         WHERE pu.is_base IS TRUE
           AND pu.is_active IS TRUE
       )
       SELECT lcl.product_id,
              lcl.purchase_item_id,
              bu.base_uom_id,
              lcl.base_unit_cost,
              pup.cost_price AS old_cost_price,
              lcl.purchase_date
       FROM latest_cost_lines lcl
       JOIN base_uoms bu ON bu.product_id = lcl.product_id
       LEFT JOIN LATERAL (
         SELECT cost_price
         FROM product_uom_prices
         WHERE product_id = lcl.product_id
           AND uom_id = bu.base_uom_id
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) pup ON TRUE`,
      purchaseId,
    );

    for (const line of costLines) {
      const newCost = Number(line.base_unit_cost);
      if (!Number.isFinite(newCost)) continue;
      const oldCost =
        line.old_cost_price == null ? null : Number(line.old_cost_price);
      if (oldCost != null && Math.abs(oldCost - newCost) < 0.0001) continue;

      await this.uomsService.upsertBaseCostInTx(tx, line.product_id, newCost, {
        lastPurchaseCost: newCost,
        lastPurchaseAt: line.purchase_date,
        lastPurchaseId: purchaseId,
        lastPurchaseItemId: line.purchase_item_id,
      });

      await tx.$queryRawUnsafe(
        `INSERT INTO product_price_history (
           product_id, uom_id,
           old_cost_price, new_cost_price,
           change_reason, source, actor_user_id
         )
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric,
                 'Purchase cost update', 'purchase', $5::uuid)`,
        line.product_id,
        line.base_uom_id,
        oldCost,
        newCost,
        ctx?.actorUserId ?? null,
      );
    }

    await tx.$queryRawUnsafe(
      `WITH retail AS (
         SELECT id
         FROM price_groups
         WHERE is_default IS TRUE
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ),
       latest_lines AS (
         SELECT DISTINCT ON (pi.product_id, pi.uom_id)
           pi.product_id,
           pi.uom_id,
           pi.selling_price
         FROM purchase_items pi
         WHERE pi.purchase_id = $1::uuid
           AND pi.product_id IS NOT NULL
           AND pi.uom_id IS NOT NULL
           AND pi.update_selling_price IS TRUE
           AND pi.selling_price IS NOT NULL
         ORDER BY pi.product_id, pi.uom_id, pi.id DESC
       ),
       group_prices AS (
         SELECT ll.product_id,
                ll.uom_id,
                retail.id AS price_group_id,
                active_group.selling_price AS old_selling_price,
                ll.selling_price AS new_selling_price
         FROM latest_lines ll
         CROSS JOIN retail
         LEFT JOIN LATERAL (
           SELECT selling_price
           FROM product_price_group_prices
           WHERE product_id = ll.product_id
             AND uom_id = ll.uom_id
             AND price_group_id = retail.id
             AND active IS TRUE
           ORDER BY updated_at DESC NULLS LAST, created_at DESC
           LIMIT 1
         ) active_group ON TRUE
       ),
       history_insert AS (
         INSERT INTO product_price_history (
           product_id, uom_id, price_group_id,
           old_selling_price, new_selling_price,
           change_reason, source, actor_user_id
         )
         SELECT product_id,
                uom_id,
                price_group_id,
                old_selling_price,
                new_selling_price,
                'Purchase selling price update',
                'purchase',
                $2::uuid
         FROM group_prices
         WHERE new_selling_price IS DISTINCT FROM old_selling_price
         RETURNING product_id
       ),
       deactivated AS (
         UPDATE product_price_group_prices target
         SET active = FALSE,
             updated_at = CURRENT_TIMESTAMP
         FROM group_prices gp
         WHERE target.product_id = gp.product_id
           AND target.uom_id = gp.uom_id
           AND target.price_group_id = gp.price_group_id
           AND target.active IS TRUE
         RETURNING target.product_id
       )
       INSERT INTO product_price_group_prices (
         product_id, uom_id, price_group_id, selling_price, active
       )
       SELECT product_id, uom_id, price_group_id, new_selling_price, TRUE
       FROM group_prices`,
      purchaseId,
      ctx?.actorUserId ?? null,
    );
  }
}
