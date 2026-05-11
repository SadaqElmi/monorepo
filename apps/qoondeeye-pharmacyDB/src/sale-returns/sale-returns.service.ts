import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { TenantService } from '../tenant/tenant.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';

export type SaleReturnLineInput = {
  saleItemId: string;
  quantity: number;
};

export type SaleReturnMutationContext = {
  actorUserId?: string | null;
};

export interface SaleReturnListRow {
  id: string;
  sale_id: string;
  branch_id: string;
  reason: string | null;
  return_date: Date;
  refund_method: string | null;
  refund_amount: number | string | null;
}

export interface SaleForReturnRow {
  id: string;
  branch_id: string;
  on_account: boolean;
  customer_id: string | null;
}

export interface SaleItemForReturnRow {
  id: string;
  product_id: string | null;
  batch_id: string | null;
  quantity: number | string;
}

export interface SaleItemPriceRow {
  price: number | string | null;
}

export interface SaleReturnInsertRow {
  id: string;
  sale_id: string;
  branch_id: string;
  reason: string | null;
  refund_method: string | null;
  refund_amount: number | string | null;
  return_date: Date;
}

export interface SaleReturnRemoveJoinRow {
  id: string;
  branch_id: string;
  refund_method: string | null;
  refund_amount: number | string | null;
  return_date: Date | null;
  on_account: boolean;
  customer_id: string | null;
}

export interface SaleReturnItemStockRow {
  product_id: string | null;
  batch_id: string | null;
  quantity: number | string;
}

export interface BatchQtyLockRow {
  quantity: number | string;
}

@Injectable()
export class SaleReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly tenantService: TenantService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async findAll(schemaName: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<SaleReturnListRow[]>(
        `SELECT id, sale_id, branch_id, reason, return_date, refund_method, refund_amount
         FROM sale_returns
         WHERE branch_id = ANY($1::uuid[])
         ORDER BY return_date DESC`,
        allowedBranchIds,
      ),
    );
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<SaleReturnListRow[]>(
        `SELECT id, sale_id, branch_id, reason, return_date, refund_method, refund_amount
         FROM sale_returns
         WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      return row ?? null;
    });
  }

  async sumReturnedQtyForSaleItem(
    tx: Prisma.TransactionClient,
    saleItemId: string,
  ): Promise<number> {
    const [r] = await tx.$queryRawUnsafe<{ q: number }[]>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS q
       FROM sale_return_items
       WHERE sale_item_id = $1`,
      saleItemId,
    );
    return Number(r?.q ?? 0);
  }

  /**
   * Inserts sale_return_items and restores batch + inventory.
   * Caller must insert the sale_returns row first.
   */
  /**
   * Post journal for a return after `sale_return_items` exist (same transaction).
   */
  async attachAccountingForSaleReturn(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      saleReturnId: string;
      refundAmount: number;
      refundMethod: string | null | undefined;
      entryDate: Date | string;
      creditToReceivable?: boolean;
      customerId?: string | null;
    },
  ): Promise<void> {
    const [cogsRow] = await tx.$queryRawUnsafe<{ t: string }[]>(
      `SELECT COALESCE(SUM(sri.quantity * COALESCE(b.cost_price, 0)), 0)::numeric AS t
       FROM sale_return_items sri
       LEFT JOIN batches b ON b.id = sri.batch_id
       WHERE sri.sale_return_id = $1::uuid`,
      params.saleReturnId,
    );
    const cogsReversal = Number(cogsRow?.t ?? 0);
    await this.accountingPosting.postSaleReturnJournal(tx, {
      branchId: params.branchId,
      saleReturnId: params.saleReturnId,
      refundAmount: params.refundAmount,
      refundMethod: params.refundMethod,
      cogsReversalTotal: cogsReversal,
      entryDate: params.entryDate,
      creditToReceivable: params.creditToReceivable,
      customerId: params.customerId,
    });
  }

  async processReturnLineItemsInTx(
    tx: Prisma.TransactionClient,
    params: {
      saleReturnId: string;
      saleId: string;
      branchId: string;
      items: SaleReturnLineInput[];
    },
  ): Promise<void> {
    for (const item of params.items) {
      const [saleItem] = await tx.$queryRawUnsafe<SaleItemForReturnRow[]>(
        `SELECT id, product_id, batch_id, quantity
         FROM sale_items
         WHERE id = $1 AND sale_id = $2
         FOR UPDATE`,
        item.saleItemId,
        params.saleId,
      );
      if (!saleItem) {
        throw new BadRequestException('Invalid sale item in return request');
      }

      const soldQty = Number(saleItem.quantity ?? 0);
      const alreadyReturned = await this.sumReturnedQtyForSaleItem(
        tx,
        saleItem.id,
      );
      const remaining = soldQty - alreadyReturned;
      if (item.quantity <= 0 || item.quantity > remaining) {
        throw new BadRequestException(
          'Return quantity exceeds remaining quantity for this line',
        );
      }

      await tx.$queryRawUnsafe(
        `INSERT INTO sale_return_items (sale_return_id, sale_item_id, product_id, batch_id, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        params.saleReturnId,
        saleItem.id,
        saleItem.product_id ?? null,
        saleItem.batch_id ?? null,
        item.quantity,
      );

      if (!saleItem.product_id) {
        throw new BadRequestException('Sale item does not have a product');
      }

      if (saleItem.batch_id) {
        await tx.$queryRawUnsafe(
          `UPDATE batches
           SET quantity = COALESCE(quantity, 0) + $2
           WHERE id = $1`,
          saleItem.batch_id,
          item.quantity,
        );
      }

      await this.inventoryService.increaseStock(tx, {
        branchId: params.branchId,
        productId: saleItem.product_id,
        quantity: item.quantity,
      });
    }
  }

  async create(
    schemaName: string,
    branchId: string,
    dto: {
      saleId: string;
      reason?: string;
      refundMethod?: string;
      refundAmount?: number;
      items: SaleReturnLineInput[];
    },
    ctx?: SaleReturnMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const saleReturn = await this.prisma.withTenantSchema(
      schemaName,
      async (tx) => {
      await this.lockDates.assertDocumentDateOpen(tx, branchId, new Date());

      const [sale] = await tx.$queryRawUnsafe<SaleForReturnRow[]>(
        `SELECT id, branch_id, on_account, customer_id
         FROM sales
         WHERE id = $1`,
        dto.saleId,
      );
      if (!sale) {
        throw new BadRequestException('Sale not found');
      }
      if (sale.branch_id !== branchId) {
        throw new BadRequestException('Sale does not belong to active branch');
      }

      let refundTotal = 0;
      if (
        dto.refundAmount != null &&
        Number.isFinite(Number(dto.refundAmount)) &&
        Number(dto.refundAmount) > 0
      ) {
        refundTotal = Number(dto.refundAmount);
      } else {
        for (const it of dto.items) {
          const [si] = await tx.$queryRawUnsafe<SaleItemPriceRow[]>(
            `SELECT price FROM sale_items WHERE id = $1::uuid AND sale_id = $2::uuid`,
            it.saleItemId,
            dto.saleId,
          );
          const unit = Number(si?.price ?? 0);
          refundTotal += unit * it.quantity;
        }
      }

      const [saleReturn] = await tx.$queryRawUnsafe<SaleReturnInsertRow[]>(
        `INSERT INTO sale_returns (sale_id, branch_id, reason, refund_method, refund_amount)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, sale_id, branch_id, reason, refund_method, refund_amount, return_date`,
        dto.saleId,
        branchId,
        dto.reason ?? null,
        dto.refundMethod ?? null,
        refundTotal > 0 ? refundTotal : null,
      );

      await this.processReturnLineItemsInTx(tx, {
        saleReturnId: saleReturn.id,
        saleId: dto.saleId,
        branchId,
        items: dto.items,
      });

      const onAccount = Boolean(sale.on_account);
      await this.attachAccountingForSaleReturn(tx, {
        branchId,
        saleReturnId: saleReturn.id,
        refundAmount: refundTotal,
        refundMethod: dto.refundMethod,
        entryDate: saleReturn.return_date ?? new Date(),
        creditToReceivable: onAccount,
        customerId: sale.customer_id ?? null,
      });

      await this.auditLog.append(tx, {
        branchId,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'sale_returns',
        recordId: saleReturn.id,
        action: 'create',
        newPayload: {
          sale_id: dto.saleId,
          refund_amount: refundTotal,
        },
      });

      return saleReturn;
      },
    );
    await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
      schemaName,
      branchIds: [branchId],
    });
    return saleReturn;
  }

  async update(
    schemaName: string,
    id: string,
    allowedBranchIds: string[],
    dto: { reason?: string },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<SaleReturnInsertRow[]>(
        `UPDATE sale_returns
         SET reason = COALESCE($3, reason)
         WHERE id = $1 AND branch_id = ANY($2::uuid[])
         RETURNING id, sale_id, branch_id, reason, refund_method, refund_amount, return_date`,
        id,
        allowedBranchIds,
        dto.reason ?? null,
      );
      return row ?? null;
    });
  }

  async remove(
    schemaName: string,
    id: string,
    allowedBranchIds: string[],
    ctx?: SaleReturnMutationContext,
  ) {
    const out = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [saleReturn] = await tx.$queryRawUnsafe<SaleReturnRemoveJoinRow[]>(
        `SELECT sr.id,
                sr.branch_id,
                sr.refund_method,
                sr.refund_amount,
                sr.return_date,
                s.on_account,
                s.customer_id
         FROM sale_returns sr
         INNER JOIN sales s ON s.id = sr.sale_id
         WHERE sr.id = $1 AND sr.branch_id = ANY($2::uuid[])
         FOR UPDATE`,
        id,
        allowedBranchIds,
      );
      if (!saleReturn) {
        return { deleted: false as const, branch_id: null as string | null };
      }

      await this.lockDates.assertDocumentDateOpen(
        tx,
        saleReturn.branch_id,
        saleReturn.return_date ?? new Date(),
      );

      const [posted] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c
         FROM journal_entries
         WHERE branch_id = $1::uuid
           AND source_type = 'sale_return'
           AND source_id = $2::uuid`,
        saleReturn.branch_id,
        id,
      );
      if (Number(posted?.c ?? 0) > 0) {
        let refundTotal = Number(saleReturn.refund_amount ?? 0);
        if (!Number.isFinite(refundTotal) || refundTotal <= 0) {
          const [sumRow] = await tx.$queryRawUnsafe<{ t: string }[]>(
            `SELECT COALESCE(SUM(sri.quantity * COALESCE(si.price, 0)), 0)::numeric AS t
             FROM sale_return_items sri
             INNER JOIN sale_items si ON si.id = sri.sale_item_id
             WHERE sri.sale_return_id = $1::uuid`,
            id,
          );
          refundTotal = Number(sumRow?.t ?? 0);
        }
        const [cogsRow] = await tx.$queryRawUnsafe<{ t: string }[]>(
          `SELECT COALESCE(SUM(sri.quantity * COALESCE(b.cost_price, 0)), 0)::numeric AS t
           FROM sale_return_items sri
           LEFT JOIN batches b ON b.id = sri.batch_id
           WHERE sri.sale_return_id = $1::uuid`,
          id,
        );
        const cogsReversal = Number(cogsRow?.t ?? 0);
        await this.accountingPosting.postSaleReturnReversalJournal(tx, {
          branchId: saleReturn.branch_id,
          saleReturnId: id,
          refundAmount: refundTotal,
          refundMethod: saleReturn.refund_method,
          cogsReversalTotal: cogsReversal,
          entryDate: saleReturn.return_date ?? new Date(),
          creditToReceivable: Boolean(saleReturn.on_account),
          customerId: saleReturn.customer_id ?? null,
        });
      }

      const items = await tx.$queryRawUnsafe<SaleReturnItemStockRow[]>(
        `SELECT product_id, batch_id, quantity
         FROM sale_return_items
         WHERE sale_return_id = $1
         FOR UPDATE`,
        id,
      );

      for (const item of items) {
        const qty = Number(item.quantity ?? 0);
        if (!item.product_id || qty <= 0) continue;

        if (item.batch_id) {
          const [batch] = await tx.$queryRawUnsafe<BatchQtyLockRow[]>(
            `SELECT quantity
             FROM batches
             WHERE id = $1
             FOR UPDATE`,
            item.batch_id,
          );
          const currentBatchQty = Number(batch?.quantity ?? 0);
          if (currentBatchQty < qty) {
            throw new BadRequestException(
              'Cannot delete return: batch stock is lower than returned quantity',
            );
          }
          await tx.$queryRawUnsafe(
            `UPDATE batches
             SET quantity = quantity - $2
             WHERE id = $1`,
            item.batch_id,
            qty,
          );
        }

        await this.inventoryService.decreaseStock(tx, {
          branchId: saleReturn.branch_id,
          productId: item.product_id,
          quantity: qty,
        });
      }

      await tx.$queryRawUnsafe(`DELETE FROM sale_returns WHERE id = $1`, id);

      await this.auditLog.append(tx, {
        branchId: saleReturn.branch_id,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'sale_returns',
        recordId: id,
        action: 'remove',
        oldPayload: { return_date: saleReturn.return_date },
      });

      return { deleted: true as const, branch_id: saleReturn.branch_id };
    });
    if (out.deleted && out.branch_id) {
      await this.cacheInvalidation.invalidateAfterLedgerOrInventoryMutation({
        schemaName,
        branchIds: [out.branch_id],
      });
    }
    return { deleted: out.deleted };
  }
}
