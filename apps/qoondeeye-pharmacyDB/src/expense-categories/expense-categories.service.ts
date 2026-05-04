import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

export interface ExpenseCategoryRow {
  id: string;
  name: string | null;
  gl_account_key: string | null;
}

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async findAll(schemaName: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<ExpenseCategoryRow[]>(
        `SELECT id, name, gl_account_key FROM expense_categories ORDER BY name`,
      ),
    );
  }

  async findOne(schemaName: string, id: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<ExpenseCategoryRow[]>(
        `SELECT id, name, gl_account_key FROM expense_categories WHERE id = $1`,
        id,
      );
      return row ?? null;
    });
  }

  async create(
    schemaName: string,
    dto: { name?: string; glAccountKey?: string },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<ExpenseCategoryRow[]>(
        `INSERT INTO expense_categories (name, gl_account_key) VALUES ($1, $2) RETURNING id, name, gl_account_key`,
        dto.name ?? null,
        dto.glAccountKey ?? null,
      );
      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    dto: { name?: string; glAccountKey?: string },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<ExpenseCategoryRow[]>(
        `UPDATE expense_categories SET name = COALESCE($2, name), gl_account_key = COALESCE($3, gl_account_key) WHERE id = $1 RETURNING id, name, gl_account_key`,
        id,
        dto.name ?? null,
        dto.glAccountKey ?? null,
      );
      return row ?? null;
    });
  }

  async remove(schemaName: string, id: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(
        `DELETE FROM expense_categories WHERE id = $1`,
        id,
      );
      return { deleted: true };
    });
  }
}
