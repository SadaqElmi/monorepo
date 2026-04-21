import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { TenantService } from '../tenant/tenant.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';

export type SalesMutationContext = {
  actorUserId?: string | null;
};

@Injectable()
export class SalesService {
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
      tx.$queryRawUnsafe(
        `SELECT id, branch_id, receipt_number, total_amount, discount, tax, sale_date,
                customer_id, on_account
         FROM sales
         WHERE branch_id = ANY($1::uuid[])
         ORDER BY sale_date DESC`,
        allowedBranchIds,
      ),
    );
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, branch_id, receipt_number, total_amount, discount, tax, sale_date,
                customer_id, on_account
         FROM sales
         WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!row) return null;
      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, sale_id, branch_id, product_id, batch_id, quantity, price, total
         FROM sale_items
         WHERE sale_id = $1
         ORDER BY id`,
        id,
      );
      return { ...row, items };
    });
  }

  async findByReceiptNumber(
    schemaName: string,
    branchId: string,
    receiptNumber: string,
    allowedBranchIds: string[],
  ) {
    const t = receiptNumber.trim();
    const candidates = new Set<string>([t]);
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      candidates.add(String(n).padStart(5, '0'));
    }
    const variants = [...candidates];
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, branch_id, receipt_number, total_amount, discount, tax, sale_date,
                customer_id, on_account
         FROM sales
         WHERE branch_id = $1::uuid
           AND branch_id = ANY($2::uuid[])
           AND receipt_number = ANY($3::text[])`,
        branchId,
        allowedBranchIds,
        variants,
      );
      if (!row) return null;
      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, sale_id, branch_id, product_id, batch_id, quantity, price, total
         FROM sale_items
         WHERE sale_id = $1
         ORDER BY id`,
        row.id,
      );
      return { ...row, items };
    });
  }

  private async nextReceiptNumber(tx: any, branchId: string): Promise<string> {
    const [r] = (await tx.$queryRawUnsafe(
      `SELECT COALESCE(MAX(CAST(receipt_number AS INTEGER)), 0) + 1 AS next_n
       FROM sales
       WHERE branch_id = $1::uuid
         AND receipt_number IS NOT NULL
         AND receipt_number ~ '^[0-9]+$'`,
      branchId,
    )) as { next_n: number }[];
    const n = Number(r?.next_n ?? 1);
    return String(n).padStart(5, '0');
  }

  async create(
    schemaName: string,
    branchId: string,
    dto: {
      totalAmount?: number;
      discount?: number;
      tax?: number;
      paymentMethod?: string;
      onAccount?: boolean;
      customerId?: string;
      items: Array<{
        productId: string;
        quantity: number;
        price?: number;
      }>;
    },
    ctx?: SalesMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.lockDates.assertDocumentDateOpen(tx, branchId, new Date());
      const onAccount = Boolean(dto.onAccount);
      if (onAccount) {
        if (!dto.customerId?.trim()) {
          throw new BadRequestException(
            'customerId is required for on-account (invoice) sales',
          );
        }
        const [cust] = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM customers WHERE id = $1::uuid`,
          dto.customerId,
        );
        if (!cust) {
          throw new BadRequestException('Customer not found');
        }
      }

      let computedTotal = 0;
      for (const item of dto.items) {
        computedTotal += Number(item.quantity ?? 0) * Number(item.price ?? 0);
      }

      const receiptNumber = await this.nextReceiptNumber(tx, branchId);

      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO sales (branch_id, receipt_number, total_amount, discount, tax, customer_id, on_account)
         VALUES ($1, $2, $3, COALESCE($4::numeric, 0::numeric), COALESCE($5::numeric, 0::numeric), $6::uuid, $7)
         RETURNING id, branch_id, receipt_number, total_amount, discount, tax, sale_date, customer_id, on_account`,
        branchId,
        receiptNumber,
        dto.totalAmount ?? computedTotal ?? null,
        dto.discount ?? 0,
        dto.tax ?? 0,
        onAccount ? dto.customerId : null,
        onAccount,
      );

      let cogsTotal = 0;

      for (const item of dto.items) {
        const qty = Number(item.quantity ?? 0);
        if (qty <= 0) {
          throw new BadRequestException(
            'Sale item quantity must be greater than 0',
          );
        }

        await this.inventoryService.ensureBatchesCoverAggregate(tx, {
          branchId,
          productId: item.productId,
        });

        const allocations = await this.inventoryService.consumeBatchesFifo(tx, {
          branchId,
          productId: item.productId,
          quantity: qty,
        });
        await this.inventoryService.decreaseStock(tx, {
          branchId,
          productId: item.productId,
          quantity: qty,
        });

        let unitPrice = Number(item.price ?? 0);
        if (unitPrice <= 0) {
          const [pRow] = await tx.$queryRawUnsafe<any[]>(
            `SELECT list_price FROM products WHERE id = $1::uuid`,
            item.productId,
          );
          unitPrice = Number(pRow?.list_price ?? 0);
        }

        for (const alloc of allocations) {
          const [batchRow] = await tx.$queryRawUnsafe<any[]>(
            `SELECT cost_price FROM batches WHERE id = $1::uuid`,
            alloc.batchId,
          );
          const unitCost = Number(batchRow?.cost_price ?? 0);
          cogsTotal += unitCost * alloc.quantity;

          await tx.$queryRawUnsafe(
            `INSERT INTO sale_items (sale_id, branch_id, product_id, batch_id, quantity, price, total)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            row.id,
            branchId,
            item.productId,
            alloc.batchId,
            alloc.quantity,
            unitPrice > 0 ? unitPrice : null,
            unitPrice > 0 ? unitPrice * alloc.quantity : null,
          );
        }
      }

      const [sumRow] = await tx.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(SUM(COALESCE(total, 0)), 0)::numeric AS t
         FROM sale_items WHERE sale_id = $1::uuid`,
        row.id,
      );
      const saleTotal = Number(sumRow?.t ?? 0);
      await tx.$queryRawUnsafe(
        `UPDATE sales SET total_amount = $2 WHERE id = $1::uuid`,
        row.id,
        saleTotal,
      );

      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, sale_id, branch_id, product_id, batch_id, quantity, price, total
         FROM sale_items
         WHERE sale_id = $1
         ORDER BY id`,
        row.id,
      );

      const [updatedSale] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, branch_id, receipt_number, total_amount, discount, tax, sale_date,
                customer_id, on_account
         FROM sales WHERE id = $1::uuid`,
        row.id,
      );

      const payMethod = dto.paymentMethod;
      if (!onAccount && payMethod && String(payMethod).trim()) {
        await tx.$queryRawUnsafe(
          `INSERT INTO payments (sale_id, method, amount, paid_at)
           VALUES ($1::uuid, $2, $3, NOW())`,
          row.id,
          String(payMethod).trim(),
          saleTotal,
        );
      }

      const entryDate = updatedSale?.sale_date ?? new Date();
      await this.accountingPosting.postSaleJournal(tx, {
        branchId,
        saleId: row.id,
        saleTotal,
        paymentMethod: onAccount
          ? null
          : payMethod && String(payMethod).trim()
            ? String(payMethod).trim()
            : 'cash',
        cogsTotal,
        entryDate,
        useReceivable: onAccount,
        customerId: onAccount ? (dto.customerId ?? null) : null,
      });

      await this.auditLog.append(tx, {
        branchId,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'sales',
        recordId: row.id,
        action: 'create',
        newPayload: {
          receipt_number: updatedSale?.receipt_number,
          total_amount: saleTotal,
          on_account: onAccount,
        },
      });

      return { ...updatedSale, items };
    });
  }

  async update(
    schemaName: string,
    id: string,
    branchId: string,
    allowedBranchIds: string[],
    dto: {
      totalAmount?: number;
      discount?: number;
      tax?: number;
      items?: Array<{
        productId: string;
        quantity: number;
        price?: number;
      }>;
    },
    ctx?: SalesMutationContext,
  ) {
    if (dto.items?.length) {
      throw new BadRequestException(
        'Editing sale items is not allowed. Use returns to adjust stock.',
      );
    }
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [existing] = await tx.$queryRawUnsafe<
        { id: string; sale_date: Date | string; branch_id: string }[]
      >(
        `SELECT id, sale_date, branch_id FROM sales
         WHERE id = $1::uuid AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!existing) {
        return null;
      }
      await this.lockDates.assertDocumentDateOpen(
        tx,
        existing.branch_id,
        existing.sale_date,
      );

      const [row] = await tx.$queryRawUnsafe<any[]>(
        `UPDATE sales
         SET branch_id = $2,
             total_amount = COALESCE($3, total_amount),
             discount = COALESCE($4, discount),
             tax = COALESCE($5, tax)
         WHERE id = $1 AND branch_id = ANY($6::uuid[])
         RETURNING id, branch_id, receipt_number, total_amount, discount, tax, sale_date,
                  customer_id, on_account`,
        id,
        branchId,
        dto.totalAmount ?? null,
        dto.discount ?? null,
        dto.tax ?? null,
        allowedBranchIds,
      );
      if (row) {
        await this.auditLog.append(tx, {
          branchId: row.branch_id,
          actorUserId: ctx?.actorUserId ?? null,
          tableName: 'sales',
          recordId: row.id,
          action: 'update',
          newPayload: {
            total_amount: row.total_amount,
            discount: row.discount,
            tax: row.tax,
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
    ctx?: SalesMutationContext,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [sale] = await tx.$queryRawUnsafe<
        {
          id: string;
          branch_id: string;
          sale_date: Date | string;
        }[]
      >(
        `SELECT id, branch_id, sale_date FROM sales
         WHERE id = $1::uuid AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!sale) {
        return { deleted: false };
      }
      await this.lockDates.assertDocumentDateOpen(
        tx,
        sale.branch_id,
        sale.sale_date,
      );

      const [itemCount] = await tx.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count
         FROM sale_items
         WHERE sale_id = $1`,
        id,
      );
      if (Number(itemCount?.count ?? 0) > 0) {
        throw new BadRequestException(
          'Cannot delete sale with items. Use sale return workflow.',
        );
      }

      const [posted] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c
         FROM journal_entries
         WHERE branch_id = $1::uuid
           AND source_id = $2::uuid
           AND source_type IN ('sale', 'customer_invoice')`,
        sale.branch_id,
        id,
      );
      if (Number(posted?.c ?? 0) > 0) {
        throw new BadRequestException(
          'Cannot delete a sale that has been posted to the general ledger. Use sale returns to correct stock and revenue.',
        );
      }

      await tx.$queryRawUnsafe(
        `DELETE FROM sales WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      await this.auditLog.append(tx, {
        branchId: sale.branch_id,
        actorUserId: ctx?.actorUserId ?? null,
        tableName: 'sales',
        recordId: id,
        action: 'remove',
        oldPayload: { sale_date: sale.sale_date },
      });
      return { deleted: true };
    });
  }
}
