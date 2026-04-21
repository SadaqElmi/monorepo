import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(schemaName: string) {
    return this.prisma.withTenantSchema(
      schemaName,
      (tx) =>
        tx.$queryRaw`SELECT id, name, phone, email, address, created_at FROM suppliers ORDER BY name`,
    );
  }

  async findOne(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, name, phone, email, address, created_at FROM suppliers WHERE id = $1`,
        id,
      );
      return row ?? null;
    });
  }

  async create(
    schemaName: string,
    dto: { name?: string; phone?: string; email?: string; address?: string },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO suppliers (name, phone, email, address) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, email, address, created_at`,
        dto.name ?? null,
        dto.phone ?? null,
        dto.email ?? null,
        dto.address ?? null,
      );
      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    dto: { name?: string; phone?: string; email?: string; address?: string },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `UPDATE suppliers SET name = COALESCE($2, name), phone = COALESCE($3, phone), email = COALESCE($4, email), address = COALESCE($5, address) WHERE id = $1 RETURNING id, name, phone, email, address, created_at`,
        id,
        dto.name ?? null,
        dto.phone ?? null,
        dto.email ?? null,
        dto.address ?? null,
      );
      return row ?? null;
    });
  }

  async remove(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(`DELETE FROM suppliers WHERE id = $1`, id);
      return { deleted: true };
    });
  }
}
