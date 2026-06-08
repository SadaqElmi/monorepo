import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toPagedResult, type PagedResult } from '../common/pagination.util';
import { PrismaService } from '../prisma/prisma.service';
import { formatBaseQuantityDisplay } from '../uoms/uom-display.util';
import { UomsService } from '../uoms/uoms.service';

export interface InventoryLockRow {
  id: string;
  quantity: number | string;
  reorder_level: number | string;
}

export interface InventoryListRow {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number | string;
  reorder_level: number | string;
  updated_at: Date;
  base_uom_code?: string | null;
  base_uom_symbol?: string | null;
  converted_quantity?: string;
}

export interface BatchFifoRow {
  id: string;
  quantity: number | string | null;
  cost_price: number | string | null;
}

export interface ProductListPriceRow {
  list_price: number | string | null;
}

export interface SumQtyRow {
  q: number | string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uomsService: UomsService,
  ) {}

  private async getOrCreateInventoryRow(
    tx: Prisma.TransactionClient,
    branchId: string,
    productId: string,
  ) {
    const [existing] = await tx.$queryRawUnsafe<InventoryLockRow[]>(
      `SELECT id, quantity, reorder_level
       FROM inventory
       WHERE branch_id = $1 AND product_id = $2
       FOR UPDATE`,
      branchId,
      productId,
    );
    if (existing) {
      return existing;
    }

    const [created] = await tx.$queryRawUnsafe<InventoryLockRow[]>(
      `INSERT INTO inventory (branch_id, product_id, quantity, reorder_level)
       VALUES ($1, $2, 0, 10)
       ON CONFLICT (product_id, branch_id) DO UPDATE
       SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, quantity, reorder_level`,
      branchId,
      productId,
    );
    return created;
  }

  async findAll(schemaName: string, allowedBranchIds: string[]) {
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<InventoryListRow[]>(
        `SELECT id, product_id, branch_id, quantity, reorder_level, updated_at
         FROM inventory
         WHERE branch_id = ANY($1::uuid[])
         ORDER BY product_id`,
        allowedBranchIds,
      ),
    );
    return this.withQuantityDisplay(schemaName, rows);
  }

  /** Not cached — stock levels must stay fresh for picking and POS. */
  async findAllPaged(
    schemaName: string,
    allowedBranchIds: string[],
    skip: number,
    take: number,
  ): Promise<PagedResult<InventoryListRow>> {
    const result = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM inventory WHERE branch_id = ANY($1::uuid[])`,
        allowedBranchIds,
      );
      const total = Number(countRow?.c ?? 0);
      const items = await tx.$queryRawUnsafe<InventoryListRow[]>(
        `SELECT id, product_id, branch_id, quantity, reorder_level, updated_at
         FROM inventory
         WHERE branch_id = ANY($1::uuid[])
         ORDER BY product_id
         LIMIT $2 OFFSET $3`,
        allowedBranchIds,
        take,
        skip,
      );
      const page = Math.floor(skip / take) + 1;
      return { items, total, page };
    });
    const decorated = await this.withQuantityDisplay(schemaName, result.items);
    return toPagedResult(decorated, result.total, result.page, take);
  }

  /**
   * On-hand quantity per branch for one product (branches user can access).
   * Includes branches with no inventory row as quantity 0.
   */
  async stockByProduct(
    schemaName: string,
    productId: string,
    allowedBranchIds: string[],
  ) {
    if (!allowedBranchIds.length) {
      return [];
    }
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          branchId: string;
          branchName: string | null;
          product_id: string;
          quantity: number;
        }>
      >(
        `SELECT b.id AS "branchId",
                b.name AS "branchName",
                $1::uuid AS product_id,
                COALESCE(i.quantity, 0)::int AS quantity
         FROM branches b
         LEFT JOIN inventory i
           ON i.branch_id = b.id AND i.product_id = $1::uuid
         WHERE b.id = ANY($2::uuid[])
         ORDER BY b.name NULLS LAST`,
        productId,
        allowedBranchIds,
      ),
    );
    const decorated = await this.withQuantityDisplay(
      schemaName,
      rows.map((r) => ({
        id: `${r.branchId}:${productId}`,
        product_id: productId,
        branch_id: r.branchId,
        quantity: r.quantity,
        reorder_level: 0,
        updated_at: new Date(),
        branchId: r.branchId,
        branchName: r.branchName,
      })) as Array<InventoryListRow & { branchId: string; branchName: string | null }>,
    );
    return decorated.map((r) => ({
      branchId: r.branchId,
      branchName: r.branchName,
      quantity: Number(r.quantity),
      baseUomCode: r.base_uom_code,
      baseUomSymbol: r.base_uom_symbol,
      convertedQuantity: r.converted_quantity,
    }));
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<InventoryListRow[]>(
        `SELECT id, product_id, branch_id, quantity, reorder_level, updated_at
         FROM inventory
         WHERE id = $1 AND branch_id = ANY($2::uuid[])`,
        id,
        allowedBranchIds,
      );
      return row ?? null;
    });
    if (!row) return null;
    const [decorated] = await this.withQuantityDisplay(schemaName, [row]);
    return decorated ?? row;
  }

  private async withQuantityDisplay<T extends { product_id: string | null; quantity: number | string }>(
    schemaName: string,
    rows: T[],
  ): Promise<Array<T & {
    base_uom_code?: string | null;
    base_uom_symbol?: string | null;
    converted_quantity?: string;
  }>> {
    const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => Boolean(id)))];
    if (!productIds.length) return rows;
    const byProduct = await this.uomsService.listProductUomsForProducts(schemaName, productIds);
    return rows.map((row) => {
      const uoms = row.product_id ? byProduct[row.product_id] ?? [] : [];
      const base = uoms.find((u) => u.isBase);
      return {
        ...row,
        base_uom_code: base?.code ?? null,
        base_uom_symbol: base?.symbol ?? null,
        converted_quantity: formatBaseQuantityDisplay(Number(row.quantity ?? 0), uoms),
      };
    });
  }

  async increaseStock(
    tx: Prisma.TransactionClient,
    input: { branchId: string; productId: string; quantity: number },
  ): Promise<void> {
    if (!input.productId || input.quantity <= 0) {
      throw new BadRequestException('Invalid stock increase payload');
    }
    await this.getOrCreateInventoryRow(tx, input.branchId, input.productId);
    await tx.$queryRawUnsafe(
      `UPDATE inventory
       SET quantity = quantity + $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE branch_id = $1 AND product_id = $2`,
      input.branchId,
      input.productId,
      input.quantity,
    );
  }

  async decreaseStock(
    tx: Prisma.TransactionClient,
    input: { branchId: string; productId: string; quantity: number },
  ): Promise<void> {
    if (!input.productId || input.quantity <= 0) {
      throw new BadRequestException('Invalid stock decrease payload');
    }

    const row = await this.getOrCreateInventoryRow(
      tx,
      input.branchId,
      input.productId,
    );
    const available = Number(row?.quantity ?? 0);
    if (available < input.quantity) {
      throw new BadRequestException('Insufficient stock for sale');
    }

    await tx.$queryRawUnsafe(
      `UPDATE inventory
       SET quantity = quantity - $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE branch_id = $1 AND product_id = $2`,
      input.branchId,
      input.productId,
      input.quantity,
    );
  }

  /**
   * When aggregate inventory has quantity but batch rows do not cover it
   * (e.g. stock adjusted without batches), create a POS batch slice so FIFO sale works.
   */
  async ensureBatchesCoverAggregate(
    tx: Prisma.TransactionClient,
    input: { branchId: string; productId: string },
  ): Promise<void> {
    const [invRow] = await tx.$queryRawUnsafe<
      Array<{ quantity: number | string }>
    >(
      `SELECT quantity
       FROM inventory
       WHERE branch_id = $1::uuid AND product_id = $2::uuid
       FOR UPDATE`,
      input.branchId,
      input.productId,
    );
    const invQty = Number(invRow?.quantity ?? 0);
    if (invQty <= 0) return;

    const [sumRow] = await tx.$queryRawUnsafe<SumQtyRow[]>(
      `SELECT COALESCE(SUM(COALESCE(quantity, 0)), 0)::int AS q
       FROM batches
       WHERE branch_id = $1::uuid AND product_id = $2::uuid`,
      input.branchId,
      input.productId,
    );
    const batchSum = Number(sumRow?.q ?? 0);
    const gap = invQty - batchSum;
    if (gap <= 0) return;

    const [prod] = await tx.$queryRawUnsafe<ProductListPriceRow[]>(
      `SELECT list_price FROM products WHERE id = $1::uuid`,
      input.productId,
    );
    const listPrice = Number(prod?.list_price ?? 0);

    await tx.$queryRawUnsafe(
      `INSERT INTO batches (
         branch_id, product_id, batch_number, quantity, selling_price, created_at
       )
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, NOW())`,
      input.branchId,
      input.productId,
      'POS-AGG',
      gap,
      listPrice > 0 ? listPrice : null,
    );
  }

  async consumeBatchesFifo(
    tx: Prisma.TransactionClient,
    input: { branchId: string; productId: string; quantity: number },
  ): Promise<Array<{ batchId: string; quantity: number; unitCost: number }>> {
    let remaining = input.quantity;
    const allocations: Array<{
      batchId: string;
      quantity: number;
      unitCost: number;
    }> = [];

    const batches = await tx.$queryRawUnsafe<BatchFifoRow[]>(
      `SELECT id, quantity, cost_price
       FROM batches
       WHERE branch_id = $1 AND product_id = $2 AND COALESCE(quantity, 0) > 0
       ORDER BY expiry_date ASC NULLS LAST, created_at ASC
       FOR UPDATE`,
      input.branchId,
      input.productId,
    );

    for (const batch of batches) {
      if (remaining <= 0) break;
      const currentQty = Number(batch.quantity ?? 0);
      if (currentQty <= 0) continue;
      const useQty = Math.min(currentQty, remaining);
      const unitCost = Number(batch.cost_price ?? 0);

      await tx.$queryRawUnsafe(
        `UPDATE batches
         SET quantity = quantity - $2
         WHERE id = $1`,
        batch.id,
        useQty,
      );

      allocations.push({
        batchId: String(batch.id),
        quantity: useQty,
        unitCost,
      });
      remaining -= useQty;
    }

    if (remaining > 0) {
      throw new BadRequestException('Insufficient stock in available batches');
    }

    return allocations;
  }

  /**
   * Sets cost_price on batches that have quantity but missing/zero cost (legacy / POS-AGG gaps).
   */
  async hydrateMissingBatchCosts(
    tx: Prisma.TransactionClient,
    input: { branchId: string; productId: string; unitCost: number },
  ): Promise<void> {
    const u = Number(input.unitCost ?? 0);
    if (u <= 0) return;
    await tx.$queryRawUnsafe(
      `UPDATE batches
       SET cost_price = $3::numeric
       WHERE branch_id = $1::uuid
         AND product_id = $2::uuid
         AND COALESCE(quantity, 0) > 0
         AND (cost_price IS NULL OR cost_price = 0)`,
      input.branchId,
      input.productId,
      u,
    );
  }

  /** Selling price for inbound stock: latest purchase line, then product list_price. */
  async resolveSellingPriceForBranchProduct(
    tx: Prisma.TransactionClient,
    input: { branchId: string; productId: string },
  ): Promise<number | null> {
    const [pi] = await tx.$queryRawUnsafe<{ sp: unknown }[]>(
      `SELECT pi.selling_price AS sp
       FROM purchase_items pi
       INNER JOIN purchases p ON p.id = pi.purchase_id
       WHERE pi.product_id = $1::uuid
         AND (pi.branch_id = $2::uuid OR pi.branch_id IS NULL)
         AND pi.selling_price IS NOT NULL
         AND pi.selling_price > 0
       ORDER BY p.purchase_date DESC NULLS LAST, p.created_at DESC NULLS LAST, pi.id DESC
       LIMIT 1`,
      input.productId,
      input.branchId,
    );
    const fromPurchase = Number(pi?.sp ?? 0);
    if (fromPurchase > 0) return fromPurchase;
    const [pr] = await tx.$queryRawUnsafe<{ lp: unknown }[]>(
      `SELECT list_price AS lp FROM products WHERE id = $1::uuid`,
      input.productId,
    );
    const lp = Number(pr?.lp ?? 0);
    return lp > 0 ? lp : null;
  }

  /**
   * Inbound batch layer for transfers (inventory row is updated separately).
   * batch_number must be unique per (branch, product, transfer) for reversal cleanup.
   */
  async insertTransferInboundBatch(
    tx: Prisma.TransactionClient,
    input: {
      branchId: string;
      productId: string;
      quantity: number;
      costPrice: number;
      sellingPrice: number | null;
      batchNumber: string;
    },
  ): Promise<void> {
    const bn = input.batchNumber.slice(0, 100);
    await tx.$queryRawUnsafe(
      `INSERT INTO batches (
         branch_id, product_id, batch_number, quantity, cost_price, selling_price, created_at
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::numeric, $6::numeric, NOW())`,
      input.branchId,
      input.productId,
      bn,
      input.quantity,
      Number(input.costPrice ?? 0),
      input.sellingPrice != null && Number(input.sellingPrice) > 0
        ? Number(input.sellingPrice)
        : null,
    );
  }

  async deleteTransferInboundBatchByMarker(
    tx: Prisma.TransactionClient,
    input: { branchId: string; productId: string; batchNumber: string },
  ): Promise<void> {
    const bn = input.batchNumber.slice(0, 100);
    await tx.$queryRawUnsafe(
      `DELETE FROM batches
       WHERE branch_id = $1::uuid AND product_id = $2::uuid AND batch_number = $3`,
      input.branchId,
      input.productId,
      bn,
    );
  }

  /**
   * Cost preview used for transfer valuation snapshots.
   * - Prefer FIFO batch cost from source branch.
   * - Fallback remaining quantity to weighted average cost.
   */
  async previewTransferUnitCost(
    tx: Prisma.TransactionClient,
    input: { branchId: string; productId: string; quantity: number },
  ): Promise<number> {
    const qty = Number(input.quantity ?? 0);
    if (qty <= 0) {
      throw new BadRequestException(
        'Quantity must be positive for cost preview',
      );
    }

    const fifoBatches = await tx.$queryRawUnsafe<
      { quantity: number; cost_price: number | null }[]
    >(
      `SELECT quantity, cost_price
       FROM batches
       WHERE branch_id = $1::uuid
         AND product_id = $2::uuid
         AND COALESCE(quantity, 0) > 0
       ORDER BY expiry_date ASC NULLS LAST, created_at ASC`,
      input.branchId,
      input.productId,
    );

    let remaining = qty;
    let fifoCost = 0;
    for (const row of fifoBatches) {
      if (remaining <= 0) break;
      const available = Number(row.quantity ?? 0);
      if (available <= 0) continue;
      const consume = Math.min(available, remaining);
      fifoCost += consume * Number(row.cost_price ?? 0);
      remaining -= consume;
    }

    let fromBatches = 0;
    if (remaining <= 0) {
      fromBatches = Number((fifoCost / qty).toFixed(4));
    } else {
      const [avgRow] = await tx.$queryRawUnsafe<
        { qty_sum: number; cost_sum: number }[]
      >(
        `SELECT
           COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0)::numeric AS qty_sum,
           COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity * COALESCE(cost_price, 0) ELSE 0 END), 0)::numeric AS cost_sum
         FROM batches
         WHERE branch_id = $1::uuid
           AND product_id = $2::uuid`,
        input.branchId,
        input.productId,
      );
      const avgQty = Number(avgRow?.qty_sum ?? 0);
      const weightedAvg =
        avgQty > 0 ? Number(avgRow?.cost_sum ?? 0) / avgQty : 0;
      const totalCost = fifoCost + remaining * weightedAvg;
      fromBatches = Number((totalCost / qty).toFixed(4));
    }

    if (fromBatches > 0) return fromBatches;

    const [sameBranch] = await tx.$queryRawUnsafe<{ cp: unknown }[]>(
      `SELECT pi.cost_price AS cp
       FROM purchase_items pi
       INNER JOIN purchases p ON p.id = pi.purchase_id
       WHERE pi.product_id = $1::uuid
         AND pi.branch_id = $2::uuid
         AND pi.cost_price IS NOT NULL
         AND pi.cost_price > 0
       ORDER BY p.purchase_date DESC NULLS LAST, p.created_at DESC NULLS LAST, pi.id DESC
       LIMIT 1`,
      input.productId,
      input.branchId,
    );
    const c1 = Number(sameBranch?.cp ?? 0);
    if (c1 > 0) return Number(c1.toFixed(4));

    const [anyBranch] = await tx.$queryRawUnsafe<{ cp: unknown }[]>(
      `SELECT pi.cost_price AS cp
       FROM purchase_items pi
       INNER JOIN purchases p ON p.id = pi.purchase_id
       WHERE pi.product_id = $1::uuid
         AND pi.cost_price IS NOT NULL
         AND pi.cost_price > 0
       ORDER BY p.purchase_date DESC NULLS LAST, p.created_at DESC NULLS LAST, pi.id DESC
       LIMIT 1`,
      input.productId,
    );
    const c2 = Number(anyBranch?.cp ?? 0);
    if (c2 > 0) return Number(c2.toFixed(4));

    const [prod] = await tx.$queryRawUnsafe<{ lp: unknown }[]>(
      `SELECT list_price AS lp FROM products WHERE id = $1::uuid`,
      input.productId,
    );
    const lp = Number(prod?.lp ?? 0);
    if (lp > 0) return Number(lp.toFixed(4));

    return 0;
  }
}
