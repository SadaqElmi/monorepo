import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { TenantService } from '../tenant/tenant.service';
import { UomsService } from '../uoms/uoms.service';
import {
  isPrismaRawUniqueViolation,
  isRawQueryUniqueMessage,
} from '../common/prisma-raw-error.util';
import {
  CreateProductDto,
  type ProductUomSetupDto,
} from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productSelect = `
           id,
           branch_id AS "branchId",
           item_no AS "itemNo",
           name,
           generic_name AS "genericName",
           barcode AS "sku",
           list_price AS "listPrice",
           category_id AS "categoryId",
           supplier_id AS "supplierId",
           strength AS "strength",
           formulation AS "formulation",
           unit,
           description,
           created_at AS "createdAt"`;

/** Same columns as productSelect but from alias `p`, plus joined category name (tenant catalog). */
const productSelectJoined = `
           p.id,
           p.branch_id AS "branchId",
           p.item_no AS "itemNo",
           p.name,
           p.generic_name AS "genericName",
           p.barcode AS "sku",
           p.list_price AS "listPrice",
           p.category_id AS "categoryId",
           pref.supplier_id AS "supplierId",
           p.strength AS "strength",
           p.formulation AS "formulation",
           p.unit,
           p.description,
           p.created_at AS "createdAt",
           c.name AS "categoryName",
           pref.supplier_name AS "supplierName"`;

export interface ProductRow {
  id: string;
  branchId: string | null;
  itemNo: string | null;
  name: string;
  genericName: string | null;
  sku: string | null;
  listPrice: number | string;
  categoryId: string | null;
  supplierId: string | null;
  strength: string | null;
  formulation: string | null;
  unit: string | null;
  description: string | null;
  createdAt: Date;
}

export interface ProductJoinedRow extends ProductRow {
  categoryName: string | null;
  supplierName?: string | null;
}

export interface ProductTransferCatalogRow extends ProductJoinedRow {
  availableStock: number;
}

export interface ProductBarcodeLookupRow extends ProductJoinedRow {
  uomId?: string | null;
  uomCode?: string | null;
  uomName?: string | null;
  uomSymbol?: string | null;
  conversionFactorToBase?: number | string | null;
  uomSellingPrice?: number | string | null;
  uomCostPrice?: number | string | null;
  matchedBarcode?: string | null;
}

export interface ProductSupplierRow {
  id: string;
  productId: string;
  supplierId: string;
  supplierName: string | null;
  supplierType: 'local' | 'international';
  country: string | null;
  city: string | null;
  isPreferred: boolean;
  lastCostPrice: number | string | null;
  supplierItemCode: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

type ProductDeleteBlockerCode =
  | 'HAS_SALES'
  | 'HAS_SALE_RETURNS'
  | 'HAS_PURCHASES'
  | 'HAS_TRANSFERS'
  | 'HAS_OPENING_STOCK'
  | 'HAS_INVENTORY_QTY'
  | 'HAS_BATCH_QTY';

type ProductDeleteBlocker = {
  code: ProductDeleteBlockerCode;
  message: string;
  count?: number;
  quantity?: number;
};

type ProductDeleteDependencyCounts = {
  sale_count: number;
  sale_return_count: number;
  purchase_count: number;
  transfer_count: number;
  opening_stock_count: number;
  inventory_qty: number;
  batch_qty: number;
};

type BarcodeOwnerSummary = {
  id: string;
  name: string;
  table: 'products';
  recordId: string;
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly catalogTtlMs = resolveCatalogCacheTtlMs();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly taggedCache: TaggedCacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly uomsService: UomsService,
  ) {}

  /** `paramIndex` is the placeholder number for the uuid[] (use 2 when $1 is already barcode/id). */
  private branchVisibilityClause(allowedBranchIds: string[], paramIndex = 1) {
    if (!allowedBranchIds.length) {
      return { sql: `branch_id IS NULL`, params: [] as unknown[] };
    }
    const p = `$${paramIndex}`;
    return {
      sql: `(branch_id IS NULL OR branch_id = ANY(${p}::uuid[]))`,
      params: [allowedBranchIds],
    };
  }

  private catalogTags(tenantId: string, allowedBranchIds: string[]) {
    return [
      ...catalogBranchTags(tenantId, allowedBranchIds),
      ...catalogTenantTags(tenantId),
    ];
  }

  private logBarcodeValidation(
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.logger.log(
      `[barcode-validation] ${event} ${JSON.stringify(payload)}`,
    );
  }

  private resolveInitialBaseUnit(dto: CreateProductDto | UpdateProductDto) {
    const explicitBase = dto.uoms?.find((row) => {
      const factor = Number(row.conversionFactorToBase ?? 1);
      return row.isBase === true || Math.abs(factor - 1) < 1e-9;
    });
    return dto.unit ?? explicitBase?.code;
  }

  private resolveBaseUomSellingPrice(
    dto: CreateProductDto | UpdateProductDto,
  ): number | undefined {
    const baseRow =
      dto.uoms?.find((row) => row.isBase === true) ??
      dto.uoms?.find((row) => {
        const factor = Number(row.conversionFactorToBase ?? 1);
        return Math.abs(factor - 1) < 1e-9;
      });
    if (baseRow?.sellingPrice == null) return undefined;
    const price = Number(baseRow.sellingPrice);
    return Number.isFinite(price) ? price : undefined;
  }

  private normalizeProductUomSetup(
    uoms: ProductUomSetupDto[],
  ): ProductUomSetupDto[] {
    const baseIndex = uoms.findIndex((row) => {
      const factor = Number(row.conversionFactorToBase ?? 1);
      return row.isBase === true || Math.abs(factor - 1) < 1e-9;
    });
    if (baseIndex < 0) return uoms;

    const hasPurchaseDefault = uoms.some((row) => row.isPurchaseDefault === true);
    const hasSalesDefault = uoms.some((row) => row.isSalesDefault === true);
    const hasPosDefault = uoms.some((row) => row.isPosDefault === true);

    return uoms.map((row, index) => ({
      ...row,
      isBase: row.isBase ?? index === baseIndex,
      isPurchaseDefault: hasPurchaseDefault
        ? row.isPurchaseDefault
        : index === baseIndex,
      isSalesDefault: hasSalesDefault ? row.isSalesDefault : index === baseIndex,
      isPosDefault: hasPosDefault ? row.isPosDefault : index === baseIndex,
    }));
  }

  private validateProductUomSetup(uoms?: ProductUomSetupDto[]): void {
    if (!uoms?.length) return;
    const cleanCodes = new Set<string>();
    let baseCount = 0;
    let purchaseDefaultCount = 0;
    let salesDefaultCount = 0;
    let posDefaultCount = 0;

    for (const row of uoms) {
      const code = row.code?.trim().toUpperCase();
      if (!code) {
        throw new BadRequestException('UOM code is required');
      }
      if (cleanCodes.has(code)) {
        throw new BadRequestException(`Duplicate product UOM code: ${code}`);
      }
      cleanCodes.add(code);

      const factor = Number(row.conversionFactorToBase ?? (row.isBase ? 1 : NaN));
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new BadRequestException('UOM conversion factor must be greater than 0');
      }
      const isBase = row.isBase === true || Math.abs(factor - 1) < 1e-9;
      if (isBase && Math.abs(factor - 1) > 1e-9) {
        throw new BadRequestException('Base UOM conversion factor must be 1');
      }
      if (isBase) baseCount += 1;
      if (row.isPurchaseDefault === true) purchaseDefaultCount += 1;
      if (row.isSalesDefault === true) salesDefaultCount += 1;
      if (row.isPosDefault === true) posDefaultCount += 1;
    }

    if (baseCount !== 1) {
      throw new BadRequestException('Exactly one active base UOM is required');
    }
    if (purchaseDefaultCount !== 1) {
      throw new BadRequestException('Exactly one purchase default UOM is required');
    }
    if (salesDefaultCount !== 1) {
      throw new BadRequestException('Exactly one sales default UOM is required');
    }
    if (posDefaultCount !== 1) {
      throw new BadRequestException('Exactly one POS default UOM is required');
    }
  }

  private async applyProductUomSetupInTx(
    tx: Prisma.TransactionClient,
    productId: string,
    uoms?: ProductUomSetupDto[],
  ): Promise<void> {
    if (!uoms?.length) return;
    const normalizedUoms = this.normalizeProductUomSetup(uoms);
    this.validateProductUomSetup(normalizedUoms);
    for (const row of normalizedUoms) {
      const factor = Number(row.conversionFactorToBase ?? (row.isBase ? 1 : NaN));
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new BadRequestException('UOM conversion factor must be greater than 0');
      }
      if (row.isBase && Math.abs(factor - 1) > 1e-9) {
        throw new BadRequestException('Base UOM conversion factor must be 1');
      }
      const isBase = row.isBase === true || Math.abs(factor - 1) < 1e-9;
      await this.uomsService.upsertProductUomByCodeInTx(tx, productId, {
        code: row.code,
        factor,
        isBase,
        isPurchaseDefault: row.isPurchaseDefault,
        isSalesDefault: row.isSalesDefault,
        isPosDefault: row.isPosDefault,
        ...(row.sellingPrice != null ? { sellingPrice: row.sellingPrice } : {}),
        ...(row.costPrice != null ? { costPrice: row.costPrice } : {}),
      });
    }
  }

  async findAll(
    schemaName: string,
    tenantId: string,
    allowedBranchIds: string[],
  ) {
    const scope = normalizeBranchScope(allowedBranchIds);
    const key = catalogListCacheKey(tenantId, scope, 'products');
    const tags = this.catalogTags(tenantId, allowedBranchIds);
    return this.taggedCache.getOrSet(
      key,
      tags,
      this.catalogTtlMs,
      () => this.findAllUncached(schemaName, allowedBranchIds),
    );
  }

  private async findAllUncached(
    schemaName: string,
    allowedBranchIds: string[],
  ) {
    const vis = this.branchVisibilityClause(allowedBranchIds);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      return tx.$queryRawUnsafe<ProductRow[]>(
        `SELECT ${productSelect.replace(/\s+/g, ' ').trim()}
         FROM products
         WHERE ${vis.sql}
         ORDER BY created_at DESC`,
        ...vis.params,
      );
    });
  }

  async findAllPaged(
    schemaName: string,
    allowedBranchIds: string[],
    skip: number,
    take: number,
  ): Promise<PagedResult<ProductRow>> {
    const vis = this.branchVisibilityClause(allowedBranchIds);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM products WHERE ${vis.sql}`,
        ...vis.params,
      );
      const total = Number(countRow?.c ?? 0);
      const items = await tx.$queryRawUnsafe<ProductRow[]>(
        `SELECT ${productSelect.replace(/\s+/g, ' ').trim()}
         FROM products
         WHERE ${vis.sql}
         ORDER BY created_at DESC
         LIMIT $${vis.params.length + 1} OFFSET $${vis.params.length + 2}`,
        ...vis.params,
        take,
        skip,
      );
      const page = Math.floor(skip / take) + 1;
      return toPagedResult(items, total, page, take);
    });
  }

  /** Full tenant catalog: global product visibility for every branch/user. */
  async findAllTenantCatalog(schemaName: string, tenantId: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const key = catalogListCacheKey(tenantId, 'all', 'products:catalog');
    const tags = catalogTenantTags(tenantId);
    return this.taggedCache.getOrSet(
      key,
      tags,
      this.catalogTtlMs,
      () => this.findAllTenantCatalogUncached(schemaName),
    );
  }

  private async findAllTenantCatalogUncached(schemaName: string) {
    const rows = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      return tx.$queryRawUnsafe<ProductJoinedRow[]>(
        `SELECT ${productSelectJoined.replace(/\s+/g, ' ').trim()}
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         LEFT JOIN LATERAL (
           SELECT ps.supplier_id, s.name AS supplier_name
           FROM product_suppliers ps
           JOIN suppliers s ON s.id = ps.supplier_id
           WHERE ps.product_id = p.id
             AND ps.is_preferred
           LIMIT 1
         ) pref ON TRUE
         ORDER BY p.created_at DESC`,
      );
    });
    const uomsByProduct = await this.uomsService.listProductUomsForProducts(
      schemaName,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({ ...row, uoms: uomsByProduct[row.id] ?? [] }));
  }

  /** Transfer catalog scoped to active branch visibility + inventory presence. Not cached (live stock). */
  async findTransferCatalog(schemaName: string, allowedBranchIds: string[]) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    if (!allowedBranchIds.length) return [];
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      return tx.$queryRawUnsafe<ProductTransferCatalogRow[]>(
        `SELECT
           ${productSelectJoined.replace(/\s+/g, ' ').trim()},
           COALESCE(SUM(i.quantity), 0)::int AS "availableStock"
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         LEFT JOIN LATERAL (
           SELECT ps.supplier_id, s.name AS supplier_name
           FROM product_suppliers ps
           JOIN suppliers s ON s.id = ps.supplier_id
           WHERE ps.product_id = p.id
             AND ps.is_preferred
           LIMIT 1
         ) pref ON TRUE
         JOIN inventory i
           ON i.product_id = p.id
          AND i.branch_id = ANY($1::uuid[])
         WHERE (p.branch_id IS NULL OR p.branch_id = ANY($1::uuid[]))
         GROUP BY
           p.id, p.branch_id, p.item_no, p.name, p.generic_name, p.barcode, p.list_price,
           p.category_id, pref.supplier_id, p.strength, p.formulation, p.unit, p.description,
           p.created_at, c.name, pref.supplier_name
         ORDER BY p.name ASC`,
        allowedBranchIds,
      );
    });
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    const vis = this.branchVisibilityClause(allowedBranchIds, 2);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<ProductRow[]>(
        `SELECT ${productSelect.replace(/\s+/g, ' ').trim()}
         FROM products
         WHERE id = $1
           AND ${vis.sql}`,
        id,
        ...vis.params,
      );
      return rows[0] ?? null;
    });
  }

  /**
   * Resolve products by UUID id, exact barcode, or case-insensitive name (max 20).
   */
  async lookup(
    schemaName: string,
    q: string,
    allowedBranchIds: string[],
  ): Promise<{ matches: ProductRow[] }> {
    const trimmed = q?.trim() ?? '';
    if (!trimmed) {
      return { matches: [] };
    }

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRe.test(trimmed)) {
      const row = await this.findOne(schemaName, trimmed, allowedBranchIds);
      return { matches: row ? [row] : [] };
    }

    const byBar = await this.findByBarcode(
      schemaName,
      trimmed,
      allowedBranchIds,
    );
    if (byBar) {
      return { matches: [byBar] };
    }

    const esc = trimmed
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
    const pattern = `%${esc}%`;

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (!allowedBranchIds.length) {
        const rows = await tx.$queryRawUnsafe<ProductRow[]>(
          `SELECT ${productSelect.replace(/\s+/g, ' ').trim()}
           FROM products
           WHERE branch_id IS NULL
             AND name ILIKE $1 ESCAPE '\\'
           ORDER BY name ASC
           LIMIT 20`,
          pattern,
        );
        return { matches: rows };
      }
      const vis = this.branchVisibilityClause(allowedBranchIds, 2);
      const rows = await tx.$queryRawUnsafe<ProductRow[]>(
        `SELECT ${productSelect.replace(/\s+/g, ' ').trim()}
         FROM products
         WHERE ${vis.sql}
           AND name ILIKE $1 ESCAPE '\\'
         ORDER BY name ASC
         LIMIT 20`,
        pattern,
        ...vis.params,
      );
      return { matches: rows };
    });
  }

  async findByBarcode(
    schemaName: string,
    barcode: string,
    allowedBranchIds: string[],
  ) {
    const trimmed = barcode?.trim();
    if (!trimmed) {
      return null;
    }
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const visSql = !allowedBranchIds.length
      ? `p.branch_id IS NULL`
      : `(p.branch_id IS NULL OR p.branch_id = ANY($2::uuid[]))`;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const productRows = await tx.$queryRawUnsafe<ProductBarcodeLookupRow[]>(
        `SELECT
           ${productSelectJoined.replace(/\s+/g, ' ').trim()},
           pu.uom_id AS "uomId",
           u.code AS "uomCode",
           u.name AS "uomName",
           u.symbol AS "uomSymbol",
           pu.conversion_factor_to_base AS "conversionFactorToBase",
           COALESCE(price.selling_price, p.list_price) AS "uomSellingPrice",
           price.cost_price AS "uomCostPrice",
           p.barcode AS "matchedBarcode"
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         LEFT JOIN LATERAL (
           SELECT ps.supplier_id, s.name AS supplier_name
           FROM product_suppliers ps
           JOIN suppliers s ON s.id = ps.supplier_id
           WHERE ps.product_id = p.id
             AND ps.is_preferred
           LIMIT 1
         ) pref ON TRUE
         LEFT JOIN product_uoms pu
           ON pu.product_id = p.id
          AND pu.is_base IS TRUE
          AND pu.is_active IS TRUE
         LEFT JOIN uoms u ON u.id = pu.uom_id
         LEFT JOIN LATERAL (
           SELECT selling_price, cost_price
           FROM product_uom_prices pp
           WHERE pp.product_id = pu.product_id
             AND pp.uom_id = pu.uom_id
             AND pp.active IS TRUE
           ORDER BY pp.updated_at DESC NULLS LAST, pp.created_at DESC
           LIMIT 1
         ) price ON TRUE
         WHERE p.barcode = $1
           AND ${visSql}
         LIMIT 1`,
        trimmed,
        ...(allowedBranchIds.length ? [allowedBranchIds] : []),
      );
      return productRows[0] ?? null;
    });
  }

  private async invalidateCatalog(
    schemaName: string,
    tenantId: string,
    branchIds: string[],
  ) {
    await this.cacheInvalidation.invalidateCatalogForBranches(tenantId, branchIds);
  }

  private collectBarcodesFromDto(
    dto: CreateProductDto | UpdateProductDto,
  ): string[] {
    const codes = new Set<string>();
    const main = (dto.barcode ?? dto.sku)?.trim();
    if (main) codes.add(main);
    return [...codes];
  }

  private async findOwnerSummaryByBarcodeTenantWide(
    tx: Prisma.TransactionClient,
    barcode: string,
    excludeProductId?: string,
    schemaName?: string,
  ): Promise<BarcodeOwnerSummary | null> {
    const trimmed = barcode.trim();
    if (!trimmed) return null;

    const params: unknown[] = [trimmed];
    const excludeProductSql = excludeProductId ? 'AND id <> $2::uuid' : '';
    if (excludeProductId) params.push(excludeProductId);

    this.logBarcodeValidation('search', {
      schemaName,
      barcode: trimmed,
      table: 'products',
      column: 'barcode',
      excludeProductId: excludeProductId ?? null,
    });
    const [productRow] = await tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(
      `SELECT id, name
       FROM products
       WHERE btrim(barcode) = btrim($1::text)
         ${excludeProductSql}
       LIMIT 1`,
      ...params,
    );
    if (productRow) {
      this.logBarcodeValidation('match', {
        schemaName,
        barcode: trimmed,
        table: 'products',
        column: 'barcode',
        matchingRecordId: productRow.id,
        matchingProductId: productRow.id,
        matchingProductName: productRow.name,
      });
      return {
        id: productRow.id,
        name: productRow.name,
        table: 'products',
        recordId: productRow.id,
      };
    }

    this.logBarcodeValidation('no-match', {
      schemaName,
      barcode: trimmed,
      searchedTables: ['products'],
      matchingRecordId: null,
      matchingProductName: null,
    });
    return null;
  }

  private async toBarcodeConflictException(
    schemaName: string,
    error: unknown,
    barcodes?: string | string[] | null,
    itemNo?: string | null,
    excludeProductId?: string,
  ): Promise<never> {
    if (error instanceof ConflictException) throw error;
    if (!this.isUniqueViolation(error)) throw error;

    if (this.isItemNoUniqueViolation(error)) {
      const trimmedItemNo = itemNo?.trim();
      if (trimmedItemNo) {
        const owner = await this.findOwnerSummaryByItemNoTenantWide(
          schemaName,
          trimmedItemNo,
          excludeProductId,
        );
        if (owner) {
          this.logBarcodeValidation('item-no-conflict', {
            schemaName,
            itemNo: trimmedItemNo,
            table: 'products',
            column: 'item_no',
            matchingRecordId: owner.id,
            matchingProductId: owner.id,
            matchingProductName: owner.name,
          });
          throw new ConflictException(
            `Item No "${trimmedItemNo}" is already used by "${owner.name}"`,
          );
        }
        this.logBarcodeValidation('item-no-unique-violation-without-owner', {
          schemaName,
          itemNo: trimmedItemNo,
          table: 'products',
          column: 'item_no',
          errorMessage: this.uniqueViolationText(error),
        });
        throw new ConflictException(
          `Item No "${trimmedItemNo}" is already used by another product`,
        );
      }
      throw new ConflictException(
        'A product with this item number already exists',
      );
    }

    const uniqueText = this.uniqueViolationText(error);
    if (this.isProductUomPriceUniqueViolation(error)) {
      this.logBarcodeValidation('non-barcode-unique-violation', {
        schemaName,
        table: 'product_uom_prices',
        constraint: 'product_uom_prices_active_product_uom_uq',
        errorMessage: uniqueText,
      });
      throw new ConflictException(
        'A product UOM price already exists for this product and UOM',
      );
    }
    if (!this.isProductBarcodeUniqueViolation(error)) throw error;

    const candidates = Array.isArray(barcodes) ? barcodes : [barcodes];
    for (const barcode of candidates) {
      const trimmed = barcode?.trim();
      if (!trimmed) continue;
      const owner = await this.prisma.withTenantSchema(schemaName, (tx) =>
        this.findOwnerSummaryByBarcodeTenantWide(
          tx,
          trimmed,
          excludeProductId,
          schemaName,
        ),
      );
      if (owner) {
        throw new ConflictException(
          `Barcode "${trimmed}" is already used by "${owner.name}"`,
        );
      }
    }

    const firstBarcode = candidates.find((barcode) => barcode?.trim())?.trim();
    if (firstBarcode) {
      this.logBarcodeValidation('unique-violation-without-owner', {
        schemaName,
        barcode: firstBarcode,
        table: 'products',
        constraint: 'products_barcode_unique_not_null',
        errorMessage: uniqueText,
      });
      throw new ConflictException(
        `Barcode "${firstBarcode}" is already used by another product`,
      );
    }
    throw new ConflictException('A product with this barcode already exists');
  }

  private isUniqueViolation(error: unknown): boolean {
    if (isPrismaRawUniqueViolation(error)) return true;
    return isRawQueryUniqueMessage(this.uniqueViolationText(error));
  }

  private uniqueViolationText(error: unknown): string {
    const candidate = error as {
      code?: string;
      meta?: { code?: string; constraint?: string; target?: unknown };
      message?: string;
    };
    return [
      candidate?.code,
      candidate?.meta?.code,
      candidate?.meta?.constraint,
      Array.isArray(candidate?.meta?.target)
        ? candidate.meta.target.join(',')
        : candidate?.meta?.target,
      error instanceof Error ? error.message : String(error),
    ]
      .filter(Boolean)
      .join(' ');
  }

  private isItemNoUniqueViolation(error: unknown): boolean {
    const text = this.uniqueViolationText(error).toLowerCase();
    return (
      text.includes('products_item_no_unique') ||
      (text.includes('item_no') &&
        text.includes('unique') &&
        !text.includes('barcode'))
    );
  }

  private isProductBarcodeUniqueViolation(error: unknown): boolean {
    const text = this.uniqueViolationText(error).toLowerCase();
    return (
      text.includes('products_barcode_unique_not_null') ||
      (text.includes('barcode') &&
        text.includes('unique') &&
        !text.includes('product_uom_barcodes') &&
        !text.includes('product_uom'))
    );
  }

  private isProductUomPriceUniqueViolation(error: unknown): boolean {
    const text = this.uniqueViolationText(error).toLowerCase();
    return (
      text.includes('product_uom_prices_active_product_uom_uq') ||
      (text.includes('product_uom_prices') && text.includes('unique'))
    );
  }

  private async findOwnerSummaryByItemNoTenantWide(
    schemaName: string,
    itemNo: string,
    excludeProductId?: string,
  ): Promise<{ id: string; name: string } | null> {
    const trimmed = itemNo.trim();
    if (!trimmed) return null;

    const params: unknown[] = [trimmed];
    const excludeProductSql = excludeProductId ? 'AND id <> $2::uuid' : '';
    if (excludeProductId) params.push(excludeProductId);

    this.logBarcodeValidation('search', {
      schemaName,
      itemNo: trimmed,
      table: 'products',
      column: 'item_no',
      excludeProductId: excludeProductId ?? null,
    });
    const [productRow] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string; name: string }>>(
        `SELECT id, name
         FROM products
         WHERE btrim(item_no) = btrim($1::text)
           ${excludeProductSql}
         LIMIT 1`,
        ...params,
      ),
    );
    return productRow ?? null;
  }

  async assertBarcodesAvailableForCreate(
    tx: Prisma.TransactionClient,
    schemaName: string,
    dto: CreateProductDto,
  ): Promise<void> {
    for (const barcode of this.collectBarcodesFromDto(dto)) {
      const owner = await this.findOwnerSummaryByBarcodeTenantWide(
        tx,
        barcode,
        undefined,
        schemaName,
      );
      if (owner) {
        this.logBarcodeValidation('create-conflict', {
          schemaName,
          barcode,
          table: owner.table,
          matchingRecordId: owner.recordId,
          matchingProductId: owner.id,
          matchingProductName: owner.name,
        });
        throw new ConflictException(
          `Barcode "${barcode}" is already used by "${owner.name}"`,
        );
      }
    }
  }

  async create(schemaName: string, tenantId: string, dto: CreateProductDto) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    try {
      const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
        await this.assertBarcodesAvailableForCreate(tx, schemaName, dto);
        const initialBaseUnit = this.resolveInitialBaseUnit(dto);
        const baseUomSellingPrice = this.resolveBaseUomSellingPrice(dto);
        const listPrice = dto.listPrice ?? baseUomSellingPrice ?? 0;
        const [created] = await tx.$queryRawUnsafe<ProductRow[]>(
          `INSERT INTO products (branch_id, item_no, name, generic_name, barcode, list_price, strength, formulation, category_id, unit, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11)
           RETURNING ${productSelect.replace(/\s+/g, ' ').trim()}`,
          null,
          dto.itemNo ?? null,
          dto.name,
          dto.genericName ?? null,
          dto.barcode ?? dto.sku ?? null,
          listPrice,
          dto.strength ?? null,
          dto.formulation ?? null,
          dto.categoryId ?? null,
          initialBaseUnit ?? null,
          dto.description ?? null,
        );
        const reorderLevel = dto.reorderLevel ?? 10;
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory (product_id, branch_id, quantity, reorder_level)
           SELECT $1::uuid, b.id, 0, $2
           FROM branches b
           ON CONFLICT (product_id, branch_id) DO NOTHING`,
          created.id,
          reorderLevel,
        );
        await this.uomsService.ensureBaseUomForProductInTx(
          tx,
          created.id,
          initialBaseUnit,
          {
            listPrice: dto.uoms?.length ? undefined : listPrice,
          },
        );
        await this.applyProductUomSetupInTx(tx, created.id, dto.uoms);
        await this.uomsService.syncProductListPriceFromBaseUomInTx(tx, created.id);
        return created;
      });
      const branchIds = await this.allBranchIds(schemaName);
      await this.invalidateCatalog(schemaName, tenantId, branchIds);
      return row;
    } catch (error) {
      await this.toBarcodeConflictException(
        schemaName,
        error,
        this.collectBarcodesFromDto(dto),
        dto.itemNo,
      );
    }
  }

  async update(
    schemaName: string,
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
    allowedBranchIds: string[],
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const barcode = dto.barcode ?? dto.sku;
    if (barcode !== undefined) {
      const trimmedBarcode = barcode?.trim() ?? '';
      if (trimmedBarcode) {
        await this.prisma.withTenantSchema(schemaName, async (tx) => {
          const owner = await this.findOwnerSummaryByBarcodeTenantWide(
            tx,
            trimmedBarcode,
            id,
            schemaName,
          );
          if (owner) {
            throw new ConflictException(
              `Barcode "${trimmedBarcode}" is already used by "${owner.name}"`,
            );
          }
        });
      }
    }

    try {
      const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
        const name = dto.name;
        const genericName = dto.genericName;
        const categoryId = dto.categoryId;
        const strength = dto.strength;
        const formulation = dto.formulation;
        const unit = dto.unit;
        const description = dto.description;
        const skipListPrice = dto.listPrice === undefined;

        const [updated] = await tx.$queryRawUnsafe<ProductRow[]>(
          `UPDATE products SET
           name = CASE WHEN $2::text IS NULL THEN name ELSE $2 END,
           item_no = CASE WHEN $3::text IS NULL THEN item_no ELSE $3 END,
           generic_name = CASE WHEN $4::text IS NULL THEN generic_name ELSE $4 END,
           barcode = CASE WHEN $5::text IS NULL THEN barcode ELSE $5 END,
           list_price = CASE WHEN $6::boolean IS TRUE THEN list_price ELSE $7::numeric END,
           strength = CASE WHEN $8::text IS NULL THEN strength ELSE $8 END,
           formulation = CASE WHEN $9::text IS NULL THEN formulation ELSE $9 END,
           category_id = CASE WHEN $10::uuid IS NULL AND $11::boolean IS FALSE THEN category_id ELSE $10 END,
           unit = CASE WHEN $12::text IS NULL THEN unit ELSE $12 END,
           description = CASE WHEN $13::text IS NULL THEN description ELSE $13 END
         WHERE id = $1
           AND (branch_id IS NULL OR branch_id = ANY($14::uuid[]))
         RETURNING ${productSelect.replace(/\s+/g, ' ').trim()}`,
          id,
          name ?? null,
          dto.itemNo ?? null,
          genericName ?? null,
          barcode ?? null,
          skipListPrice,
          dto.listPrice ?? 0,
          strength ?? null,
          formulation ?? null,
          categoryId ?? null,
          categoryId === null,
          unit ?? null,
          description ?? null,
          allowedBranchIds,
        );
        if (updated) {
          await this.uomsService.syncLegacyUnitForProductInTx(
            tx,
            updated.id,
            this.resolveInitialBaseUnit(dto),
          );
          if (
            Object.prototype.hasOwnProperty.call(dto, 'listPrice')
          ) {
            await this.uomsService.syncBaseUomMetadataForProductInTx(
              tx,
              updated.id,
              {
                listPrice: Object.prototype.hasOwnProperty.call(dto, 'listPrice')
                  ? dto.listPrice ?? null
                  : undefined,
              },
            );
          }
          await this.applyProductUomSetupInTx(tx, updated.id, dto.uoms);
        }
        return updated ?? null;
      });
      await this.invalidateCatalog(schemaName, tenantId, allowedBranchIds);
      return row;
    } catch (error) {
      await this.toBarcodeConflictException(
        schemaName,
        error,
        barcode,
        dto.itemNo,
        id,
      );
    }
  }

  async remove(
    schemaName: string,
    tenantId: string,
    id: string,
    allowedBranchIds: string[],
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const product = await this.findOneInTx(tx, id, allowedBranchIds);
      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const blockers = await this.productDeleteBlockers(tx, id);
      if (blockers.length) {
        throw new ConflictException({
          message: 'Product cannot be deleted safely',
          error: 'PRODUCT_DELETE_BLOCKED',
          blockers,
        });
      }

      await tx.$executeRawUnsafe(
        `DELETE FROM inventory
         WHERE product_id = $1::uuid
           AND COALESCE(quantity, 0) = 0`,
        id,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM batches
         WHERE product_id = $1::uuid
           AND COALESCE(quantity, 0) = 0`,
        id,
      );
      const deletedCount = await tx.$executeRawUnsafe(
        `DELETE FROM products WHERE id = $1 AND (branch_id IS NULL OR branch_id = ANY($2::uuid[]))`,
        id,
        allowedBranchIds,
      );

      if (deletedCount === 0) {
        throw new NotFoundException('Product not found');
      }
    });
    await this.invalidateCatalog(schemaName, tenantId, allowedBranchIds);
    return { deleted: true };
  }

  private async findOneInTx(
    tx: { $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T> },
    id: string,
    allowedBranchIds: string[],
  ): Promise<ProductRow | null> {
    const rows = await tx.$queryRawUnsafe<ProductRow[]>(
      `SELECT ${productSelect.replace(/\s+/g, ' ').trim()}
       FROM products
       WHERE id = $1
         AND (branch_id IS NULL OR branch_id = ANY($2::uuid[]))
       LIMIT 1`,
      id,
      allowedBranchIds,
    );
    return rows[0] ?? null;
  }

  private async productDeleteBlockers(
    tx: { $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T> },
    productId: string,
  ): Promise<ProductDeleteBlocker[]> {
    const [counts] = await tx.$queryRawUnsafe<ProductDeleteDependencyCounts[]>(
      `SELECT
         (SELECT COUNT(*)::int FROM sale_items WHERE product_id = $1::uuid) AS sale_count,
         (SELECT COUNT(*)::int FROM sale_return_items WHERE product_id = $1::uuid) AS sale_return_count,
         (SELECT COUNT(*)::int FROM purchase_items WHERE product_id = $1::uuid) AS purchase_count,
         (SELECT COUNT(*)::int FROM stock_transfer_items WHERE product_id = $1::uuid) AS transfer_count,
         (SELECT COUNT(*)::int FROM opening_stock_entries WHERE product_id = $1::uuid) AS opening_stock_count,
         (SELECT COALESCE(SUM(quantity), 0)::int FROM inventory WHERE product_id = $1::uuid) AS inventory_qty,
         (SELECT COALESCE(SUM(quantity), 0)::int FROM batches WHERE product_id = $1::uuid) AS batch_qty`,
      productId,
    );
    const c = counts ?? {
      sale_count: 0,
      sale_return_count: 0,
      purchase_count: 0,
      transfer_count: 0,
      opening_stock_count: 0,
      inventory_qty: 0,
      batch_qty: 0,
    };
    const blockers: ProductDeleteBlocker[] = [];
    if (Number(c.sale_count) > 0) {
      blockers.push({
        code: 'HAS_SALES',
        message: 'Product has sale history',
        count: Number(c.sale_count),
      });
    }
    if (Number(c.sale_return_count) > 0) {
      blockers.push({
        code: 'HAS_SALE_RETURNS',
        message: 'Product has sale return history',
        count: Number(c.sale_return_count),
      });
    }
    if (Number(c.purchase_count) > 0) {
      blockers.push({
        code: 'HAS_PURCHASES',
        message: 'Product has purchase history',
        count: Number(c.purchase_count),
      });
    }
    if (Number(c.transfer_count) > 0) {
      blockers.push({
        code: 'HAS_TRANSFERS',
        message: 'Product has transfer history',
        count: Number(c.transfer_count),
      });
    }
    if (Number(c.opening_stock_count) > 0) {
      blockers.push({
        code: 'HAS_OPENING_STOCK',
        message:
          'Product has opening stock import records. Reverse opening stock first, then use import cleanup for failed test imports.',
        count: Number(c.opening_stock_count),
      });
    }
    if (Number(c.inventory_qty) !== 0) {
      blockers.push({
        code: 'HAS_INVENTORY_QTY',
        message: 'Product has remaining inventory quantity',
        quantity: Number(c.inventory_qty),
      });
    }
    if (Number(c.batch_qty) !== 0) {
      blockers.push({
        code: 'HAS_BATCH_QTY',
        message: 'Product has remaining batch quantity',
        quantity: Number(c.batch_qty),
      });
    }
    return blockers;
  }

  async listSuppliers(
    schemaName: string,
    productId: string,
    allowedBranchIds: string[],
  ): Promise<ProductSupplierRow[]> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const product = await this.findOneInTx(tx, productId, allowedBranchIds);
      if (!product) throw new NotFoundException('Product not found');
      return tx.$queryRawUnsafe<ProductSupplierRow[]>(
        `SELECT
           ps.id,
           ps.product_id AS "productId",
           ps.supplier_id AS "supplierId",
           s.name AS "supplierName",
           COALESCE(s.supplier_type, 'local') AS "supplierType",
           s.country,
           s.city,
           ps.is_preferred AS "isPreferred",
           ps.last_cost_price AS "lastCostPrice",
           ps.supplier_item_code AS "supplierItemCode",
           ps.created_at AS "createdAt",
           ps.updated_at AS "updatedAt"
         FROM product_suppliers ps
         JOIN suppliers s ON s.id = ps.supplier_id
         WHERE ps.product_id = $1::uuid
         ORDER BY ps.is_preferred DESC, COALESCE(s.name, '') ASC`,
        productId,
      );
    });
  }

  async addSupplier(
    schemaName: string,
    tenantId: string,
    productId: string,
    allowedBranchIds: string[],
    dto: {
      supplierId: string;
      isPreferred?: boolean;
      lastCostPrice?: number | null;
      supplierItemCode?: string | null;
    },
  ): Promise<ProductSupplierRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const product = await this.findOneInTx(tx, productId, allowedBranchIds);
      if (!product) throw new NotFoundException('Product not found');
      await this.assertSupplierExistsInTx(tx, dto.supplierId);

      if (dto.isPreferred === true) {
        await tx.$queryRawUnsafe(
          `UPDATE product_suppliers
           SET is_preferred = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1::uuid`,
          productId,
        );
      }

      const [linked] = await tx.$queryRawUnsafe<ProductSupplierRow[]>(
        `INSERT INTO product_suppliers AS target (
           product_id, supplier_id, is_preferred, last_cost_price, supplier_item_code
         )
         VALUES ($1::uuid, $2::uuid, COALESCE($3::boolean, FALSE), $4::numeric, NULLIF(TRIM($5::text), ''))
         ON CONFLICT (product_id, supplier_id) DO UPDATE
           SET is_preferred = CASE
                 WHEN EXCLUDED.is_preferred THEN TRUE
                 ELSE target.is_preferred
               END,
               last_cost_price = COALESCE(EXCLUDED.last_cost_price, target.last_cost_price),
               supplier_item_code = COALESCE(EXCLUDED.supplier_item_code, target.supplier_item_code),
               updated_at = CURRENT_TIMESTAMP
         RETURNING
           id,
           product_id AS "productId",
           supplier_id AS "supplierId",
           NULL::text AS "supplierName",
           'local'::text AS "supplierType",
           NULL::text AS country,
           NULL::text AS city,
           is_preferred AS "isPreferred",
           last_cost_price AS "lastCostPrice",
           supplier_item_code AS "supplierItemCode",
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        productId,
        dto.supplierId,
        dto.isPreferred ?? false,
        dto.lastCostPrice ?? null,
        dto.supplierItemCode ?? null,
      );

      await tx.$queryRawUnsafe(
        `UPDATE product_suppliers ps
         SET is_preferred = TRUE, updated_at = CURRENT_TIMESTAMP
         WHERE ps.product_id = $1::uuid
           AND ps.supplier_id = $2::uuid
           AND NOT EXISTS (
             SELECT 1
             FROM product_suppliers existing
             WHERE existing.product_id = $1::uuid
               AND existing.is_preferred
           )`,
        productId,
        dto.supplierId,
      );

      const [full] = await this.productSupplierRows(tx, productId, dto.supplierId);
      return full ?? linked;
    });
    await this.invalidateCatalog(schemaName, tenantId, allowedBranchIds);
    return row;
  }

  async updateSupplierLink(
    schemaName: string,
    tenantId: string,
    productId: string,
    supplierId: string,
    allowedBranchIds: string[],
    dto: {
      isPreferred?: boolean;
      lastCostPrice?: number | null;
      supplierItemCode?: string | null;
    },
  ): Promise<ProductSupplierRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const product = await this.findOneInTx(tx, productId, allowedBranchIds);
      if (!product) throw new NotFoundException('Product not found');

      if (dto.isPreferred === true) {
        await tx.$queryRawUnsafe(
          `UPDATE product_suppliers
           SET is_preferred = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE product_id = $1::uuid`,
          productId,
        );
      }

      const hasPreferred = Object.prototype.hasOwnProperty.call(
        dto,
        'isPreferred',
      );
      const hasCost = Object.prototype.hasOwnProperty.call(dto, 'lastCostPrice');
      const hasCode = Object.prototype.hasOwnProperty.call(
        dto,
        'supplierItemCode',
      );
      const [updated] = await tx.$queryRawUnsafe<ProductSupplierRow[]>(
        `UPDATE product_suppliers
         SET is_preferred = CASE WHEN $3::boolean THEN COALESCE($4::boolean, FALSE) ELSE is_preferred END,
             last_cost_price = CASE WHEN $5::boolean THEN $6::numeric ELSE last_cost_price END,
             supplier_item_code = CASE WHEN $7::boolean THEN NULLIF(TRIM($8::text), '') ELSE supplier_item_code END,
             updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1::uuid
           AND supplier_id = $2::uuid
         RETURNING
           id,
           product_id AS "productId",
           supplier_id AS "supplierId",
           NULL::text AS "supplierName",
           'local'::text AS "supplierType",
           NULL::text AS country,
           NULL::text AS city,
           is_preferred AS "isPreferred",
           last_cost_price AS "lastCostPrice",
           supplier_item_code AS "supplierItemCode",
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        productId,
        supplierId,
        hasPreferred,
        dto.isPreferred ?? false,
        hasCost,
        dto.lastCostPrice ?? null,
        hasCode,
        dto.supplierItemCode ?? null,
      );
      if (!updated) throw new NotFoundException('Product supplier not found');
      const [full] = await this.productSupplierRows(tx, productId, supplierId);
      return full ?? updated;
    });
    await this.invalidateCatalog(schemaName, tenantId, allowedBranchIds);
    return row;
  }

  async setPreferredSupplier(
    schemaName: string,
    tenantId: string,
    productId: string,
    supplierId: string,
    allowedBranchIds: string[],
  ): Promise<ProductSupplierRow> {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const row = await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const product = await this.findOneInTx(tx, productId, allowedBranchIds);
      if (!product) throw new NotFoundException('Product not found');
      const [existing] = await this.productSupplierRows(tx, productId, supplierId);
      if (!existing) throw new NotFoundException('Product supplier not found');
      await tx.$queryRawUnsafe(
        `UPDATE product_suppliers
         SET is_preferred = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1::uuid`,
        productId,
      );
      await tx.$queryRawUnsafe(
        `UPDATE product_suppliers
         SET is_preferred = TRUE, updated_at = CURRENT_TIMESTAMP
         WHERE product_id = $1::uuid
           AND supplier_id = $2::uuid`,
        productId,
        supplierId,
      );
      const [full] = await this.productSupplierRows(tx, productId, supplierId);
      return full!;
    });
    await this.invalidateCatalog(schemaName, tenantId, allowedBranchIds);
    return row;
  }

  async removeSupplier(
    schemaName: string,
    tenantId: string,
    productId: string,
    supplierId: string,
    allowedBranchIds: string[],
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const product = await this.findOneInTx(tx, productId, allowedBranchIds);
      if (!product) throw new NotFoundException('Product not found');
      const count = await tx.$executeRawUnsafe(
        `DELETE FROM product_suppliers
         WHERE product_id = $1::uuid
           AND supplier_id = $2::uuid`,
        productId,
        supplierId,
      );
      if (count === 0) throw new NotFoundException('Product supplier not found');
    });
    await this.invalidateCatalog(schemaName, tenantId, allowedBranchIds);
    return { deleted: true };
  }

  private async assertSupplierExistsInTx(
    tx: {
      $queryRawUnsafe: <T = unknown>(
        query: string,
        ...values: unknown[]
      ) => Promise<T>;
    },
    supplierId: string,
  ) {
    const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM suppliers WHERE id = $1::uuid`,
      supplierId,
    );
    if (!row) throw new NotFoundException('Supplier not found');
  }

  private productSupplierRows(
    tx: {
      $queryRawUnsafe: <T = unknown>(
        query: string,
        ...values: unknown[]
      ) => Promise<T>;
    },
    productId: string,
    supplierId?: string,
  ) {
    const supplierFilter = supplierId ? `AND ps.supplier_id = $2::uuid` : '';
    const params = supplierId ? [productId, supplierId] : [productId];
    return tx.$queryRawUnsafe<ProductSupplierRow[]>(
      `SELECT
         ps.id,
         ps.product_id AS "productId",
         ps.supplier_id AS "supplierId",
         s.name AS "supplierName",
         COALESCE(s.supplier_type, 'local') AS "supplierType",
         s.country,
         s.city,
         ps.is_preferred AS "isPreferred",
         ps.last_cost_price AS "lastCostPrice",
         ps.supplier_item_code AS "supplierItemCode",
         ps.created_at AS "createdAt",
         ps.updated_at AS "updatedAt"
       FROM product_suppliers ps
       JOIN suppliers s ON s.id = ps.supplier_id
       WHERE ps.product_id = $1::uuid
         ${supplierFilter}
       ORDER BY ps.is_preferred DESC, COALESCE(s.name, '') ASC`,
      ...params,
    );
  }

  private async allBranchIds(schemaName: string): Promise<string[]> {
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM branches`),
    );
    return rows.map((r) => r.id);
  }
}
