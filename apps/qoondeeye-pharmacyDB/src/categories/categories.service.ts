import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const categorySelect = `
  id,
  name,
  description,
  slug,
  branch_id AS "branchId",
  parent_id AS "parentId"`;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(schemaName: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, (tx) => {
      if (!allowedBranchIds.length) {
        return tx.$queryRawUnsafe<any[]>(
          `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
           FROM product_categories
           WHERE branch_id IS NULL
           ORDER BY name`,
        );
      }
      return tx.$queryRawUnsafe<any[]>(
        `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
         FROM product_categories
         WHERE (branch_id IS NULL OR branch_id = ANY($1::uuid[]))
         ORDER BY name`,
        allowedBranchIds,
      );
    });
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (!allowedBranchIds.length) {
        const [row] = await tx.$queryRawUnsafe<any[]>(
          `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
           FROM product_categories
           WHERE id = $1
             AND branch_id IS NULL`,
          id,
        );
        return row ?? null;
      }
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
         FROM product_categories
         WHERE id = $1
           AND (branch_id IS NULL OR branch_id = ANY($2::uuid[]))`,
        id,
        allowedBranchIds,
      );
      return row ?? null;
    });
  }

  async create(
    schemaName: string,
    dto: {
      name: string;
      description?: string;
      slug?: string;
      parentId?: string | null;
    },
    branchId: string | null,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO product_categories (branch_id, name, description, slug, parent_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${categorySelect.replace(/\s+/g, ' ').trim()}`,
        branchId,
        dto.name,
        dto.description ?? null,
        dto.slug ?? null,
        dto.parentId ?? null,
      );
      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    dto: {
      name?: string;
      description?: string;
      slug?: string;
      parentId?: string | null;
    },
    allowedBranchIds: string[],
  ) {
    const parentProvided = dto.parentId !== undefined;
    const parentVal = dto.parentId ?? null;

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (!allowedBranchIds.length) {
        const [row] = await tx.$queryRawUnsafe<any[]>(
          `UPDATE product_categories
           SET
             name = COALESCE($2, name),
             description = COALESCE($3, description),
             slug = COALESCE($4, slug),
             parent_id = CASE WHEN $5::boolean THEN $6::uuid ELSE parent_id END
           WHERE id = $1
             AND branch_id IS NULL
           RETURNING ${categorySelect.replace(/\s+/g, ' ').trim()}`,
          id,
          dto.name ?? null,
          dto.description ?? null,
          dto.slug ?? null,
          parentProvided,
          parentVal,
        );
        return row ?? null;
      }
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `UPDATE product_categories
         SET
           name = COALESCE($3, name),
           description = COALESCE($4, description),
           slug = COALESCE($5, slug),
           parent_id = CASE WHEN $6::boolean THEN $7::uuid ELSE parent_id END
         WHERE id = $1
           AND (branch_id IS NULL OR branch_id = ANY($2::uuid[]))
         RETURNING ${categorySelect.replace(/\s+/g, ' ').trim()}`,
        id,
        allowedBranchIds,
        dto.name ?? null,
        dto.description ?? null,
        dto.slug ?? null,
        parentProvided,
        parentVal,
      );
      return row ?? null;
    });
  }

  async remove(schemaName: string, id: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      let n: number;
      if (!allowedBranchIds.length) {
        n = await tx.$executeRawUnsafe(
          `DELETE FROM product_categories WHERE id = $1 AND branch_id IS NULL`,
          id,
        );
      } else {
        n = await tx.$executeRawUnsafe(
          `DELETE FROM product_categories
           WHERE id = $1
             AND (branch_id IS NULL OR branch_id = ANY($2::uuid[]))`,
          id,
          allowedBranchIds,
        );
      }
      if (!n || n < 1) {
        throw new NotFoundException('Category not found');
      }
      return { deleted: true };
    });
  }
}
