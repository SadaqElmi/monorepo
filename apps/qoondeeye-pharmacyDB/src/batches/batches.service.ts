import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface BatchRow {
  id: string;
  product_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number | string;
  cost_price: number | string | null;
  selling_price: number | string | null;
  created_at: Date;
}

@Injectable()
export class BatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(schemaName: string) {
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<BatchRow[]>(
        `SELECT id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price, created_at FROM batches ORDER BY expiry_date`,
      ),
    );
  }

  async findOne(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<BatchRow[]>(
        `SELECT id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price, created_at FROM batches WHERE id = $1`,
        id,
      );
      return row ?? null;
    });
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
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
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
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
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
  }

  async remove(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(`DELETE FROM batches WHERE id = $1`, id);
      return { deleted: true };
    });
  }
}
