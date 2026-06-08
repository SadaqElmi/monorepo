import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  isPrismaRawUniqueViolation,
  isRawQueryUniqueMessage,
} from '../common/prisma-raw-error.util';
import { CreateUomDto, UpdateProductUomDto, UpdateUomDto, UpsertProductUomDto } from './dto/uom.dto';

type QueryTx = {
  $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
};

export type UomDefaultKind = 'base' | 'purchase' | 'sales' | 'pos';

export type UomRow = {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string | null;
};

export type ProductUomRow = {
  id: string;
  productId: string;
  uomId: string;
  code: string;
  name: string;
  symbol: string | null;
  conversionFactorToBase: number | string;
  isBase: boolean;
  isPurchaseDefault: boolean;
  isSalesDefault: boolean;
  isPosDefault: boolean;
  isActive: boolean;
  sellingPrice: number | string | null;
  costPrice: number | string | null;
  initialCostPrice: number | string | null;
  lastPurchaseCost: number | string | null;
  lastPurchaseAt: Date | string | null;
  barcodes: string[];
  createdAt: Date | string;
  updatedAt: Date | string | null;
};

export type ResolvedProductUom = {
  productUomId: string;
  productId: string;
  uomId: string;
  code: string;
  name: string;
  symbol: string | null;
  conversionFactorToBase: number;
  sellingPrice: number | null;
  costPrice: number | null;
};

type ProductUomDbRow = Omit<ProductUomRow, 'barcodes'> & {
  barcodes: unknown;
};

const STANDARD_UOMS: Record<string, { name: string; symbol: string }> = {
  PCS: { name: 'Piece', symbol: 'PCS' },
  TAB: { name: 'Tablet', symbol: 'TAB' },
  STRIP: { name: 'Strip', symbol: 'Strip' },
  BOX: { name: 'Box', symbol: 'Box' },
  CTN: { name: 'Carton', symbol: 'Ctn' },
  BTL: { name: 'Bottle', symbol: 'Btl' },
};

function normalizeUom(value?: string | null): { code: string; name: string; symbol: string } {
  const raw = value?.trim() || 'PCS';
  const upper = raw.toUpperCase();
  const code =
    ['PC', 'PCS', 'PIECE', 'PIECES', 'EA', 'EACH'].includes(upper)
      ? 'PCS'
      : ['TAB', 'TABS', 'TABLET', 'TABLETS'].includes(upper)
        ? 'TAB'
        : ['STRIP', 'STRIPS'].includes(upper)
          ? 'STRIP'
          : ['BOX', 'BOXES'].includes(upper)
            ? 'BOX'
            : ['CTN', 'CARTON', 'CARTONS'].includes(upper)
              ? 'CTN'
              : ['BTL', 'BOTTLE', 'BOTTLES'].includes(upper)
                ? 'BTL'
                : upper.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'PCS';
  const standard = STANDARD_UOMS[code];
  return {
    code,
    name: standard?.name ?? raw.replace(/[_-]+/g, ' '),
    symbol: standard?.symbol ?? code,
  };
}

function cleanCode(code: string): string {
  return normalizeUom(code).code;
}

function barcodeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

@Injectable()
export class UomsService {
  private readonly logger = new Logger(UomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private logBarcodeValidation(
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.logger.log(
      `[barcode-validation] ${event} ${JSON.stringify(payload)}`,
    );
  }

  private async currentSchemaInTx(tx: QueryTx): Promise<string | null> {
    const [row] = await tx.$queryRawUnsafe<Array<{ schemaName: string }>>(
      `SELECT current_schema() AS "schemaName"`,
    );
    return row?.schemaName ?? null;
  }

  toBaseQuantity(quantity: number, conversionFactorToBase: number): number {
    const entered = Number(quantity);
    const factor = Number(conversionFactorToBase);
    if (!Number.isFinite(entered) || entered <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new BadRequestException('UOM conversion factor must be greater than 0');
    }
    const raw = entered * factor;
    const rounded = Math.round(raw);
    if (Math.abs(raw - rounded) > 1e-6) {
      throw new BadRequestException(
        'UOM conversion produces fractional base quantity. Decimal stock is not enabled yet.',
      );
    }
    return rounded;
  }

  toBaseUnitCost(costPrice: number | null | undefined, factor: number): number | null {
    if (costPrice == null) return null;
    const cost = Number(costPrice);
    if (!Number.isFinite(cost)) return null;
    return Math.round((cost / factor + Number.EPSILON) * 10000) / 10000;
  }

  fromBaseUnitCost(baseCost: number | null | undefined, factor: number): number | null {
    if (baseCost == null) return null;
    const cost = Number(baseCost);
    if (!Number.isFinite(cost)) return null;
    return Math.round((cost * factor + Number.EPSILON) * 10000) / 10000;
  }

  async listUoms(schemaName: string): Promise<UomRow[]> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<UomRow[]>(
        `SELECT id, code, name, symbol, active, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM uoms
         ORDER BY active DESC, code ASC`,
      ),
    );
  }

  async createUom(schemaName: string, dto: CreateUomDto): Promise<UomRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const normalized = normalizeUom(dto.code);
    try {
      return await this.prisma.withTenantSchema(schemaName, async (tx) => {
        const [row] = await tx.$queryRawUnsafe<UomRow[]>(
          `INSERT INTO uoms (code, name, symbol, active)
           VALUES ($1, $2, $3, COALESCE($4::boolean, TRUE))
           RETURNING id, code, name, symbol, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
          normalized.code,
          dto.name?.trim() || normalized.name,
          dto.symbol?.trim() || normalized.symbol,
          dto.active ?? true,
        );
        return row!;
      });
    } catch (e) {
      this.rethrowUnique(e, 'A UOM with this code already exists');
      throw e;
    }
  }

  async updateUom(schemaName: string, id: string, dto: UpdateUomDto): Promise<UomRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (dto.active === false) {
        const [used] = await tx.$queryRawUnsafe<{ c: number }[]>(
          `SELECT COUNT(*)::int AS c
           FROM product_uoms
           WHERE uom_id = $1::uuid AND is_active IS TRUE`,
          id,
        );
        if (Number(used?.c ?? 0) > 0) {
          throw new ConflictException('Cannot deactivate UOM while active product conversions use it');
        }
      }
      const hasCode = Object.prototype.hasOwnProperty.call(dto, 'code');
      const hasName = Object.prototype.hasOwnProperty.call(dto, 'name');
      const hasSymbol = Object.prototype.hasOwnProperty.call(dto, 'symbol');
      const hasActive = Object.prototype.hasOwnProperty.call(dto, 'active');
      const code = hasCode && dto.code ? cleanCode(dto.code) : null;
      try {
        const [row] = await tx.$queryRawUnsafe<UomRow[]>(
          `UPDATE uoms
           SET code = CASE WHEN $2::boolean THEN $3 ELSE code END,
               name = CASE WHEN $4::boolean THEN $5 ELSE name END,
               symbol = CASE WHEN $6::boolean THEN $7 ELSE symbol END,
               active = CASE WHEN $8::boolean THEN COALESCE($9::boolean, active) ELSE active END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1::uuid
           RETURNING id, code, name, symbol, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
          id,
          hasCode,
          code,
          hasName,
          dto.name?.trim() || null,
          hasSymbol,
          dto.symbol?.trim() || null,
          hasActive,
          dto.active ?? null,
        );
        if (!row) throw new NotFoundException('UOM not found');
        return row;
      } catch (e) {
        this.rethrowUnique(e, 'A UOM with this code already exists');
        throw e;
      }
    });
  }

  async listProductUoms(
    schemaName: string,
    productId: string,
    allowedBranchIds: string[],
  ): Promise<ProductUomRow[]> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.assertProductVisibleInTx(tx, productId, allowedBranchIds);
      return this.productUomsForProductsInTx(tx, [productId]);
    });
  }

  async listProductUomsForProducts(
    schemaName: string,
    productIds: string[],
  ): Promise<Record<string, ProductUomRow[]>> {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return {};
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await this.productUomsForProductsInTx(tx, ids);
      return rows.reduce<Record<string, ProductUomRow[]>>((acc, row) => {
        (acc[row.productId] ??= []).push(row);
        return acc;
      }, {});
    });
  }

  async upsertProductUom(
    schemaName: string,
    productId: string,
    allowedBranchIds: string[],
    dto: UpsertProductUomDto,
  ): Promise<ProductUomRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.assertProductVisibleInTx(tx, productId, allowedBranchIds);
      await this.assertUomExistsInTx(tx, dto.uomId);
      const row = await this.upsertProductUomInTx(tx, productId, dto.uomId, dto);
      await this.upsertPriceMetadataInTx(tx, productId, dto.uomId, dto);
      return row;
    });
  }

  async updateProductUom(
    schemaName: string,
    productId: string,
    productUomId: string,
    allowedBranchIds: string[],
    dto: UpdateProductUomDto,
  ): Promise<ProductUomRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.assertProductVisibleInTx(tx, productId, allowedBranchIds);
      const [existing] = await tx.$queryRawUnsafe<Array<{ uom_id: string; is_base: boolean; conversion_factor_to_base: string }>>(
        `SELECT uom_id, is_base, conversion_factor_to_base::text
         FROM product_uoms
         WHERE id = $1::uuid AND product_id = $2::uuid`,
        productUomId,
        productId,
      );
      if (!existing) throw new NotFoundException('Product UOM not found');

      if (dto.isActive === false && existing.is_base) {
        throw new BadRequestException('Cannot deactivate the base UOM');
      }
      if (
        dto.conversionFactorToBase != null &&
        Math.abs(Number(existing.conversion_factor_to_base) - Number(dto.conversionFactorToBase)) > 1e-9
      ) {
        await this.assertProductUomUnusedInTx(tx, productId, existing.uom_id);
      }

      const merged: UpsertProductUomDto = {
        uomId: existing.uom_id,
        conversionFactorToBase:
          dto.conversionFactorToBase ?? Number(existing.conversion_factor_to_base),
        isBase: dto.isBase,
        isPurchaseDefault: dto.isPurchaseDefault,
        isSalesDefault: dto.isSalesDefault,
        isPosDefault: dto.isPosDefault,
        isActive: dto.isActive,
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice,
      };
      const row = await this.upsertProductUomInTx(tx, productId, existing.uom_id, merged, productUomId);
      await this.upsertPriceMetadataInTx(tx, productId, existing.uom_id, dto);
      return row;
    });
  }

  async ensureBaseUomForProductInTx(
    tx: QueryTx,
    productId: string,
    legacyUnit?: string | null,
    opts?: { listPrice?: number | null },
  ): Promise<ProductUomRow> {
    const normalized = normalizeUom(legacyUnit);
    const [uom] = await tx.$queryRawUnsafe<UomRow[]>(
      `INSERT INTO uoms (code, name, symbol, active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (code) DO UPDATE
         SET active = TRUE,
             updated_at = CURRENT_TIMESTAMP
       RETURNING id, code, name, symbol, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      normalized.code,
      normalized.name,
      normalized.symbol,
    );

    await tx.$queryRawUnsafe(
      `INSERT INTO product_uoms (
         product_id, uom_id, conversion_factor_to_base,
         is_base, is_purchase_default, is_sales_default, is_pos_default, is_active
       )
       SELECT $1::uuid, $2::uuid, 1, TRUE, TRUE, TRUE, TRUE, TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM product_uoms
         WHERE product_id = $1::uuid AND is_base IS TRUE AND is_active IS TRUE
       )
       ON CONFLICT (product_id, uom_id) DO UPDATE
         SET conversion_factor_to_base = 1,
             is_base = TRUE,
             is_purchase_default = TRUE,
             is_sales_default = TRUE,
             is_pos_default = TRUE,
             is_active = TRUE,
             updated_at = CURRENT_TIMESTAMP`,
      productId,
      uom!.id,
    );

    await tx.$queryRawUnsafe(
      `UPDATE products SET unit = $2 WHERE id = $1::uuid`,
      productId,
      uom!.symbol ?? uom!.code,
    );

    if (opts?.listPrice != null) {
      await this.upsertPriceInTx(tx, productId, uom!.id, opts.listPrice, null);
    }

    const [row] = await this.productUomsForProductsInTx(tx, [productId], uom!.id);
    return row!;
  }

  async syncLegacyUnitForProductInTx(
    tx: QueryTx,
    productId: string,
    legacyUnit: string | null | undefined,
  ): Promise<void> {
    if (legacyUnit === undefined) return;
    const normalized = normalizeUom(legacyUnit);
    const [current] = await tx.$queryRawUnsafe<Array<{ uom_id: string; code: string }>>(
      `SELECT pu.uom_id, u.code
       FROM product_uoms pu
       JOIN uoms u ON u.id = pu.uom_id
       WHERE pu.product_id = $1::uuid
         AND pu.is_base IS TRUE
         AND pu.is_active IS TRUE
       LIMIT 1`,
      productId,
    );
    if (current?.code === normalized.code) {
      await tx.$queryRawUnsafe(
        `UPDATE products SET unit = $2 WHERE id = $1::uuid`,
        productId,
        STANDARD_UOMS[normalized.code]?.symbol ?? normalized.code,
      );
      return;
    }

    if (current) {
      const hasTransactions = await this.productHasTransactionsInTx(tx, productId);
      if (hasTransactions) {
        throw new ConflictException('Cannot change product base UOM after transactions exist');
      }
      await tx.$queryRawUnsafe(
        `UPDATE product_uoms
         SET is_base = FALSE,
             is_purchase_default = FALSE,
             is_sales_default = FALSE,
             is_pos_default = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1::uuid`,
        productId,
      );
    }

    await this.ensureBaseUomForProductInTx(tx, productId, legacyUnit);
  }

  async syncProductListPriceFromBaseUomInTx(
    tx: QueryTx,
    productId: string,
  ): Promise<void> {
    const [row] = await tx.$queryRawUnsafe<Array<{ selling_price: string | number | null }>>(
      `SELECT pp.selling_price
       FROM product_uoms pu
       JOIN LATERAL (
         SELECT selling_price
         FROM product_uom_prices
         WHERE product_id = pu.product_id
           AND uom_id = pu.uom_id
           AND active IS TRUE
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) pp ON TRUE
       WHERE pu.product_id = $1::uuid
         AND pu.is_base IS TRUE
         AND pu.is_active IS TRUE
       LIMIT 1`,
      productId,
    );
    if (row?.selling_price == null) return;
    const listPrice = Number(row.selling_price);
    if (!Number.isFinite(listPrice)) return;
    await tx.$queryRawUnsafe(
      `UPDATE products SET list_price = $2::numeric WHERE id = $1::uuid`,
      productId,
      listPrice,
    );
  }

  async syncBaseUomMetadataForProductInTx(
    tx: QueryTx,
    productId: string,
    opts: { listPrice?: number | null },
  ): Promise<void> {
    const [base] = await tx.$queryRawUnsafe<{ uom_id: string }[]>(
      `SELECT uom_id
       FROM product_uoms
       WHERE product_id = $1::uuid
         AND is_base IS TRUE
         AND is_active IS TRUE
       LIMIT 1`,
      productId,
    );
    if (!base) return;
    if (opts.listPrice !== undefined) {
      await this.upsertPriceInTx(tx, productId, base.uom_id, opts.listPrice, null);
    }
  }

  async upsertProductUomByCodeInTx(
    tx: QueryTx,
    productId: string,
    input: {
      code: string;
      factor: number;
      isBase?: boolean;
      isPurchaseDefault?: boolean;
      isSalesDefault?: boolean;
      isPosDefault?: boolean;
      sellingPrice?: number | null;
      costPrice?: number | null;
    },
  ): Promise<ProductUomRow> {
    const normalized = normalizeUom(input.code);
    const [uom] = await tx.$queryRawUnsafe<UomRow[]>(
      `INSERT INTO uoms (code, name, symbol, active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (code) DO UPDATE
         SET active = TRUE,
             updated_at = CURRENT_TIMESTAMP
       RETURNING id, code, name, symbol, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      normalized.code,
      normalized.name,
      normalized.symbol,
    );
    const isBase = input.isBase ?? Math.abs(input.factor - 1) < 1e-9;
    const row = await this.upsertProductUomInTx(tx, productId, uom!.id, {
      uomId: uom!.id,
      conversionFactorToBase: input.factor,
      isBase,
      isPurchaseDefault: input.isPurchaseDefault,
      isSalesDefault: input.isSalesDefault,
      isPosDefault: input.isPosDefault,
      isActive: true,
    });
    const priceUpdate: Partial<
      Pick<UpsertProductUomDto, 'sellingPrice' | 'costPrice'>
    > = {};
    if (Object.prototype.hasOwnProperty.call(input, 'sellingPrice')) {
      priceUpdate.sellingPrice = input.sellingPrice;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'costPrice')) {
      priceUpdate.costPrice = input.costPrice;
    }
    if (Object.keys(priceUpdate).length > 0) {
      await this.upsertPriceMetadataInTx(tx, productId, uom!.id, priceUpdate);
    }
    return row;
  }

  async resolveProductUomForDocument(
    tx: QueryTx,
    input: {
      productId: string;
      uomId?: string | null;
      defaultKind?: UomDefaultKind;
    },
  ): Promise<ResolvedProductUom> {
    const defaultKind = input.defaultKind ?? 'base';
    const flag =
      defaultKind === 'purchase'
        ? 'is_purchase_default'
        : defaultKind === 'sales'
          ? 'is_sales_default'
          : defaultKind === 'pos'
            ? 'is_pos_default'
            : 'is_base';
    const params: unknown[] = [input.productId];
    let filter = '';
    if (input.uomId?.trim()) {
      params.push(input.uomId.trim());
      filter = `AND pu.uom_id = $2::uuid`;
    }
    const rows = await tx.$queryRawUnsafe<Array<{
      productUomId: string;
      productId: string;
      uomId: string;
      code: string;
      name: string;
      symbol: string | null;
      conversionFactorToBase: string;
      sellingPrice: string | null;
      costPrice: string | null;
    }>>(
      `SELECT
         pu.id AS "productUomId",
         pu.product_id AS "productId",
         pu.uom_id AS "uomId",
         u.code,
         u.name,
         u.symbol,
         pu.conversion_factor_to_base::text AS "conversionFactorToBase",
         COALESCE(price.selling_price, CASE
           WHEN pu.is_base THEN p.list_price
           ELSE p.list_price * pu.conversion_factor_to_base
         END)::text AS "sellingPrice",
         CASE
           WHEN base_price.cost_price IS NOT NULL
           THEN (base_price.cost_price * pu.conversion_factor_to_base)::text
           ELSE NULL
         END AS "costPrice"
       FROM product_uoms pu
       JOIN uoms u ON u.id = pu.uom_id
       JOIN products p ON p.id = pu.product_id
       LEFT JOIN product_uoms base_pu
         ON base_pu.product_id = pu.product_id
        AND base_pu.is_base IS TRUE
        AND base_pu.is_active IS TRUE
       LEFT JOIN LATERAL (
         SELECT selling_price, cost_price
         FROM product_uom_prices pp
         WHERE pp.product_id = pu.product_id
           AND pp.uom_id = pu.uom_id
           AND pp.active IS TRUE
         ORDER BY pp.updated_at DESC NULLS LAST, pp.created_at DESC
         LIMIT 1
       ) price ON TRUE
       LEFT JOIN LATERAL (
         SELECT cost_price
         FROM product_uom_prices bpp
         WHERE bpp.product_id = pu.product_id
           AND bpp.uom_id = base_pu.uom_id
           AND bpp.active IS TRUE
         ORDER BY bpp.updated_at DESC NULLS LAST, bpp.created_at DESC
         LIMIT 1
       ) base_price ON TRUE
       WHERE pu.product_id = $1::uuid
         AND pu.is_active IS TRUE
         AND u.active IS TRUE
         ${filter}
       ORDER BY
         CASE WHEN pu.${flag} IS TRUE THEN 0 WHEN pu.is_base IS TRUE THEN 1 ELSE 2 END,
         pu.created_at ASC
       LIMIT 1`,
      ...params,
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('Product UOM is not configured');
    }
    return {
      ...row,
      conversionFactorToBase: Number(row.conversionFactorToBase),
      sellingPrice: row.sellingPrice == null ? null : Number(row.sellingPrice),
      costPrice: row.costPrice == null ? null : Number(row.costPrice),
    };
  }

  private async upsertProductUomInTx(
    tx: QueryTx,
    productId: string,
    uomId: string,
    dto: UpsertProductUomDto,
    productUomId?: string,
  ): Promise<ProductUomRow> {
    const factor = Number(dto.conversionFactorToBase);
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new BadRequestException('Conversion factor must be greater than 0');
    }
    if (dto.isBase && Math.abs(factor - 1) > 1e-9) {
      throw new BadRequestException('Base UOM conversion factor must be 1');
    }

    if (dto.isBase === true) {
      const hasTransactions = await this.productHasTransactionsInTx(tx, productId);
      const [existing] = await tx.$queryRawUnsafe<Array<{ id: string; uom_id: string }>>(
        `SELECT id, uom_id FROM product_uoms
         WHERE product_id = $1::uuid AND is_base IS TRUE AND is_active IS TRUE
         LIMIT 1`,
        productId,
      );
      if (existing && existing.uom_id !== uomId && hasTransactions) {
        throw new ConflictException('Cannot change product base UOM after transactions exist');
      }
      await tx.$queryRawUnsafe(
        `UPDATE product_uoms
         SET is_base = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1::uuid
           AND uom_id <> $2::uuid`,
        productId,
        uomId,
      );
    }

    await this.clearDefaultFlagsInTx(tx, productId, uomId, dto);

    const [row] = await tx.$queryRawUnsafe<ProductUomDbRow[]>(
      `INSERT INTO product_uoms (
         id, product_id, uom_id, conversion_factor_to_base,
         is_base, is_purchase_default, is_sales_default, is_pos_default, is_active
       )
       VALUES (
         COALESCE($9::uuid, gen_random_uuid()), $1::uuid, $2::uuid, $3::numeric,
         COALESCE($4::boolean, FALSE), COALESCE($5::boolean, FALSE),
         COALESCE($6::boolean, FALSE), COALESCE($7::boolean, FALSE),
         COALESCE($8::boolean, TRUE)
       )
       ON CONFLICT (product_id, uom_id) DO UPDATE
         SET conversion_factor_to_base = EXCLUDED.conversion_factor_to_base,
             is_base = COALESCE($4::boolean, product_uoms.is_base),
             is_purchase_default = COALESCE($5::boolean, product_uoms.is_purchase_default),
             is_sales_default = COALESCE($6::boolean, product_uoms.is_sales_default),
             is_pos_default = COALESCE($7::boolean, product_uoms.is_pos_default),
             is_active = COALESCE($8::boolean, product_uoms.is_active),
             updated_at = CURRENT_TIMESTAMP
       RETURNING
         id,
         product_id AS "productId",
         uom_id AS "uomId",
         NULL::text AS code,
         NULL::text AS name,
         NULL::text AS symbol,
         conversion_factor_to_base AS "conversionFactorToBase",
         is_base AS "isBase",
         is_purchase_default AS "isPurchaseDefault",
         is_sales_default AS "isSalesDefault",
         is_pos_default AS "isPosDefault",
         is_active AS "isActive",
         NULL::numeric AS "sellingPrice",
         NULL::numeric AS "costPrice",
         NULL::numeric AS "initialCostPrice",
         NULL::numeric AS "lastPurchaseCost",
         NULL::timestamp AS "lastPurchaseAt",
         '[]'::jsonb AS barcodes,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      productId,
      uomId,
      factor,
      dto.isBase ?? null,
      dto.isPurchaseDefault ?? null,
      dto.isSalesDefault ?? null,
      dto.isPosDefault ?? null,
      dto.isActive ?? null,
      productUomId ?? null,
    );

    if ((dto.isBase || dto.isPurchaseDefault || dto.isSalesDefault || dto.isPosDefault) && dto.isActive === false) {
      throw new BadRequestException('Default UOM rows must be active');
    }

    const [full] = await this.productUomsForProductsInTx(tx, [productId], row!.uomId);
    return full!;
  }

  private async clearDefaultFlagsInTx(
    tx: QueryTx,
    productId: string,
    uomId: string,
    dto: Partial<UpsertProductUomDto>,
  ): Promise<void> {
    const updates: string[] = [];
    if (dto.isPurchaseDefault === true) updates.push('is_purchase_default = FALSE');
    if (dto.isSalesDefault === true) updates.push('is_sales_default = FALSE');
    if (dto.isPosDefault === true) updates.push('is_pos_default = FALSE');
    if (!updates.length) return;
    await tx.$queryRawUnsafe(
      `UPDATE product_uoms
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $1::uuid
         AND uom_id <> $2::uuid`,
      productId,
      uomId,
    );
  }

  private async isProductBaseUomInTx(
    tx: QueryTx,
    productId: string,
    uomId: string,
  ): Promise<boolean> {
    const [row] = await tx.$queryRawUnsafe<Array<{ is_base: boolean }>>(
      `SELECT is_base
       FROM product_uoms
       WHERE product_id = $1::uuid
         AND uom_id = $2::uuid
         AND is_active IS TRUE
       LIMIT 1`,
      productId,
      uomId,
    );
    return row?.is_base === true;
  }

  private async upsertPriceMetadataInTx(
    tx: QueryTx,
    productId: string,
    uomId: string,
    dto: Partial<Pick<UpsertProductUomDto, 'sellingPrice' | 'costPrice'>>,
  ): Promise<void> {
    const wantsPriceUpdate =
      Object.prototype.hasOwnProperty.call(dto, 'sellingPrice') ||
      Object.prototype.hasOwnProperty.call(dto, 'costPrice');
    if (wantsPriceUpdate) {
      if (dto.costPrice != null && !(await this.isProductBaseUomInTx(tx, productId, uomId))) {
        throw new BadRequestException('Cost price can only be set on the base UOM');
      }
      if (dto.sellingPrice != null || dto.costPrice != null) {
        await this.upsertPriceInTx(
          tx,
          productId,
          uomId,
          dto.sellingPrice,
          dto.costPrice,
        );
      } else {
        await tx.$queryRawUnsafe(
          `UPDATE product_uom_prices
           SET active = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1::uuid AND uom_id = $2::uuid AND active IS TRUE`,
          productId,
          uomId,
        );
      }
    }
  }

  async upsertSellingPriceInTx(
    tx: QueryTx,
    productId: string,
    uomId: string,
    sellingPrice: number,
  ): Promise<void> {
    await this.upsertPriceInTx(tx, productId, uomId, sellingPrice, undefined);
  }

  async upsertBaseCostInTx(
    tx: QueryTx,
    productId: string,
    baseCost: number | null,
    meta?: {
      lastPurchaseCost?: number | null;
      lastPurchaseAt?: Date | string | null;
      lastPurchaseId?: string | null;
      lastPurchaseItemId?: string | null;
      setInitialCost?: boolean;
    },
  ): Promise<void> {
    const [base] = await tx.$queryRawUnsafe<Array<{ uom_id: string }>>(
      `SELECT uom_id
       FROM product_uoms
       WHERE product_id = $1::uuid
         AND is_base IS TRUE
         AND is_active IS TRUE
       LIMIT 1`,
      productId,
    );
    if (!base) return;

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
      productId,
      base.uom_id,
    );

    await tx.$queryRawUnsafe(
      `UPDATE product_uom_prices
       SET active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $1::uuid
         AND uom_id = $2::uuid
         AND active IS TRUE`,
      productId,
      base.uom_id,
    );

    const nextCost = baseCost ?? current?.cost_price ?? null;
    const nextLastPurchase =
      meta?.lastPurchaseCost !== undefined
        ? meta.lastPurchaseCost
        : current?.last_purchase_cost ?? null;

    await tx.$queryRawUnsafe(
      `INSERT INTO product_uom_prices (
         product_id, uom_id, selling_price, cost_price,
         initial_cost_price, last_purchase_cost, last_purchase_at,
         last_purchase_id, last_purchase_item_id, active
       )
       VALUES (
         $1::uuid, $2::uuid, $3::numeric, $4::numeric,
         $5::numeric, $6::numeric, $7::timestamp,
         $8::uuid, $9::uuid, TRUE
       )`,
      productId,
      base.uom_id,
      current?.selling_price ?? null,
      nextCost,
      meta?.setInitialCost
        ? nextCost
        : current?.initial_cost_price ?? current?.cost_price ?? nextCost,
      nextLastPurchase,
      meta?.lastPurchaseAt !== undefined
        ? meta.lastPurchaseAt
        : current?.last_purchase_at ?? null,
      meta?.lastPurchaseId !== undefined
        ? meta.lastPurchaseId
        : current?.last_purchase_id ?? null,
      meta?.lastPurchaseItemId !== undefined
        ? meta.lastPurchaseItemId
        : current?.last_purchase_item_id ?? null,
    );
  }

  private async upsertPriceInTx(
    tx: QueryTx,
    productId: string,
    uomId: string,
    sellingPrice?: number | null,
    costPrice?: number | null,
  ): Promise<void> {
    if (sellingPrice == null && costPrice == null) return;

    const isBase = await this.isProductBaseUomInTx(tx, productId, uomId);
    if (costPrice != null && !isBase) {
      throw new BadRequestException('Cost price can only be set on the base UOM');
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
      productId,
      uomId,
    );

    await tx.$queryRawUnsafe(
      `UPDATE product_uom_prices
       SET active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $1::uuid
         AND uom_id = $2::uuid
         AND active IS TRUE`,
      productId,
      uomId,
    );

    await tx.$queryRawUnsafe(
      `INSERT INTO product_uom_prices (
         product_id, uom_id, selling_price, cost_price,
         initial_cost_price, last_purchase_cost, last_purchase_at,
         last_purchase_id, last_purchase_item_id, active
       )
       VALUES (
         $1::uuid, $2::uuid, $3::numeric, $4::numeric,
         $5::numeric, $6::numeric, $7::timestamp,
         $8::uuid, $9::uuid, TRUE
       )`,
      productId,
      uomId,
      sellingPrice ?? current?.selling_price ?? null,
      isBase ? (costPrice ?? current?.cost_price ?? null) : null,
      isBase
        ? (current?.initial_cost_price ?? current?.cost_price ?? costPrice ?? null)
        : null,
      isBase ? (current?.last_purchase_cost ?? null) : null,
      isBase ? (current?.last_purchase_at ?? null) : null,
      isBase ? (current?.last_purchase_id ?? null) : null,
      isBase ? (current?.last_purchase_item_id ?? null) : null,
    );
  }

  private async upsertBarcodeInTx(
    tx: QueryTx,
    productId: string,
    uomId: string,
    barcode?: string | null,
  ): Promise<void> {
    const clean = barcode?.trim() ?? '';
    const schemaName = await this.currentSchemaInTx(tx);
    this.logBarcodeValidation('uom-upsert-start', {
      schemaName,
      barcode: clean,
      table: 'product_uom_barcodes',
      productId,
      uomId,
    });
    await tx.$queryRawUnsafe(
      `UPDATE product_uom_barcodes
       SET active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $1::uuid AND uom_id = $2::uuid AND active IS TRUE`,
      productId,
      uomId,
    );
    if (!clean) return;

    this.logBarcodeValidation('search', {
      schemaName,
      barcode: clean,
      table: 'products',
      column: 'barcode',
      excludeProductId: productId,
    });
    const [productConflict] = await tx.$queryRawUnsafe<Array<{
      id: string;
      name: string;
    }>>(
      `SELECT id, name
       FROM products
       WHERE btrim(barcode) = btrim($1::text)
         AND id <> $2::uuid
       LIMIT 1`,
      clean,
      productId,
    );
    if (productConflict) {
      this.logBarcodeValidation('match', {
        schemaName,
        barcode: clean,
        table: 'products',
        column: 'barcode',
        matchingRecordId: productConflict.id,
        matchingProductId: productConflict.id,
        matchingProductName: productConflict.name,
      });
      throw new ConflictException('Barcode is already assigned to another product');
    }

    this.logBarcodeValidation('search', {
      schemaName,
      barcode: clean,
      table: 'product_uom_barcodes',
      column: 'barcode',
      excludeProductId: productId,
      excludeUomId: uomId,
    });
    const [uomConflict] = await tx.$queryRawUnsafe<Array<{
      recordId: string;
      productId: string;
      productName: string;
    }>>(
      `SELECT pub.id AS "recordId", p.id AS "productId", p.name AS "productName"
       FROM product_uom_barcodes pub
       JOIN products p ON p.id = pub.product_id
       WHERE btrim(pub.barcode) = btrim($1::text)
         AND pub.active IS TRUE
         AND NOT (pub.product_id = $2::uuid AND pub.uom_id = $3::uuid)
       LIMIT 1`,
      clean,
      productId,
      uomId,
    );
    if (uomConflict) {
      this.logBarcodeValidation('match', {
        schemaName,
        barcode: clean,
        table: 'product_uom_barcodes',
        column: 'barcode',
        matchingRecordId: uomConflict.recordId,
        matchingProductId: uomConflict.productId,
        matchingProductName: uomConflict.productName,
      });
      throw new ConflictException('Barcode is already assigned to another UOM');
    }

    const [sameProductUomBarcode] = await tx.$queryRawUnsafe<Array<{
      recordId: string;
      productName: string;
    }>>(
      `SELECT pub.id AS "recordId", p.name AS "productName"
       FROM product_uom_barcodes pub
       JOIN products p ON p.id = pub.product_id
       WHERE pub.product_id = $1::uuid
         AND pub.uom_id = $2::uuid
         AND btrim(pub.barcode) = btrim($3::text)
       ORDER BY pub.active DESC, pub.updated_at DESC NULLS LAST, pub.created_at DESC
       LIMIT 1`,
      productId,
      uomId,
      clean,
    );
    if (sameProductUomBarcode) {
      this.logBarcodeValidation('same-product-uom-match', {
        schemaName,
        barcode: clean,
        table: 'product_uom_barcodes',
        matchingRecordId: sameProductUomBarcode.recordId,
        matchingProductId: productId,
        matchingProductName: sameProductUomBarcode.productName,
      });
      try {
        await tx.$queryRawUnsafe(
          `UPDATE product_uom_barcodes
           SET barcode = $1, active = TRUE, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2::uuid`,
          clean,
          sameProductUomBarcode.recordId,
        );
      } catch (e) {
        this.logBarcodeValidation('unique-violation', {
          schemaName,
          barcode: clean,
          table: 'product_uom_barcodes',
          matchingRecordId: sameProductUomBarcode.recordId,
          matchingProductId: productId,
          matchingProductName: sameProductUomBarcode.productName,
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        this.rethrowUnique(e, 'Barcode is already assigned to another UOM');
        throw e;
      }
      return;
    }

    try {
      const [inserted] = await tx.$queryRawUnsafe<Array<{ recordId: string }>>(
        `INSERT INTO product_uom_barcodes (product_id, uom_id, barcode, active)
         VALUES ($1::uuid, $2::uuid, $3, TRUE)
         RETURNING id AS "recordId"`,
        productId,
        uomId,
        clean,
      );
      this.logBarcodeValidation('inserted', {
        schemaName,
        barcode: clean,
        table: 'product_uom_barcodes',
        matchingRecordId: inserted?.recordId ?? null,
        matchingProductId: productId,
      });
    } catch (e) {
      this.logBarcodeValidation('unique-violation', {
        schemaName,
        barcode: clean,
        table: 'product_uom_barcodes',
        productId,
        uomId,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      this.rethrowUnique(e, 'Barcode is already assigned to another UOM');
      throw e;
    }
  }

  private async productUomsForProductsInTx(
    tx: QueryTx,
    productIds: string[],
    onlyUomId?: string,
  ): Promise<ProductUomRow[]> {
    const params: unknown[] = [productIds];
    let only = '';
    if (onlyUomId) {
      params.push(onlyUomId);
      only = `AND pu.uom_id = $2::uuid`;
    }
    const rows = await tx.$queryRawUnsafe<ProductUomDbRow[]>(
      `SELECT
         pu.id,
         pu.product_id AS "productId",
         pu.uom_id AS "uomId",
         u.code,
         u.name,
         u.symbol,
         pu.conversion_factor_to_base AS "conversionFactorToBase",
         pu.is_base AS "isBase",
         pu.is_purchase_default AS "isPurchaseDefault",
         pu.is_sales_default AS "isSalesDefault",
         pu.is_pos_default AS "isPosDefault",
         pu.is_active AS "isActive",
         price.selling_price AS "sellingPrice",
         CASE
           WHEN base_price.cost_price IS NOT NULL
           THEN base_price.cost_price * pu.conversion_factor_to_base
           ELSE NULL
         END AS "costPrice",
         CASE
           WHEN base_price.initial_cost_price IS NOT NULL
           THEN base_price.initial_cost_price * pu.conversion_factor_to_base
           ELSE NULL
         END AS "initialCostPrice",
         CASE
           WHEN base_price.last_purchase_cost IS NOT NULL
           THEN base_price.last_purchase_cost * pu.conversion_factor_to_base
           ELSE NULL
         END AS "lastPurchaseCost",
         base_price.last_purchase_at AS "lastPurchaseAt",
         COALESCE(jsonb_agg(DISTINCT b.barcode) FILTER (WHERE b.id IS NOT NULL AND b.active IS TRUE), '[]'::jsonb) AS barcodes,
         pu.created_at AS "createdAt",
         pu.updated_at AS "updatedAt"
       FROM product_uoms pu
       JOIN uoms u ON u.id = pu.uom_id
       LEFT JOIN product_uoms base_pu
         ON base_pu.product_id = pu.product_id
        AND base_pu.is_base IS TRUE
        AND base_pu.is_active IS TRUE
       LEFT JOIN LATERAL (
         SELECT selling_price, cost_price, initial_cost_price, last_purchase_cost, last_purchase_at
         FROM product_uom_prices pp
         WHERE pp.product_id = pu.product_id
           AND pp.uom_id = pu.uom_id
           AND pp.active IS TRUE
         ORDER BY pp.updated_at DESC NULLS LAST, pp.created_at DESC
         LIMIT 1
       ) price ON TRUE
       LEFT JOIN LATERAL (
         SELECT cost_price, initial_cost_price, last_purchase_cost, last_purchase_at
         FROM product_uom_prices bpp
         WHERE bpp.product_id = pu.product_id
           AND bpp.uom_id = base_pu.uom_id
           AND bpp.active IS TRUE
         ORDER BY bpp.updated_at DESC NULLS LAST, bpp.created_at DESC
         LIMIT 1
       ) base_price ON TRUE
       LEFT JOIN product_uom_barcodes b
         ON b.product_id = pu.product_id
        AND b.uom_id = pu.uom_id
        AND b.active IS TRUE
       WHERE pu.product_id = ANY($1::uuid[])
         ${only}
       GROUP BY
         pu.id, pu.product_id, pu.uom_id, u.code, u.name, u.symbol,
         pu.conversion_factor_to_base, pu.is_base, pu.is_purchase_default,
         pu.is_sales_default, pu.is_pos_default, pu.is_active,
         price.selling_price,
         base_price.cost_price, base_price.initial_cost_price,
         base_price.last_purchase_cost, base_price.last_purchase_at,
         pu.created_at, pu.updated_at
       ORDER BY pu.is_base DESC, pu.conversion_factor_to_base ASC, u.code ASC`,
      ...params,
    );
    return rows.map((r) => ({ ...r, barcodes: barcodeArray(r.barcodes) }));
  }

  private async assertProductVisibleInTx(
    tx: QueryTx,
    productId: string,
    allowedBranchIds: string[],
  ): Promise<void> {
    const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id
       FROM products
       WHERE id = $1::uuid
         AND (branch_id IS NULL OR branch_id = ANY($2::uuid[]))
       LIMIT 1`,
      productId,
      allowedBranchIds,
    );
    if (!row) throw new NotFoundException('Product not found');
  }

  private async assertUomExistsInTx(tx: QueryTx, uomId: string): Promise<void> {
    const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM uoms WHERE id = $1::uuid AND active IS TRUE`,
      uomId,
    );
    if (!row) throw new NotFoundException('UOM not found');
  }

  private async assertProductUomUnusedInTx(
    tx: QueryTx,
    productId: string,
    uomId: string,
  ): Promise<void> {
    const [row] = await tx.$queryRawUnsafe<{ c: number }[]>(
      `SELECT (
         (SELECT COUNT(*) FROM purchase_items WHERE product_id = $1::uuid AND uom_id = $2::uuid) +
         (SELECT COUNT(*) FROM sale_items WHERE product_id = $1::uuid AND uom_id = $2::uuid) +
         (SELECT COUNT(*) FROM opening_stock_entries WHERE product_id = $1::uuid)
       )::int AS c`,
      productId,
      uomId,
    );
    if (Number(row?.c ?? 0) > 0) {
      throw new ConflictException('Cannot change conversion factor after transactions exist');
    }
  }

  private async productHasTransactionsInTx(tx: QueryTx, productId: string): Promise<boolean> {
    const [row] = await tx.$queryRawUnsafe<{ c: number }[]>(
      `SELECT (
         (SELECT COUNT(*) FROM purchase_items WHERE product_id = $1::uuid) +
         (SELECT COUNT(*) FROM sale_items WHERE product_id = $1::uuid) +
         (SELECT COUNT(*) FROM sale_return_items WHERE product_id = $1::uuid) +
         (SELECT COUNT(*) FROM opening_stock_entries WHERE product_id = $1::uuid) +
         (SELECT COUNT(*) FROM stock_transfer_items WHERE product_id = $1::uuid)
       )::int AS c`,
      productId,
    );
    return Number(row?.c ?? 0) > 0;
  }

  private rethrowUnique(e: unknown, message: string): void {
    if (isPrismaRawUniqueViolation(e)) {
      throw new ConflictException(message);
    }
    const rawMessage = e instanceof Error ? e.message : String(e);
    if (isRawQueryUniqueMessage(rawMessage)) {
      throw new ConflictException(message);
    }
  }
}
