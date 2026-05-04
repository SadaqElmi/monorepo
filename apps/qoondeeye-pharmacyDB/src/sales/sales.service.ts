import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { TenantService } from '../tenant/tenant.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { maxSaleDiscountPercentForRole } from './sales-discount.policy';

export type SalesMutationContext = {
  actorUserId?: string | null;
  /** JWT role for POS discount caps (cashier/pharmacist 1%; manager/admin 10%). */
  requestUserRole?: string | null;
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
        `SELECT s.id, s.branch_id, s.receipt_number, s.total_amount, s.discount, s.tax, s.sale_date,
                s.customer_id, s.on_account,
                (SELECT p.method FROM payments p WHERE p.sale_id = s.id ORDER BY p.paid_at ASC NULLS LAST LIMIT 1) AS payment_method
         FROM sales s
         WHERE s.branch_id = ANY($1::uuid[])
         ORDER BY s.sale_date DESC`,
        allowedBranchIds,
      ),
    );
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `SELECT s.id, s.branch_id, s.receipt_number, s.total_amount, s.discount, s.tax, s.sale_date,
                s.customer_id, s.on_account,
                (SELECT p.method FROM payments p WHERE p.sale_id = s.id ORDER BY p.paid_at ASC NULLS LAST LIMIT 1) AS payment_method
         FROM sales s
         WHERE s.id = $1 AND s.branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      if (!row) return null;
      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, sale_id, branch_id, product_id, batch_id, quantity, price, total, misc_charge_kind
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
        `SELECT s.id, s.branch_id, s.receipt_number, s.total_amount, s.discount, s.tax, s.sale_date,
                s.customer_id, s.on_account,
                (SELECT p.method FROM payments p WHERE p.sale_id = s.id ORDER BY p.paid_at ASC NULLS LAST LIMIT 1) AS payment_method
         FROM sales s
         WHERE s.branch_id = $1::uuid
           AND s.branch_id = ANY($2::uuid[])
           AND s.receipt_number = ANY($3::text[])`,
        branchId,
        allowedBranchIds,
        variants,
      );
      if (!row) return null;
      const items = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, sale_id, branch_id, product_id, batch_id, quantity, price, total, misc_charge_kind
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
      posSessionId?: string;
      items: Array<{
        productId?: string;
        miscChargeKind?: string;
        quantity: number;
        price?: number;
      }>;
    },
    ctx?: SalesMutationContext,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    let lineSubtotal = 0;
    for (const item of dto.items) {
      lineSubtotal += Number(item.quantity ?? 0) * Number(item.price ?? 0);
    }
    const discountAmt = Number(dto.discount ?? 0);
    if (!Number.isFinite(discountAmt) || discountAmt < 0) {
      throw new BadRequestException('Invalid discount amount');
    }
    const maxPct = maxSaleDiscountPercentForRole(ctx?.requestUserRole);
    if (lineSubtotal <= 0 && discountAmt > 0) {
      throw new BadRequestException(
        'Discount is not allowed when line subtotal is zero',
      );
    }
    if (lineSubtotal > 0 && discountAmt > 0) {
      const pct = (discountAmt / lineSubtotal) * 100;
      if (pct > maxPct + 1e-6) {
        throw new BadRequestException(
          `Discount exceeds the maximum ${maxPct}% allowed for your role`,
        );
      }
    }

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

      let posSessionId: string | null = null;
      const psRaw = dto.posSessionId?.trim();
      if (psRaw) {
        const [sess] = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM pos_sessions
           WHERE id = $1::uuid AND branch_id = $2::uuid AND status = 'open'`,
          psRaw,
          branchId,
        );
        if (!sess) {
          throw new BadRequestException(
            'Invalid or closed POS session for this branch',
          );
        }
        posSessionId = sess.id;
      }

      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO sales (branch_id, pos_session_id, receipt_number, total_amount, discount, tax, customer_id, on_account)
         VALUES ($1, $2::uuid, $3, $4, COALESCE($5::numeric, 0::numeric), COALESCE($6::numeric, 0::numeric), $7::uuid, $8)
         RETURNING id, branch_id, receipt_number, total_amount, discount, tax, sale_date, customer_id, on_account`,
        branchId,
        posSessionId,
        receiptNumber,
        dto.totalAmount ?? computedTotal ?? null,
        dto.discount ?? 0,
        dto.tax ?? 0,
        onAccount ? dto.customerId : null,
        onAccount,
      );

      let cogsTotal = 0;

      const miscKinds = new Set(['delivery', 'tailor']);

      for (const item of dto.items) {
        const qty = Number(item.quantity ?? 0);
        if (qty <= 0) {
          throw new BadRequestException(
            'Sale item quantity must be greater than 0',
          );
        }

        const miscRaw = item.miscChargeKind?.trim();
        const pid = item.productId?.trim();
        const hasMisc = Boolean(miscRaw);
        const hasProd = Boolean(pid);
        if (hasMisc === hasProd) {
          throw new BadRequestException(
            'Each item must have exactly one of productId or miscChargeKind',
          );
        }

        if (miscRaw) {
          if (!miscKinds.has(miscRaw)) {
            throw new BadRequestException('Invalid miscChargeKind');
          }
          let unitPrice = Number(item.price ?? 0);
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
            throw new BadRequestException(
              'Manual charge lines require a positive unit price',
            );
          }
          const lineTotal = unitPrice * qty;
          await tx.$queryRawUnsafe(
            `INSERT INTO sale_items (sale_id, branch_id, product_id, batch_id, quantity, price, total, misc_charge_kind)
             VALUES ($1::uuid, $2::uuid, NULL, NULL, $3, $4, $5, $6)`,
            row.id,
            branchId,
            qty,
            unitPrice,
            lineTotal,
            miscRaw,
          );
          continue;
        }

        await this.inventoryService.ensureBatchesCoverAggregate(tx, {
          branchId,
          productId: pid!,
        });

        const allocations = await this.inventoryService.consumeBatchesFifo(tx, {
          branchId,
          productId: pid!,
          quantity: qty,
        });
        await this.inventoryService.decreaseStock(tx, {
          branchId,
          productId: pid!,
          quantity: qty,
        });

        let unitPrice = Number(item.price ?? 0);
        if (unitPrice <= 0) {
          const [pRow] = await tx.$queryRawUnsafe<any[]>(
            `SELECT list_price FROM products WHERE id = $1::uuid`,
            pid,
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
            pid,
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
        `SELECT id, sale_id, branch_id, product_id, batch_id, quantity, price, total, misc_charge_kind
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

      const paymentMethodOut = onAccount
        ? null
        : payMethod && String(payMethod).trim()
          ? String(payMethod).trim()
          : 'cash';

      return { ...updatedSale, items, payment_method: paymentMethodOut };
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
