import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SaleReturnsService } from '../sale-returns/sale-returns.service';
import { TenantService } from '../tenant/tenant.service';
import { PosApprovalsService } from '../pos-approvals/pos-approvals.service';

const PRICE_EPS = 0.02;

export interface SaleBranchRow {
  id: string;
  branch_id: string;
}

export interface SaleItemLineRow {
  id: string;
  sale_id: string;
  product_id: string | null;
  batch_id: string | null;
  quantity: number | string;
  price: number | string | null;
  uom_id?: string | null;
  entered_quantity?: number | string | null;
  conversion_factor_snapshot?: number | string | null;
  base_quantity?: number | string | null;
}

export interface ReturnVoucherInsertRow {
  id: string;
  branch_id: string;
  sale_id: string;
  sale_item_id: string;
  quantity: number | string;
  uom_id?: string | null;
  entered_quantity?: number | string | null;
  conversion_factor_snapshot?: number | string | null;
  base_quantity?: number | string | null;
  unit_price: number | string | null;
  token: string;
  status: string;
  reason: string | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface ReturnVoucherLockedRow {
  id: string;
  branch_id: string;
  sale_id: string;
  sale_item_id: string;
  quantity: number | string;
  uom_id?: string | null;
  entered_quantity?: number | string | null;
  conversion_factor_snapshot?: number | string | null;
  base_quantity?: number | string | null;
  unit_price: number | string | null;
  token: string;
  status: string;
  reason: string | null;
  expires_at: Date | null;
  sale_return_id: string | null;
  used_at: Date | null;
  created_at: Date;
}

export interface SaleReturnInsertRow {
  id: string;
  sale_id: string;
  branch_id: string;
  reason: string | null;
  refund_method: string;
  refund_amount: number | string;
  return_date: Date;
}

export interface ReturnVoucherLookupRow {
  id: string;
  branchId: string;
  saleId: string;
  saleItemId: string;
  quantity: number | string;
  uomId?: string | null;
  enteredQuantity?: number | string | null;
  conversionFactorSnapshot?: number | string | null;
  baseQuantity?: number | string | null;
  unitPrice: number | string | null;
  token: string;
  status: string;
  reason: string | null;
  saleReturnId: string | null;
  expiresAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ReturnVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saleReturnsService: SaleReturnsService,
    private readonly tenantService: TenantService,
    private readonly posApprovals: PosApprovalsService,
  ) {}

  private async sumPendingVoucherQty(
    tx: Prisma.TransactionClient,
    saleItemId: string,
    excludeVoucherId?: string,
  ): Promise<number> {
    const [r] = await tx.$queryRawUnsafe<{ q: number }[]>(
      `SELECT COALESCE(SUM(quantity), 0)::int AS q
       FROM return_vouchers
       WHERE sale_item_id = $1
         AND status = 'pending'
         AND ($2::uuid IS NULL OR id <> $2::uuid)`,
      saleItemId,
      excludeVoucherId ?? null,
    );
    return Number(r?.q ?? 0);
  }

  async create(
    schemaName: string,
    branchId: string,
    dto: {
      saleId: string;
      saleItemId: string;
      quantity: number;
      reason?: string;
    },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [sale] = await tx.$queryRawUnsafe<SaleBranchRow[]>(
        `SELECT id, branch_id FROM sales WHERE id = $1 FOR UPDATE`,
        dto.saleId,
      );
      if (!sale) {
        throw new BadRequestException('Sale not found');
      }
      if (sale.branch_id !== branchId) {
        throw new BadRequestException('Sale does not belong to active branch');
      }

      const [saleItem] = await tx.$queryRawUnsafe<SaleItemLineRow[]>(
        `SELECT id, sale_id, product_id, batch_id, quantity, price,
                uom_id, entered_quantity, conversion_factor_snapshot, base_quantity
         FROM sale_items
         WHERE id = $1 AND sale_id = $2
         FOR UPDATE`,
        dto.saleItemId,
        dto.saleId,
      );
      if (!saleItem) {
        throw new BadRequestException('Sale line not found');
      }

      const alreadyReturned =
        await this.saleReturnsService.sumReturnedQtyForSaleItem(
          tx,
          saleItem.id,
        );
      const pendingVoucher = await this.sumPendingVoucherQty(tx, saleItem.id);
      const resolvedQuantity = this.saleReturnsService.resolveReturnQuantity(
        dto.quantity,
        saleItem,
        alreadyReturned + pendingVoucher,
      );

      const unitPrice = Number(saleItem.price ?? 0);
      const token = randomBytes(32).toString('hex');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      const [row] = await tx.$queryRawUnsafe<ReturnVoucherInsertRow[]>(
        `INSERT INTO return_vouchers (
           branch_id, sale_id, sale_item_id, quantity,
           uom_id, entered_quantity, conversion_factor_snapshot, base_quantity,
           unit_price, token, status, reason, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $4, $8, $9, 'pending', $10, $11)
         RETURNING id, branch_id, sale_id, sale_item_id, quantity,
                   uom_id, entered_quantity, conversion_factor_snapshot, base_quantity,
                   unit_price, token, status, reason, expires_at, created_at`,
        branchId,
        dto.saleId,
        dto.saleItemId,
        resolvedQuantity.baseQuantity,
        saleItem.uom_id ?? null,
        resolvedQuantity.enteredQuantity,
        resolvedQuantity.conversionFactor,
        unitPrice,
        token,
        dto.reason ?? null,
        expiresAt,
      );

      return {
        ...row,
        barcodeValue: token,
      };
    });
  }

  async finalize(
    schemaName: string,
    branchId: string,
    voucherId: string,
    dto: {
      token: string;
      confirmedProductId: string;
      scannedUnitPrice?: number;
      refundMethod: string;
      approvalId: string;
    },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    await this.posApprovals.assertApprovedRequest(
      schemaName,
      branchId,
      dto.approvalId,
      'refund',
      (payload) =>
        String(payload.voucherId ?? '') === voucherId ||
        String(payload.returnVoucherId ?? '') === voucherId,
    );
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [v] = await tx.$queryRawUnsafe<ReturnVoucherLockedRow[]>(
        `SELECT id, branch_id, sale_id, sale_item_id, quantity,
                uom_id, entered_quantity, conversion_factor_snapshot, base_quantity,
                unit_price, token, status, reason, expires_at, sale_return_id, used_at, created_at
         FROM return_vouchers
         WHERE id = $1 AND branch_id = $2::uuid
         FOR UPDATE`,
        voucherId,
        branchId,
      );
      if (!v) {
        throw new BadRequestException('Return voucher not found');
      }
      if (v.status !== 'pending') {
        throw new BadRequestException('Voucher is not pending');
      }
      if (v.token !== dto.token) {
        throw new BadRequestException('Invalid voucher token');
      }
      if (v.expires_at && new Date(v.expires_at) < new Date()) {
        throw new BadRequestException('Voucher has expired');
      }

      const [saleItem] = await tx.$queryRawUnsafe<SaleItemLineRow[]>(
        `SELECT id, sale_id, product_id, batch_id, quantity, price,
                uom_id, entered_quantity, conversion_factor_snapshot, base_quantity
         FROM sale_items
         WHERE id = $1 AND sale_id = $2
         FOR UPDATE`,
        v.sale_item_id,
        v.sale_id,
      );
      if (!saleItem) {
        throw new BadRequestException('Original sale line missing');
      }
      if (saleItem.product_id !== dto.confirmedProductId) {
        throw new BadRequestException(
          'Scanned product does not match this return',
        );
      }

      const voucherUnit = Number(v.unit_price ?? 0);
      const linePrice = Number(saleItem.price ?? 0);
      if (Math.abs(voucherUnit - linePrice) > PRICE_EPS) {
        throw new BadRequestException(
          'Sale line price no longer matches voucher',
        );
      }

      if (dto.scannedUnitPrice !== undefined && dto.scannedUnitPrice !== null) {
        if (Math.abs(Number(dto.scannedUnitPrice) - voucherUnit) > PRICE_EPS) {
          throw new BadRequestException('Scanned price does not match voucher');
        }
      }

      const refundQuantity = Number(
        v.entered_quantity ??
          Number(v.quantity ?? 0) /
            Number(v.conversion_factor_snapshot ?? 1),
      );
      const refundAmount = voucherUnit * refundQuantity;

      const [saleReturn] = await tx.$queryRawUnsafe<SaleReturnInsertRow[]>(
        `INSERT INTO sale_returns (sale_id, branch_id, reason, refund_method, refund_amount)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, sale_id, branch_id, reason, refund_method, refund_amount, return_date`,
        v.sale_id,
        branchId,
        v.reason ?? 'Return voucher',
        dto.refundMethod,
        refundAmount,
      );

      await this.saleReturnsService.processReturnLineItemsInTx(tx, {
        saleReturnId: saleReturn.id,
        saleId: v.sale_id,
        branchId,
        items: [{ saleItemId: v.sale_item_id, quantity: Number(v.quantity) }],
      });

      await this.saleReturnsService.attachAccountingForSaleReturn(tx, {
        branchId,
        saleReturnId: saleReturn.id,
        refundAmount,
        refundMethod: dto.refundMethod,
        entryDate: saleReturn.return_date ?? new Date(),
      });

      await tx.$queryRawUnsafe(
        `UPDATE return_vouchers
         SET status = 'completed', used_at = NOW(), sale_return_id = $2
         WHERE id = $1`,
        voucherId,
        saleReturn.id,
      );

      const [saleRow] = await tx.$queryRawUnsafe<
        { receipt_number: string | null }[]
      >(`SELECT receipt_number FROM sales WHERE id = $1`, v.sale_id);

      return {
        saleReturn,
        refundAmount,
        receiptNumber: saleRow?.receipt_number ?? null,
        originalSaleId: v.sale_id,
      };
    });
  }

  async findByToken(
    schemaName: string,
    branchId: string,
    token: string,
    allowedBranchIds: string[],
  ) {
    const t = token?.trim();
    if (!t) {
      return null;
    }
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<ReturnVoucherLookupRow[]>(
        `SELECT
           id,
           branch_id AS "branchId",
           sale_id AS "saleId",
           sale_item_id AS "saleItemId",
           quantity,
           uom_id AS "uomId",
           entered_quantity AS "enteredQuantity",
           conversion_factor_snapshot AS "conversionFactorSnapshot",
           base_quantity AS "baseQuantity",
           unit_price AS "unitPrice",
           token,
           status,
           reason,
           sale_return_id AS "saleReturnId",
           expires_at AS "expiresAt",
           used_at AS "usedAt",
           created_at AS "createdAt"
         FROM return_vouchers
         WHERE token = $1
           AND branch_id = $2::uuid
           AND branch_id = ANY($3::uuid[])`,
        t,
        branchId,
        allowedBranchIds,
      );
      return row ?? null;
    });
  }
}
