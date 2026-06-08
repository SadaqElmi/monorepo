import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  BulkPriceUpdateDto,
  CreatePriceGroupDto,
  PricingHistoryQueryDto,
  PricingProductsQueryDto,
  UpdatePriceGroupDto,
  UpdateProductPricingDto,
} from './dto/pricing.dto';

type Tx = Prisma.TransactionClient;

type PriceGroupRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ResolvedPriceGroup = {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
};

type ResolvedProductUom = {
  product_id: string;
  product_name: string;
  list_price: string | number | null;
  uom_id: string;
  conversion_factor_to_base: string | number;
  is_base: boolean;
};

type CurrentPriceRow = {
  price_group_selling_price: string | number | null;
  uom_selling_price: string | number | null;
  uom_cost_price: string | number | null;
  list_price: string | number | null;
};

type BulkCandidateRow = {
  productId: string;
  productName: string;
  uomId: string;
  sellingPrice: string | number | null;
  costPrice: string | number | null;
};

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async listPriceGroups(schemaName: string): Promise<PriceGroupRow[]> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<PriceGroupRow[]>(
        `SELECT id, code, name, description,
                is_default AS "isDefault",
                active,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
         FROM price_groups
         ORDER BY is_default DESC, name ASC`,
      ),
    );
  }

  async createPriceGroup(
    schemaName: string,
    dto: CreatePriceGroupDto,
  ): Promise<PriceGroupRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const code = this.normalizeCode(dto.code);
      if (dto.isDefault) {
        await tx.$executeRawUnsafe(
          `UPDATE price_groups SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP`,
        );
      }
      try {
        const [row] = await tx.$queryRawUnsafe<PriceGroupRow[]>(
          `INSERT INTO price_groups (code, name, description, is_default, active)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, code, name, description,
                     is_default AS "isDefault",
                     active,
                     created_at AS "createdAt",
                     updated_at AS "updatedAt"`,
          code,
          dto.name.trim(),
          dto.description?.trim() || null,
          dto.isDefault === true,
          dto.active !== false,
        );
        return row!;
      } catch (e: unknown) {
        if (String(e instanceof Error ? e.message : e).includes('unique')) {
          throw new ConflictException('Price group code already exists');
        }
        throw e;
      }
    });
  }

  async updatePriceGroup(
    schemaName: string,
    id: string,
    dto: UpdatePriceGroupDto,
  ): Promise<PriceGroupRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (dto.isDefault) {
        await tx.$executeRawUnsafe(
          `UPDATE price_groups
           SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE id <> $1::uuid`,
          id,
        );
      }
      try {
        const [row] = await tx.$queryRawUnsafe<PriceGroupRow[]>(
          `UPDATE price_groups SET
             code = CASE WHEN $2::text IS NULL THEN code ELSE $2 END,
             name = CASE WHEN $3::text IS NULL THEN name ELSE $3 END,
             description = CASE WHEN $4::boolean IS FALSE THEN description ELSE $5 END,
             is_default = CASE WHEN $6::boolean IS NULL THEN is_default ELSE $6 END,
             active = CASE WHEN $7::boolean IS NULL THEN active ELSE $7 END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1::uuid
           RETURNING id, code, name, description,
                     is_default AS "isDefault",
                     active,
                     created_at AS "createdAt",
                     updated_at AS "updatedAt"`,
          id,
          dto.code ? this.normalizeCode(dto.code) : null,
          dto.name?.trim() || null,
          Object.prototype.hasOwnProperty.call(dto, 'description'),
          dto.description === undefined ? null : dto.description,
          dto.isDefault ?? null,
          dto.active ?? null,
        );
        if (!row) {
          throw new NotFoundException('Price group not found');
        }
        if (row.isDefault && row.active === false) {
          throw new BadRequestException('Default price group must remain active');
        }
        return row;
      } catch (e: unknown) {
        if (String(e instanceof Error ? e.message : e).includes('unique')) {
          throw new ConflictException('Price group code already exists');
        }
        throw e;
      }
    });
  }

  async listProducts(
    schemaName: string,
    allowedBranchIds: string[],
    query: PricingProductsQueryDto,
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const limit = this.clampLimit(query.limit, 100);
    const offset = Math.max(0, Number(query.offset ?? 0));
    const search = query.search?.trim() || null;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe(
        `SELECT
           p.id AS "productId",
           p.item_no AS "itemNo",
           p.name AS "productName",
           p.category_id AS "categoryId",
           c.name AS "categoryName",
           pg.id AS "priceGroupId",
           pg.code AS "priceGroupCode",
           pg.name AS "priceGroupName",
           base.uom_id AS "baseUomId",
           base.code AS "baseUom",
           COALESCE(base_price.cost_price, pref.last_cost_price)::text AS "currentCostPrice",
           COALESCE(pg_price.selling_price, base_price.selling_price, p.list_price * COALESCE(base.conversion_factor_to_base, 1))::text AS "currentSellingPrice",
           pref.last_cost_price::text AS "lastPurchaseCost",
           GREATEST(
             p.created_at,
             COALESCE(pg_price.updated_at, p.created_at),
             COALESCE(base_price.updated_at, p.created_at)
           ) AS "lastUpdated",
           CASE
             WHEN COALESCE(pg_price.selling_price, base_price.selling_price, p.list_price * COALESCE(base.conversion_factor_to_base, 1)) > 0
              AND COALESCE(base_price.cost_price, pref.last_cost_price) IS NOT NULL
             THEN ROUND(
               (
                 (
                   COALESCE(pg_price.selling_price, base_price.selling_price, p.list_price * COALESCE(base.conversion_factor_to_base, 1))
                   - COALESCE(base_price.cost_price, pref.last_cost_price)
                 )
                 / COALESCE(pg_price.selling_price, base_price.selling_price, p.list_price * COALESCE(base.conversion_factor_to_base, 1))
               ) * 100,
               2
             )
             ELSE NULL
           END::text AS "marginPercent",
           'active' AS status,
           COUNT(*) OVER()::int AS "totalCount"
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         LEFT JOIN LATERAL (
           SELECT id, code, name, is_default
           FROM price_groups
           WHERE active IS TRUE
             AND (($4::uuid IS NOT NULL AND id = $4::uuid)
               OR ($4::uuid IS NULL AND is_default IS TRUE))
           ORDER BY is_default DESC, name ASC
           LIMIT 1
         ) pg ON TRUE
         LEFT JOIN LATERAL (
           SELECT pu.uom_id, u.code, u.name, u.symbol, pu.conversion_factor_to_base
           FROM product_uoms pu
           JOIN uoms u ON u.id = pu.uom_id
           WHERE pu.product_id = p.id
             AND pu.is_active IS TRUE
           ORDER BY pu.is_base DESC, pu.is_pos_default DESC, pu.conversion_factor_to_base ASC
           LIMIT 1
         ) base ON TRUE
         LEFT JOIN LATERAL (
           SELECT selling_price, cost_price, updated_at
           FROM product_uom_prices
           WHERE product_id = p.id
             AND uom_id = base.uom_id
             AND active IS TRUE
           ORDER BY updated_at DESC NULLS LAST, created_at DESC
           LIMIT 1
         ) base_price ON TRUE
         LEFT JOIN LATERAL (
           SELECT selling_price, updated_at
           FROM product_price_group_prices
           WHERE product_id = p.id
             AND uom_id = base.uom_id
             AND price_group_id = pg.id
             AND active IS TRUE
           ORDER BY updated_at DESC NULLS LAST, created_at DESC
           LIMIT 1
         ) pg_price ON TRUE
         LEFT JOIN LATERAL (
           SELECT ps.supplier_id, s.name AS supplier_name, ps.last_cost_price
           FROM product_suppliers ps
           JOIN suppliers s ON s.id = ps.supplier_id
           WHERE ps.product_id = p.id
             AND ($3::uuid IS NULL OR ps.supplier_id = $3::uuid)
           ORDER BY ps.is_preferred DESC, ps.updated_at DESC NULLS LAST, ps.created_at DESC
           LIMIT 1
         ) pref ON TRUE
         WHERE (p.branch_id IS NULL OR p.branch_id = ANY($1::uuid[]))
           AND ($2::uuid IS NULL OR p.category_id = $2::uuid)
           AND ($3::uuid IS NULL OR EXISTS (
             SELECT 1 FROM product_suppliers psf
             WHERE psf.product_id = p.id
               AND psf.supplier_id = $3::uuid
           ))
           AND ($5::text IS NULL
             OR p.name ILIKE '%' || $5 || '%'
             OR p.item_no ILIKE '%' || $5 || '%'
             OR p.barcode ILIKE '%' || $5 || '%')
         ORDER BY p.name ASC
         LIMIT $6 OFFSET $7`,
        allowedBranchIds,
        query.categoryId ?? null,
        query.supplierId ?? null,
        query.priceGroupId ?? null,
        search,
        limit,
        offset,
      );
      return {
        items: rows,
        total: Number((rows as Array<{ totalCount?: number }>)[0]?.totalCount ?? 0),
        limit,
        offset,
      };
    });
  }

  async updateProductPricing(
    schemaName: string,
    productId: string,
    dto: UpdateProductPricingDto,
    actorUserId?: string | null,
  ) {
    if (dto.costPrice === undefined && dto.sellingPrice === undefined) {
      throw new BadRequestException('Provide costPrice or sellingPrice');
    }
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const priceGroup = await this.resolvePriceGroup(tx, dto.priceGroupId);
      const productUom = await this.resolveProductUom(tx, productId, dto.uomId);
      if (dto.costPrice !== undefined && !productUom.is_base) {
        throw new BadRequestException('Cost price can only be set on the base UOM');
      }
      const current = await this.currentPrices(tx, productUom, priceGroup.id);
      const oldSellingPrice = this.asNullableNumber(
        current.price_group_selling_price ??
          current.uom_selling_price ??
          Number(productUom.list_price ?? 0) *
            Number(productUom.conversion_factor_to_base ?? 1),
      );
      const oldCostPrice = this.asNullableNumber(current.uom_cost_price);
      const newSellingPrice =
        dto.sellingPrice === undefined ? oldSellingPrice : dto.sellingPrice;
      const newCostPrice = dto.costPrice === undefined ? oldCostPrice : dto.costPrice;
      await this.writePriceChange(tx, {
        productId,
        uomId: productUom.uom_id,
        priceGroup,
        oldSellingPrice,
        newSellingPrice,
        oldCostPrice,
        newCostPrice,
        reason: dto.reason ?? null,
        source: 'manual',
        actorUserId: actorUserId ?? null,
        syncUomSellingPrice:
          dto.sellingPrice !== undefined && priceGroup.is_default === true,
        syncUomCostPrice: dto.costPrice !== undefined,
      });
      return {
        productId,
        productName: productUom.product_name,
        uomId: productUom.uom_id,
        priceGroupId: priceGroup.id,
        oldSellingPrice,
        newSellingPrice,
        oldCostPrice,
        newCostPrice,
      };
    });
  }

  async bulkUpdate(
    schemaName: string,
    allowedBranchIds: string[],
    dto: BulkPriceUpdateDto,
    actorUserId?: string | null,
  ) {
    const percent = Number(dto.percentChange);
    if (!Number.isFinite(percent) || percent === 0) {
      throw new BadRequestException('percentChange must be a non-zero number');
    }
    if (percent <= -100) {
      throw new BadRequestException('percentChange cannot reduce prices by 100% or more');
    }
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const priceGroup = await this.resolvePriceGroup(tx, dto.priceGroupId);
      const candidates = await this.bulkCandidates(
        tx,
        allowedBranchIds,
        dto.categoryId ?? null,
        dto.supplierId ?? null,
        priceGroup.id,
      );
      let updated = 0;
      for (const row of candidates) {
        const oldSellingPrice = this.asNullableNumber(row.sellingPrice);
        if (oldSellingPrice === null || oldSellingPrice <= 0) continue;
        const newSellingPrice =
          Math.round((oldSellingPrice * (1 + percent / 100) + Number.EPSILON) * 100) /
          100;
        await this.writePriceChange(tx, {
          productId: row.productId,
          uomId: row.uomId,
          priceGroup,
          oldSellingPrice,
          newSellingPrice,
          oldCostPrice: this.asNullableNumber(row.costPrice),
          newCostPrice: this.asNullableNumber(row.costPrice),
          reason: dto.reason ?? `Bulk price update ${percent}%`,
          source: 'bulk',
          actorUserId: actorUserId ?? null,
          syncUomSellingPrice: priceGroup.is_default === true,
          syncUomCostPrice: false,
        });
        updated += 1;
      }
      return {
        updated,
        skipped: candidates.length - updated,
        percentChange: percent,
        priceGroupId: priceGroup.id,
      };
    });
  }

  async history(schemaName: string, query: PricingHistoryQueryDto) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const limit = this.clampLimit(query.limit, 100);
    const offset = Math.max(0, Number(query.offset ?? 0));
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe(
        `SELECT h.id,
                h.product_id AS "productId",
                p.name AS "productName",
                h.uom_id AS "uomId",
                u.code AS "uomCode",
                h.price_group_id AS "priceGroupId",
                pg.code AS "priceGroupCode",
                h.old_selling_price::text AS "oldSellingPrice",
                h.new_selling_price::text AS "newSellingPrice",
                h.old_cost_price::text AS "oldCostPrice",
                h.new_cost_price::text AS "newCostPrice",
                h.change_reason AS "changeReason",
                h.source,
                h.actor_user_id AS "actorUserId",
                h.created_at AS "createdAt",
                COUNT(*) OVER()::int AS "totalCount"
         FROM product_price_history h
         JOIN products p ON p.id = h.product_id
         LEFT JOIN uoms u ON u.id = h.uom_id
         LEFT JOIN price_groups pg ON pg.id = h.price_group_id
         WHERE ($1::uuid IS NULL OR h.product_id = $1::uuid)
           AND ($2::uuid IS NULL OR h.price_group_id = $2::uuid)
           AND ($3::text IS NULL OR h.source = $3)
         ORDER BY h.created_at DESC, h.id DESC
         LIMIT $4 OFFSET $5`,
        query.productId ?? null,
        query.priceGroupId ?? null,
        query.source ?? null,
        limit,
        offset,
      );
      return {
        items: rows,
        total: Number((rows as Array<{ totalCount?: number }>)[0]?.totalCount ?? 0),
        limit,
        offset,
      };
    });
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase().replace(/\s+/g, '_');
  }

  private clampLimit(value: unknown, fallback: number): number {
    const n = Number(value ?? fallback);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(1, Math.floor(n)), 500);
  }

  private asNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private async resolvePriceGroup(
    tx: Tx,
    priceGroupId?: string | null,
  ): Promise<ResolvedPriceGroup> {
    const [row] = await tx.$queryRawUnsafe<ResolvedPriceGroup[]>(
      `SELECT id, code, name, is_default
       FROM price_groups
       WHERE active IS TRUE
         AND (($1::uuid IS NOT NULL AND id = $1::uuid)
           OR ($1::uuid IS NULL AND is_default IS TRUE))
       ORDER BY is_default DESC, name ASC
       LIMIT 1`,
      priceGroupId ?? null,
    );
    if (!row) {
      throw new NotFoundException('Price group not found');
    }
    return row;
  }

  private async resolveProductUom(
    tx: Tx,
    productId: string,
    uomId?: string | null,
  ): Promise<ResolvedProductUom> {
    const [row] = await tx.$queryRawUnsafe<ResolvedProductUom[]>(
      `SELECT p.id AS product_id,
              p.name AS product_name,
              p.list_price,
              pu.uom_id,
              pu.conversion_factor_to_base,
              pu.is_base
       FROM products p
       JOIN LATERAL (
         SELECT pu.uom_id, pu.conversion_factor_to_base, pu.is_base
         FROM product_uoms pu
         WHERE pu.product_id = p.id
           AND pu.is_active IS TRUE
           AND ($2::uuid IS NULL OR pu.uom_id = $2::uuid)
         ORDER BY
           CASE WHEN $2::uuid IS NOT NULL THEN 0 ELSE CASE WHEN pu.is_base THEN 0 ELSE 1 END END,
           pu.is_pos_default DESC,
           pu.conversion_factor_to_base ASC
         LIMIT 1
       ) pu ON TRUE
       WHERE p.id = $1::uuid
       LIMIT 1`,
      productId,
      uomId ?? null,
    );
    if (!row) {
      throw new NotFoundException('Product/UOM not found');
    }
    return row;
  }

  private async currentPrices(
    tx: Tx,
    productUom: ResolvedProductUom,
    priceGroupId: string,
  ): Promise<CurrentPriceRow> {
    const [row] = await tx.$queryRawUnsafe<CurrentPriceRow[]>(
      `SELECT
         pgp.selling_price AS price_group_selling_price,
         pup.selling_price AS uom_selling_price,
         base_pup.cost_price AS uom_cost_price,
         $4::numeric AS list_price
       FROM (SELECT 1) x
       LEFT JOIN LATERAL (
         SELECT selling_price
         FROM product_price_group_prices
         WHERE product_id = $1::uuid
           AND uom_id = $2::uuid
           AND price_group_id = $3::uuid
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) pgp ON TRUE
       LEFT JOIN LATERAL (
         SELECT selling_price
         FROM product_uom_prices
         WHERE product_id = $1::uuid
           AND uom_id = $2::uuid
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) pup ON TRUE
       LEFT JOIN LATERAL (
         SELECT pu.uom_id
         FROM product_uoms pu
         WHERE pu.product_id = $1::uuid
           AND pu.is_base IS TRUE
           AND pu.is_active IS TRUE
         LIMIT 1
       ) base_uom ON TRUE
       LEFT JOIN LATERAL (
         SELECT cost_price
         FROM product_uom_prices
         WHERE product_id = $1::uuid
           AND uom_id = base_uom.uom_id
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) base_pup ON TRUE`,
      productUom.product_id,
      productUom.uom_id,
      priceGroupId,
      Number(productUom.list_price ?? 0) *
        Number(productUom.conversion_factor_to_base ?? 1),
    );
    return row ?? {
      price_group_selling_price: null,
      uom_selling_price: null,
      uom_cost_price: null,
      list_price: productUom.list_price,
    };
  }

  private async bulkCandidates(
    tx: Tx,
    allowedBranchIds: string[],
    categoryId: string | null,
    supplierId: string | null,
    priceGroupId: string,
  ): Promise<BulkCandidateRow[]> {
    return tx.$queryRawUnsafe<BulkCandidateRow[]>(
      `SELECT p.id AS "productId",
              p.name AS "productName",
              base.uom_id AS "uomId",
              COALESCE(pgp.selling_price, pup.selling_price, p.list_price * COALESCE(base.conversion_factor_to_base, 1))::text AS "sellingPrice",
              COALESCE(pup.cost_price, pref.last_cost_price)::text AS "costPrice"
       FROM products p
       JOIN LATERAL (
         SELECT pu.uom_id, pu.conversion_factor_to_base
         FROM product_uoms pu
         WHERE pu.product_id = p.id
           AND pu.is_active IS TRUE
         ORDER BY pu.is_base DESC, pu.is_pos_default DESC, pu.conversion_factor_to_base ASC
         LIMIT 1
       ) base ON TRUE
       LEFT JOIN LATERAL (
         SELECT selling_price, cost_price
         FROM product_uom_prices
         WHERE product_id = p.id
           AND uom_id = base.uom_id
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) pup ON TRUE
       LEFT JOIN LATERAL (
         SELECT selling_price
         FROM product_price_group_prices
         WHERE product_id = p.id
           AND uom_id = base.uom_id
           AND price_group_id = $4::uuid
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) pgp ON TRUE
       LEFT JOIN LATERAL (
         SELECT ps.last_cost_price
         FROM product_suppliers ps
         WHERE ps.product_id = p.id
           AND ($3::uuid IS NULL OR ps.supplier_id = $3::uuid)
         ORDER BY ps.is_preferred DESC, ps.updated_at DESC NULLS LAST, ps.created_at DESC
         LIMIT 1
       ) pref ON TRUE
       WHERE (p.branch_id IS NULL OR p.branch_id = ANY($1::uuid[]))
         AND ($2::uuid IS NULL OR p.category_id = $2::uuid)
         AND ($3::uuid IS NULL OR EXISTS (
           SELECT 1 FROM product_suppliers psf
           WHERE psf.product_id = p.id
             AND psf.supplier_id = $3::uuid
         ))
       ORDER BY p.name ASC`,
      allowedBranchIds,
      categoryId,
      supplierId,
      priceGroupId,
    );
  }

  private async writePriceChange(
    tx: Tx,
    input: {
      productId: string;
      uomId: string;
      priceGroup: ResolvedPriceGroup;
      oldSellingPrice: number | null;
      newSellingPrice: number | null;
      oldCostPrice: number | null;
      newCostPrice: number | null;
      reason: string | null;
      source: string;
      actorUserId: string | null;
      syncUomSellingPrice: boolean;
      syncUomCostPrice: boolean;
    },
  ): Promise<void> {
    if (
      input.newSellingPrice !== null &&
      Math.abs((input.oldSellingPrice ?? -1) - input.newSellingPrice) > 0.0001
    ) {
      await tx.$executeRawUnsafe(
        `UPDATE product_price_group_prices
         SET active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1::uuid
           AND uom_id = $2::uuid
           AND price_group_id = $3::uuid
           AND active IS TRUE`,
        input.productId,
        input.uomId,
        input.priceGroup.id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO product_price_group_prices
           (product_id, uom_id, price_group_id, selling_price, active)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric, TRUE)`,
        input.productId,
        input.uomId,
        input.priceGroup.id,
        input.newSellingPrice,
      );
    }

    if (input.syncUomSellingPrice) {
      const [current] = await tx.$queryRawUnsafe<Array<{
        selling_price: number | string | null;
      }>>(
        `SELECT selling_price
         FROM product_uom_prices
         WHERE product_id = $1::uuid
           AND uom_id = $2::uuid
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        input.productId,
        input.uomId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE product_uom_prices
         SET active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1::uuid
           AND uom_id = $2::uuid
           AND active IS TRUE`,
        input.productId,
        input.uomId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO product_uom_prices
           (product_id, uom_id, selling_price, cost_price, active)
         VALUES ($1::uuid, $2::uuid, $3::numeric, NULL, TRUE)`,
        input.productId,
        input.uomId,
        input.newSellingPrice ?? current?.selling_price ?? null,
      );
    }

    if (input.syncUomCostPrice) {
      const [base] = await tx.$queryRawUnsafe<Array<{ uom_id: string }>>(
        `SELECT uom_id
         FROM product_uoms
         WHERE product_id = $1::uuid
           AND is_base IS TRUE
           AND is_active IS TRUE
         LIMIT 1`,
        input.productId,
      );
      if (!base) {
        throw new BadRequestException('Product has no base UOM configured');
      }
      const [current] = await tx.$queryRawUnsafe<Array<{
        selling_price: number | string | null;
        cost_price: number | string | null;
        initial_cost_price: number | string | null;
        last_purchase_cost: number | string | null;
        last_purchase_at: Date | string | null;
        last_purchase_id: string | null;
        last_purchase_item_id: string | null;
      }>>(
        `SELECT selling_price, cost_price, initial_cost_price,
                last_purchase_cost, last_purchase_at,
                last_purchase_id, last_purchase_item_id
         FROM product_uom_prices
         WHERE product_id = $1::uuid
           AND uom_id = $2::uuid
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        input.productId,
        base.uom_id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE product_uom_prices
         SET active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1::uuid
           AND uom_id = $2::uuid
           AND active IS TRUE`,
        input.productId,
        base.uom_id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO product_uom_prices
           (product_id, uom_id, selling_price, cost_price,
            initial_cost_price, last_purchase_cost, last_purchase_at,
            last_purchase_id, last_purchase_item_id, active)
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric,
                 $5::numeric, $6::numeric, $7::timestamp,
                 $8::uuid, $9::uuid, TRUE)`,
        input.productId,
        base.uom_id,
        current?.selling_price ?? null,
        input.newCostPrice,
        current?.initial_cost_price ?? current?.cost_price ?? input.newCostPrice,
        current?.last_purchase_cost ?? null,
        current?.last_purchase_at ?? null,
        current?.last_purchase_id ?? null,
        current?.last_purchase_item_id ?? null,
      );
    }

    await tx.$executeRawUnsafe(
      `INSERT INTO product_price_history (
         product_id, uom_id, price_group_id,
         old_selling_price, new_selling_price,
         old_cost_price, new_cost_price,
         change_reason, source, actor_user_id
       )
       VALUES (
         $1::uuid, $2::uuid, $3::uuid,
         $4::numeric, $5::numeric,
         $6::numeric, $7::numeric,
         $8, $9, $10::uuid
       )`,
      input.productId,
      input.uomId,
      input.priceGroup.id,
      input.oldSellingPrice,
      input.newSellingPrice,
      input.oldCostPrice,
      input.newCostPrice,
      input.reason,
      input.source,
      input.actorUserId,
    );
  }
}
