import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditLogService } from '../accounting/audit-log.service';

export interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  created_at: Date;
}

type CustomerAuditRow = Pick<CustomerRow, 'id' | 'name' | 'phone' | 'address'>;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(schemaName: string) {
    return this.prisma.withTenantSchema(
      schemaName,
      (tx) =>
        tx.$queryRaw<CustomerRow[]>`
          SELECT id, name, phone, address, created_at
          FROM customers
          ORDER BY name
        `,
    );
  }

  async findOne(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<CustomerRow[]>(
        `SELECT id, name, phone, address, created_at FROM customers WHERE id = $1`,
        id,
      );
      return row ?? null;
    });
  }

  async create(
    schemaName: string,
    dto: { name?: string; phone?: string; address?: string },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<CustomerRow[]>(
        `INSERT INTO customers (name, phone, address) VALUES ($1, $2, $3) RETURNING id, name, phone, address, created_at`,
        dto.name ?? null,
        dto.phone ?? null,
        dto.address ?? null,
      );
      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    dto: { name?: string; phone?: string; address?: string },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [prev] = await tx.$queryRawUnsafe<CustomerAuditRow[]>(
        `SELECT id, name, phone, address FROM customers WHERE id = $1`,
        id,
      );
      const [row] = await tx.$queryRawUnsafe<CustomerRow[]>(
        `UPDATE customers SET name = COALESCE($2, name), phone = COALESCE($3, phone), address = COALESCE($4, address) WHERE id = $1 RETURNING id, name, phone, address, created_at`,
        id,
        dto.name ?? null,
        dto.phone ?? null,
        dto.address ?? null,
      );
      if (row && prev) {
        await this.auditLog.append(tx, {
          tableName: 'customers',
          recordId: id,
          action: 'update',
          oldPayload: prev,
          newPayload: row as unknown as Record<string, unknown>,
        });
      }
      return row ?? null;
    });
  }

  async remove(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(`DELETE FROM customers WHERE id = $1`, id);
      return { deleted: true };
    });
  }
}
