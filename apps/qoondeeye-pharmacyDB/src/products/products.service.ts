import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productSelect = `
           id,
           branch_id AS "branchId",
           name,
           generic_name AS "genericName",
           barcode AS "sku",
           list_price AS "listPrice",
           category_id AS "categoryId",
           strength AS "strength",
           formulation AS "formulation",
           unit,
           description,
           created_at AS "createdAt"`;

/** Same columns as productSelect but from alias `p`, plus joined category name (tenant catalog). */
const productSelectJoined = `
           p.id,
           p.branch_id AS "branchId",
           p.name,
           p.generic_name AS "genericName",
           p.barcode AS "sku",
           p.list_price AS "listPrice",
           p.category_id AS "categoryId",
           p.strength AS "strength",
           p.formulation AS "formulation",
           p.unit,
           p.description,
           p.created_at AS "createdAt",
           c.name AS "categoryName"`;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findAll(schemaName: string, allowedBranchIds: string[]) {
    const vis = this.branchVisibilityClause(allowedBranchIds);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      return tx.$queryRawUnsafe<any[]>(
        `SELECT ${productSelect.replace(/\s+/g, ' ').trim()}
         FROM products
         WHERE ${vis.sql}
         ORDER BY created_at DESC`,
        ...vis.params,
      );
    });
  }

  /** Full tenant catalog: global product visibility for every branch/user. */
  async findAllTenantCatalog(schemaName: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      return tx.$queryRawUnsafe<any[]>(
        `SELECT ${productSelectJoined.replace(/\s+/g, ' ').trim()}
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         ORDER BY p.created_at DESC`,
      );
    });
  }

  /** Transfer catalog scoped to active branch visibility + inventory presence. */
  async findTransferCatalog(schemaName: string, allowedBranchIds: string[]) {
    if (!allowedBranchIds.length) return [];
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      return tx.$queryRawUnsafe<any[]>(
        `SELECT
           ${productSelectJoined.replace(/\s+/g, ' ').trim()},
           COALESCE(SUM(i.quantity), 0)::int AS "availableStock"
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         JOIN inventory i
           ON i.product_id = p.id
          AND i.branch_id = ANY($1::uuid[])
         WHERE (p.branch_id IS NULL OR p.branch_id = ANY($1::uuid[]))
         GROUP BY
           p.id, p.branch_id, p.name, p.generic_name, p.barcode, p.list_price,
           p.category_id, p.strength, p.formulation, p.unit, p.description, p.created_at, c.name
         ORDER BY p.name ASC`,
        allowedBranchIds,
      );
    });
  }

  async findOne(schemaName: string, id: string, allowedBranchIds: string[]) {
    const vis = this.branchVisibilityClause(allowedBranchIds, 2);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
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
  ): Promise<{ matches: unknown[] }> {
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
        const rows = await tx.$queryRawUnsafe<any[]>(
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
      const rows = await tx.$queryRawUnsafe<any[]>(
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
    const vis = this.branchVisibilityClause(allowedBranchIds, 2);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT ${productSelect.replace(/\s+/g, ' ').trim()}
         FROM products
         WHERE barcode = $1
           AND ${vis.sql}`,
        trimmed,
        ...vis.params,
      );
      return rows[0] ?? null;
    });
  }

  async create(schemaName: string, dto: CreateProductDto) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      try {
        const [row] = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO products (branch_id, name, generic_name, barcode, list_price, strength, formulation, category_id, unit, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING ${productSelect.replace(/\s+/g, ' ').trim()}`,
          null,
          dto.name,
          dto.genericName ?? null,
          dto.barcode ?? dto.sku ?? null,
          dto.listPrice ?? 0,
          dto.strength ?? null,
          dto.formulation ?? null,
          dto.categoryId ?? null,
          dto.unit ?? null,
          dto.description ?? null,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory (product_id, branch_id, quantity, reorder_level)
           SELECT $1::uuid, b.id, 0, 10
           FROM branches b
           ON CONFLICT (product_id, branch_id) DO NOTHING`,
          row.id,
        );
        return row;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('products_barcode_unique') || msg.includes('unique')) {
          throw new ConflictException(
            'A product with this barcode already exists',
          );
        }
        throw e;
      }
    });
  }

  async update(
    schemaName: string,
    id: string,
    dto: UpdateProductDto,
    allowedBranchIds: string[],
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const name = dto.name;
      const genericName = dto.genericName;
      const barcode = dto.barcode ?? dto.sku;
      const categoryId = dto.categoryId;
      const strength = dto.strength;
      const formulation = dto.formulation;
      const unit = dto.unit;
      const description = dto.description;
      const skipListPrice = dto.listPrice === undefined;

      try {
        const [row] = await tx.$queryRawUnsafe<any[]>(
          `UPDATE products SET
           name = CASE WHEN $2::text IS NULL THEN name ELSE $2 END,
           generic_name = CASE WHEN $3::text IS NULL THEN generic_name ELSE $3 END,
           barcode = CASE WHEN $4::text IS NULL THEN barcode ELSE $4 END,
           list_price = CASE WHEN $5::boolean IS TRUE THEN list_price ELSE $6::numeric END,
           strength = CASE WHEN $7::text IS NULL THEN strength ELSE $7 END,
           formulation = CASE WHEN $8::text IS NULL THEN formulation ELSE $8 END,
           category_id = CASE WHEN $9::uuid IS NULL AND $10::boolean IS FALSE THEN category_id ELSE $9 END,
           unit = CASE WHEN $11::text IS NULL THEN unit ELSE $11 END,
           description = CASE WHEN $12::text IS NULL THEN description ELSE $12 END
         WHERE id = $1
           AND (branch_id IS NULL OR branch_id = ANY($13::uuid[]))
         RETURNING ${productSelect.replace(/\s+/g, ' ').trim()}`,
          id,
          name ?? null,
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
        return row ?? null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('products_barcode_unique') || msg.includes('unique')) {
          throw new ConflictException(
            'A product with this barcode already exists',
          );
        }
        throw e;
      }
    });
  }

  async remove(schemaName: string, id: string, allowedBranchIds: string[]) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE purchase_items
         SET product_id = NULL
         WHERE product_id = $1`,
        id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE batches
         SET product_id = NULL
         WHERE product_id = $1`,
        id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE inventory
         SET product_id = NULL
         WHERE product_id = $1`,
        id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE sale_items
         SET product_id = NULL
         WHERE product_id = $1`,
        id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE sale_return_items
         SET product_id = NULL
         WHERE product_id = $1`,
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
      return { deleted: true };
    });
  }
}
