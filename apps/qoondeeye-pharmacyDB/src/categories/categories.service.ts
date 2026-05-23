import { Injectable, NotFoundException } from '@nestjs/common';
import { toPagedResult, type PagedResult } from '../common/pagination.util';
import { resolveCatalogCacheTtlMs } from '../cache/cache-catalog.config';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import {
  catalogListCacheKey,
  normalizeBranchScope,
} from '../cache/cache-keys';
import { catalogBranchTags, catalogTenantTags } from '../cache/cache-tags';
import { TaggedCacheService } from '../cache/tagged-cache.service';
import { PrismaService } from '../prisma/prisma.service';

const categorySelect = `
  id,
  name,
  description,
  slug,
  branch_id AS "branchId",
  parent_id AS "parentId"`;

export interface ProductCategoryRow {
  id: string;
  name: string;
  description: string | null;
  slug: string | null;
  branchId: string | null;
  parentId: string | null;
}

@Injectable()
export class CategoriesService {
  private readonly catalogTtlMs = resolveCatalogCacheTtlMs();

  constructor(
    private readonly prisma: PrismaService,
    private readonly taggedCache: TaggedCacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async findAll(
    schemaName: string,
    tenantId: string,
    allowedBranchIds: string[],
  ) {
    const scope = normalizeBranchScope(allowedBranchIds);
    const key = catalogListCacheKey(tenantId, scope, 'categories');
    const tags = [
      ...catalogBranchTags(tenantId, allowedBranchIds),
      ...catalogTenantTags(tenantId),
    ];
    return this.taggedCache.getOrSet(
      key,
      tags,
      this.catalogTtlMs,
      () => this.findAllUncached(schemaName, allowedBranchIds),
    );
  }

  private findAllUncached(schemaName: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, (tx) => {
      if (!allowedBranchIds.length) {
        return tx.$queryRawUnsafe<ProductCategoryRow[]>(
          `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
           FROM product_categories
           WHERE branch_id IS NULL
           ORDER BY name`,
        );
      }
      return tx.$queryRawUnsafe<ProductCategoryRow[]>(
        `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
         FROM product_categories
         WHERE (branch_id IS NULL OR branch_id = ANY($1::uuid[]))
         ORDER BY name`,
        allowedBranchIds,
      );
    });
  }

  async findAllPaged(
    schemaName: string,
    allowedBranchIds: string[],
    skip: number,
    take: number,
  ): Promise<PagedResult<ProductCategoryRow>> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (!allowedBranchIds.length) {
        const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
          `SELECT COUNT(*)::bigint AS c FROM product_categories WHERE branch_id IS NULL`,
        );
        const total = Number(countRow?.c ?? 0);
        const items = await tx.$queryRawUnsafe<ProductCategoryRow[]>(
          `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
           FROM product_categories
           WHERE branch_id IS NULL
           ORDER BY name
           LIMIT $1 OFFSET $2`,
          take,
          skip,
        );
        const page = Math.floor(skip / take) + 1;
        return toPagedResult(items, total, page, take);
      }
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM product_categories
         WHERE (branch_id IS NULL OR branch_id = ANY($1::uuid[]))`,
        allowedBranchIds,
      );
      const total = Number(countRow?.c ?? 0);
      const items = await tx.$queryRawUnsafe<ProductCategoryRow[]>(
        `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
         FROM product_categories
         WHERE (branch_id IS NULL OR branch_id = ANY($1::uuid[]))
         ORDER BY name
         LIMIT $2 OFFSET $3`,
        allowedBranchIds,
        take,
        skip,
      );
      const page = Math.floor(skip / take) + 1;
      return toPagedResult(items, total, page, take);
    });
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (!allowedBranchIds.length) {
        const [row] = await tx.$queryRawUnsafe<ProductCategoryRow[]>(
          `SELECT ${categorySelect.replace(/\s+/g, ' ').trim()}
           FROM product_categories
           WHERE id = $1
             AND branch_id IS NULL`,
          id,
        );
        return row ?? null;
      }
      const [row] = await tx.$queryRawUnsafe<ProductCategoryRow[]>(
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
    tenantId: string,
    dto: {
      name: string;
      description?: string;
      slug?: string;
      parentId?: string | null;
    },
    branchId: string | null,
  ) {
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [created] = await tx.$queryRawUnsafe<ProductCategoryRow[]>(
        `INSERT INTO product_categories (branch_id, name, description, slug, parent_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${categorySelect.replace(/\s+/g, ' ').trim()}`,
        branchId,
        dto.name,
        dto.description ?? null,
        dto.slug ?? null,
        dto.parentId ?? null,
      );
      return created;
    });
    const branchIds = branchId ? [branchId] : [];
    await this.cacheInvalidation.invalidateCatalogForBranches(
      tenantId,
      branchIds.length ? branchIds : await this.allBranchIds(schemaName),
    );
    return row;
  }

  async update(
    schemaName: string,
    tenantId: string,
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

    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (!allowedBranchIds.length) {
        const [updated] = await tx.$queryRawUnsafe<ProductCategoryRow[]>(
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
        return updated ?? null;
      }
      const [updated] = await tx.$queryRawUnsafe<ProductCategoryRow[]>(
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
      return updated ?? null;
    });
    await this.cacheInvalidation.invalidateCatalogForBranches(
      tenantId,
      allowedBranchIds,
    );
    return row;
  }

  async remove(
    schemaName: string,
    tenantId: string,
    id: string,
    allowedBranchIds: string[],
  ) {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
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
    });
    await this.cacheInvalidation.invalidateCatalogForBranches(
      tenantId,
      allowedBranchIds,
    );
    return { deleted: true };
  }

  private async allBranchIds(schemaName: string): Promise<string[]> {
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM branches`),
    );
    return rows.map((r) => r.id);
  }
}
