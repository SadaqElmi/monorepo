import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatBaseQuantityDisplay } from '../uoms/uom-display.util';
import { UomsService } from '../uoms/uoms.service';

export interface BatchRow {
  id: string;
  product_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number | string;
  cost_price: number | string | null;
  selling_price: number | string | null;
  created_at: Date;
  base_uom_code?: string | null;
  base_uom_symbol?: string | null;
  converted_quantity?: string;
}

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uomsService: UomsService,
  ) {}

  async findAll(schemaName: string) {
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<BatchRow[]>(
        `SELECT id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price, created_at FROM batches ORDER BY expiry_date`,
      ),
    );
    return this.withQuantityDisplay(schemaName, rows);
  }

  async findOne(schemaName: string, id: string) {
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<BatchRow[]>(
        `SELECT id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price, created_at FROM batches WHERE id = $1`,
        id,
      );
      return row ?? null;
    });
    if (!row) return null;
    const [decorated] = await this.withQuantityDisplay(schemaName, [row]);
    return decorated ?? row;
  }

  async create(
    schemaName: string,
    dto: {
      productId?: string;
      batchNumber?: string;
      expiryDate?: string;
      quantity?: number;
      costPrice?: number;
      sellingPrice?: number;
    },
  ) {
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<BatchRow[]>(
        `INSERT INTO batches (product_id, batch_number, expiry_date, quantity, cost_price, selling_price) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price, created_at`,
        dto.productId ?? null,
        dto.batchNumber ?? null,
        dto.expiryDate ?? null,
        dto.quantity ?? null,
        dto.costPrice ?? null,
        dto.sellingPrice ?? null,
      );
      return row;
    });
    const [decorated] = await this.withQuantityDisplay(schemaName, [row]);
    return decorated ?? row;
  }

  async update(
    schemaName: string,
    id: string,
    dto: {
      productId?: string;
      batchNumber?: string;
      expiryDate?: string;
      quantity?: number;
      costPrice?: number;
      sellingPrice?: number;
    },
  ) {
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<BatchRow[]>(
        `UPDATE batches SET product_id = COALESCE($2, product_id), batch_number = COALESCE($3, batch_number), expiry_date = COALESCE($4, expiry_date), quantity = COALESCE($5, quantity), cost_price = COALESCE($6, cost_price), selling_price = COALESCE($7, selling_price) WHERE id = $1 RETURNING id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price, created_at`,
        id,
        dto.productId ?? null,
        dto.batchNumber ?? null,
        dto.expiryDate ?? null,
        dto.quantity ?? null,
        dto.costPrice ?? null,
        dto.sellingPrice ?? null,
      );
      return row ?? null;
    });
    if (!row) return null;
    const [decorated] = await this.withQuantityDisplay(schemaName, [row]);
    return decorated ?? row;
  }

  async remove(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(`DELETE FROM batches WHERE id = $1`, id);
      return { deleted: true };
    });
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
}
