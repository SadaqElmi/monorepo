import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { TenantService } from '../tenant/tenant.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { toPagedResult, type PagedResult } from '../common/pagination.util';

export type PurchaseMutationContext = {
  actorUserId?: string | null;
};

export interface PurchaseListRow {
  id: string;
  supplier_id: string | null;
  branch_id: string;
  invoice_number: string | null;
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
  total_amount: number | string | null;
  purchase_date: Date | string | null;
  on_credit: boolean;
  created_at: Date;
}

export interface PurchaseItemDetailRow {
  id: string;
  purchase_id: string;
  branch_id: string;
  product_id: string | null;
  batch_id: string | null;
  quantity: number | string;
  cost_price: number | string | null;
  selling_price: number | string | null;
  expiry_date: Date | string | null;
  batch_number: string | null;
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
  ) {}

  async findAll(schemaName: string, allowedBranchIds: string[]) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<PurchaseListRow[]>(
        `SELECT p.id,
                p.supplier_id,
                p.branch_id,
                p.invoice_number,
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
         ORDER BY p.purchase_date DESC`,
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
         ORDER BY p.purchase_date DESC
         LIMIT $2 OFFSET $3`,
        allowedBranchIds,
        take,
        skip,
      );
      const page = Math.floor(skip / take) + 1;
      return toPagedResult(items, total, page, take);
    });
  }

  /**
   * Latest purchase line per product (for items catalog): cost, selling price, supplier.
   * Scoped to allowed branches on purchase_items.branch_id.
   */
  async findLinePricingByProduct(
    schemaName: string,
    allowedBranchIds: string[],
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          product_id: string;
          cost_price: unknown;
          selling_price: unknown;
          supplier_id: string | null;
          supplier_name: string | null;
        }>
      >(
        `SELECT DISTINCT ON (pi.product_id)
           pi.product_id,
           pi.cost_price,
           pi.selling_price,
           p.supplier_id,
           s.name AS supplier_name
         FROM purchase_items pi
         JOIN purchases p ON p.id = pi.purchase_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE pi.product_id IS NOT NULL
           AND pi.branch_id = ANY($1::uuid[])
         ORDER BY
           pi.product_id,
           p.purchase_date DESC NULLS LAST,
           p.created_at DESC NULLS LAST,
           pi.id DESC`,
        allowedBranchIds,
      ),
    );
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<PurchaseRow[]>(
        `SELECT id, supplier_id, branch_id, invoice_number, total_amount, purchase_date, on_credit, created_at
         FROM purchases
         WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!row) return null;

      const items = await tx.$queryRawUnsafe<PurchaseItemDetailRow[]>(
        `SELECT pi.id, pi.purchase_id, pi.branch_id, pi.product_id, pi.batch_id, pi.quantity, pi.cost_price, pi.selling_price, pi.expiry_date,
                b.batch_number
         FROM purchase_items pi
         LEFT JOIN batches b ON b.id = pi.batch_id
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
      supplierId?: string;
      invoiceNumber?: string;
      totalAmount?: number;
      purchaseDate?: string;
      onCredit?: boolean;
      items: Array<{
        productId: string;
        quantity: number;
        batchNumber?: string;
        costPrice?: number;
        sellingPrice?: number;
        expiryDate?: string;
      }>;
    },
    ctx?: PurchaseMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const pd = dto.purchaseDate?.trim();
      const effectiveDocDate =
        pd && pd.length >= 10 ? pd.slice(0, 10) : new Date();
      await this.lockDates.assertDocumentDateOpen(
        tx,
        branchId,
        effectiveDocDate,
      );

      let computedTotal = 0;
      for (const item of dto.items) {
        const qty = Number(item.quantity ?? 0);
        const cost = Number(item.costPrice ?? 0);
        if (qty > 0 && cost > 0) computedTotal += qty * cost;
      }

      const [row] = await tx.$queryRawUnsafe<PurchaseRow[]>(
        `INSERT INTO purchases (supplier_id, branch_id, invoice_number, total_amount, purchase_date, on_credit)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, FALSE))
         RETURNING id, supplier_id, branch_id, invoice_number, total_amount, purchase_date, on_credit, created_at`,
        dto.supplierId ?? null,
        branchId,
        dto.invoiceNumber ?? null,
        dto.totalAmount ?? computedTotal ?? null,
        dto.purchaseDate ?? null,
        dto.onCredit ?? false,
      );

      for (const item of dto.items) {
        const [batch] = await tx.$queryRawUnsafe<PurchaseBatchShortRow[]>(
          `INSERT INTO batches (branch_id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, branch_id, product_id, quantity`,
          branchId,
          item.productId,
          item.batchNumber ?? null,
          item.expiryDate ?? null,
          item.quantity,
          item.costPrice ?? null,
          item.sellingPrice ?? null,
        );

        await tx.$queryRawUnsafe(
          `INSERT INTO purchase_items (purchase_id, branch_id, product_id, batch_id, quantity, cost_price, selling_price, expiry_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          row.id,
          branchId,
          item.productId,
          batch.id,
          item.quantity,
          item.costPrice ?? null,
          item.sellingPrice ?? null,
          item.expiryDate ?? null,
        );

        await this.inventoryService.increaseStock(tx, {
          branchId,
          productId: item.productId,
          quantity: Number(item.quantity ?? 0),
        });
      }

      const invTotal = Number(row.total_amount ?? computedTotal ?? 0);
      const entryDate =
        row.purchase_date != null
          ? row.purchase_date
          : (row.created_at ?? new Date());
      await this.accountingPosting.postPurchaseJournal(tx, {
        branchId,
        purchaseId: row.id,
        inventoryTotal: invTotal,
        entryDate,
        onCredit: Boolean(row.on_credit),
        supplierId: dto.supplierId ?? null,
      });

      await this.auditLog.append(tx, {
        branchId,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'purchases',
        recordId: row.id,
        action: 'create',
        newPayload: {
          invoice_number: row.invoice_number,
          total_amount: row.total_amount,
          on_credit: row.on_credit,
        },
      });

      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    branchId: string,
    allowedBranchIds: string[],
    dto: {
      supplierId?: string;
      invoiceNumber?: string;
      totalAmount?: number;
      purchaseDate?: string;
      items?: Array<{
        productId: string;
        quantity: number;
        batchNumber?: string;
        costPrice?: number;
        sellingPrice?: number;
        expiryDate?: string;
      }>;
    },
    ctx?: PurchaseMutationContext,
  ) {
    if (dto.items?.length) {
      throw new BadRequestException(
        'Editing purchase items is not allowed. Use a return/adjustment flow.',
      );
    }
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
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

      const [row] = await tx.$queryRawUnsafe<PurchaseUpdateRow[]>(
        `UPDATE purchases
         SET supplier_id = COALESCE($2, supplier_id),
             branch_id = $3,
             invoice_number = COALESCE($4, invoice_number),
             total_amount = COALESCE($5, total_amount),
             purchase_date = COALESCE($6, purchase_date)
         WHERE id = $1 AND branch_id = ANY($7::uuid[])
         RETURNING id, supplier_id, branch_id, invoice_number, total_amount, purchase_date, created_at`,
        id,
        dto.supplierId ?? null,
        branchId,
        dto.invoiceNumber ?? null,
        dto.totalAmount ?? null,
        dto.purchaseDate ?? null,
        allowedBranchIds,
      );
      if (row) {
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
    });
  }

  async remove(
    schemaName: string,
    id: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [purchase] = await tx.$queryRawUnsafe<PurchaseRow[]>(
        `SELECT id, branch_id, supplier_id, total_amount, purchase_date, on_credit, created_at
         FROM purchases
         WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!purchase) {
        throw new BadRequestException('Purchase not found');
      }

      const entryDateForLock =
        purchase.purchase_date != null
          ? purchase.purchase_date
          : (purchase.created_at ?? new Date());
      await this.lockDates.assertDocumentDateOpen(
        tx,
        purchase.branch_id,
        entryDateForLock,
      );

      const itemCount = await this.revertPurchaseItemsStock(tx, purchase);
      const invTotal = Number(purchase.total_amount ?? 0);
      const entryDate =
        purchase.purchase_date != null
          ? purchase.purchase_date
          : (purchase.created_at ?? new Date());
      if (invTotal > 0) {
        await this.accountingPosting.reversePurchaseJournal(tx, {
          branchId: purchase.branch_id,
          purchaseId: String(purchase.id),
          inventoryTotal: invTotal,
          entryDate,
          onCredit: Boolean(purchase.on_credit),
          supplierId: purchase.supplier_id ?? null,
        });
      }

      await tx.$queryRawUnsafe(
        `DELETE FROM purchases WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );

      await this.auditLog.append(tx, {
        branchId: purchase.branch_id,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'purchases',
        recordId: id,
        action: 'remove',
        oldPayload: { itemsReverted: itemCount },
      });

      return { deleted: true, itemsReverted: itemCount };
    });
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
      `SELECT id, branch_id, product_id, batch_id, quantity, cost_price
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
        const q = Number(row.quantity ?? 0);
        return row.product_id != null && row.product_id !== '' && q > 0;
      },
    );

    for (const item of reversible) {
      const qty = Number(item.quantity ?? 0);
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
      const qty = Number(item.quantity ?? 0);

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
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
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
    });
  }

  async removeItems(
    schemaName: string,
    id: string,
    allowedBranchIds: string[],
    ctx?: PurchaseMutationContext,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
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

      return { deleted: true, count };
    });
  }
}
