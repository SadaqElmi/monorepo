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
  CreateOfferDto,
  OfferRuleDto,
  OffersQueryDto,
  ResolveOfferDto,
  UpdateOfferDto,
} from './dto/offers.dto';

type Tx = Prisma.TransactionClient;

type OfferRow = {
  id: string;
  no: string;
  description: string;
  status: string;
  priceGroupId: string | null;
  priceGroupCode: string | null;
  priority: number;
  validationPeriodId: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  offerType: string;
  discountType: string;
  discountValue: string | number;
  applyTo: string;
  branchScope: string;
  stackingEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type OfferRuleRow = {
  id: string;
  offerId: string;
  productId: string | null;
  productName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  minQuantity: string | number | null;
  buyQuantity: string | number | null;
  getQuantity: string | number | null;
  specialPrice: string | number | null;
  bundleProductIds: unknown;
  createdAt: Date;
};

type ResolveCandidate = OfferRow & {
  ruleId: string | null;
  ruleSpecialPrice: string | number | null;
  resolvedUnitPrice: string | number | null;
};

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async list(schemaName: string, query: OffersQueryDto) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const search = query.search?.trim() || null;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<OfferRow[]>(
        `${this.offerSelect()}
         FROM offer_lists ol
         LEFT JOIN price_groups pg ON pg.id = ol.price_group_id
         WHERE ($1::text IS NULL OR ol.status = $1)
           AND ($2::uuid IS NULL OR ol.price_group_id = $2::uuid)
           AND ($3::text IS NULL
             OR ol.no ILIKE '%' || $3 || '%'
             OR ol.description ILIKE '%' || $3 || '%')
         ORDER BY ol.status ASC, ol.priority DESC, ol.start_date DESC NULLS LAST, ol.no ASC`,
        query.status ?? null,
        query.priceGroupId ?? null,
        search,
      );
      return rows;
    });
  }

  async create(schemaName: string, dto: CreateOfferDto) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const no = dto.no?.trim() || (await this.nextOfferNo(tx));
      const normalized = this.normalizeOffer(dto);
      try {
        const [offer] = await tx.$queryRawUnsafe<{ id: string }[]>(
          `INSERT INTO offer_lists (
             no, description, status, price_group_id, priority,
             validation_period_id, start_date, end_date,
             offer_type, discount_type, discount_value, apply_to,
             branch_scope, stacking_enabled
           )
           VALUES (
             $1, $2, 'disabled', $3::uuid, $4,
             $5, $6::date, $7::date,
             $8, $9, $10::numeric, $11,
             $12, $13
           )
           RETURNING id`,
          no,
          normalized.description,
          normalized.priceGroupId,
          normalized.priority,
          normalized.validationPeriodId,
          normalized.startDate,
          normalized.endDate,
          normalized.offerType,
          normalized.discountType,
          normalized.discountValue,
          normalized.applyTo,
          normalized.branchScope,
          normalized.stackingEnabled,
        );
        await this.replaceRules(tx, offer!.id, dto.rules);
        return this.findOneInTx(tx, offer!.id);
      } catch (e: unknown) {
        if (String(e instanceof Error ? e.message : e).includes('unique')) {
          throw new ConflictException('Offer number already exists');
        }
        throw e;
      }
    });
  }

  async findOne(schemaName: string, id: string) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      this.findOneInTx(tx, id),
    );
  }

  async update(schemaName: string, id: string, dto: UpdateOfferDto) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const normalized = this.normalizeOffer(dto, true);
      try {
        const [offer] = await tx.$queryRawUnsafe<{ id: string }[]>(
          `UPDATE offer_lists SET
             no = CASE WHEN $2::text IS NULL THEN no ELSE $2 END,
             description = CASE WHEN $3::text IS NULL THEN description ELSE $3 END,
             status = CASE WHEN $4::text IS NULL THEN status ELSE $4 END,
             price_group_id = CASE WHEN $5::boolean IS FALSE THEN price_group_id ELSE $6::uuid END,
             priority = CASE WHEN $7::int IS NULL THEN priority ELSE $7 END,
             validation_period_id = CASE WHEN $8::boolean IS FALSE THEN validation_period_id ELSE $9 END,
             start_date = CASE WHEN $10::boolean IS FALSE THEN start_date ELSE $11::date END,
             end_date = CASE WHEN $12::boolean IS FALSE THEN end_date ELSE $13::date END,
             offer_type = CASE WHEN $14::text IS NULL THEN offer_type ELSE $14 END,
             discount_type = CASE WHEN $15::text IS NULL THEN discount_type ELSE $15 END,
             discount_value = CASE WHEN $16::numeric IS NULL THEN discount_value ELSE $16 END,
             apply_to = CASE WHEN $17::text IS NULL THEN apply_to ELSE $17 END,
             branch_scope = CASE WHEN $18::boolean IS FALSE THEN branch_scope ELSE $19 END,
             stacking_enabled = CASE WHEN $20::boolean IS NULL THEN stacking_enabled ELSE $20 END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1::uuid
           RETURNING id`,
          id,
          dto.no?.trim() || null,
          dto.description?.trim() || null,
          dto.status ?? null,
          Object.prototype.hasOwnProperty.call(dto, 'priceGroupId'),
          normalized.priceGroupId,
          dto.priority ?? null,
          Object.prototype.hasOwnProperty.call(dto, 'validationPeriodId'),
          normalized.validationPeriodId,
          Object.prototype.hasOwnProperty.call(dto, 'startDate'),
          normalized.startDate,
          Object.prototype.hasOwnProperty.call(dto, 'endDate'),
          normalized.endDate,
          normalized.offerType,
          normalized.discountType,
          normalized.discountValueOrNull,
          normalized.applyTo,
          Object.prototype.hasOwnProperty.call(dto, 'branchScope'),
          normalized.branchScope,
          normalized.stackingEnabledOrNull,
        );
        if (!offer) {
          throw new NotFoundException('Offer not found');
        }
        if (dto.rules) {
          await this.replaceRules(tx, id, dto.rules);
        }
        return this.findOneInTx(tx, id);
      } catch (e: unknown) {
        if (String(e instanceof Error ? e.message : e).includes('unique')) {
          throw new ConflictException('Offer number already exists');
        }
        throw e;
      }
    });
  }

  async setStatus(schemaName: string, id: string, status: 'enabled' | 'disabled') {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `UPDATE offer_lists
         SET status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
         RETURNING id`,
        id,
        status,
      );
      if (!row) {
        throw new NotFoundException('Offer not found');
      }
      return this.findOneInTx(tx, id);
    });
  }

  async resolve(schemaName: string, dto: ResolveOfferDto) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const priceGroupId = await this.resolvePriceGroupId(tx, dto.priceGroupId);
      const quantity = Number(dto.quantity ?? 1);
      const [candidate] = await tx.$queryRawUnsafe<ResolveCandidate[]>(
        `WITH product_ctx AS (
           SELECT p.id,
                  p.category_id,
                  COALESCE(
                    $5::numeric,
                    pgp.selling_price,
                    pup.selling_price,
                    p.list_price * COALESCE(pu.conversion_factor_to_base, 1)
                  ) AS resolved_unit_price
           FROM products p
           LEFT JOIN LATERAL (
             SELECT pu.uom_id, pu.conversion_factor_to_base
             FROM product_uoms pu
             WHERE pu.product_id = p.id
               AND pu.is_active IS TRUE
               AND ($2::uuid IS NULL OR pu.uom_id = $2::uuid)
             ORDER BY
               CASE WHEN $2::uuid IS NOT NULL THEN 0 ELSE CASE WHEN pu.is_pos_default THEN 0 ELSE 1 END END,
               pu.is_base DESC,
               pu.conversion_factor_to_base ASC
             LIMIT 1
           ) pu ON TRUE
           LEFT JOIN LATERAL (
             SELECT selling_price
             FROM product_price_group_prices
             WHERE product_id = p.id
               AND uom_id = pu.uom_id
               AND price_group_id = $3::uuid
               AND active IS TRUE
             ORDER BY updated_at DESC NULLS LAST, created_at DESC
             LIMIT 1
           ) pgp ON TRUE
           LEFT JOIN LATERAL (
             SELECT selling_price
             FROM product_uom_prices
             WHERE product_id = p.id
               AND uom_id = pu.uom_id
               AND active IS TRUE
             ORDER BY updated_at DESC NULLS LAST, created_at DESC
             LIMIT 1
           ) pup ON TRUE
           WHERE p.id = $1::uuid
           LIMIT 1
         )
         SELECT ol.id,
                ol.no,
                ol.description,
                ol.status,
                ol.price_group_id AS "priceGroupId",
                pg.code AS "priceGroupCode",
                ol.priority,
                ol.validation_period_id AS "validationPeriodId",
                ol.start_date AS "startDate",
                ol.end_date AS "endDate",
                ol.offer_type AS "offerType",
                ol.discount_type AS "discountType",
                ol.discount_value::text AS "discountValue",
                ol.apply_to AS "applyTo",
                ol.branch_scope AS "branchScope",
                ol.stacking_enabled AS "stackingEnabled",
                ol.created_at AS "createdAt",
                ol.updated_at AS "updatedAt",
                rule.id AS "ruleId",
                rule.special_price::text AS "ruleSpecialPrice",
                pc.resolved_unit_price::text AS "resolvedUnitPrice"
         FROM offer_lists ol
         CROSS JOIN product_ctx pc
         LEFT JOIN price_groups pg ON pg.id = ol.price_group_id
         LEFT JOIN LATERAL (
           SELECT r.*
           FROM offer_rules r
           WHERE r.offer_id = ol.id
             AND (r.product_id IS NULL OR r.product_id = $1::uuid)
             AND (r.category_id IS NULL OR r.category_id = pc.category_id)
             AND (r.min_quantity IS NULL OR r.min_quantity <= $6::numeric)
             AND (
               r.product_id IS NOT NULL
               OR r.category_id IS NOT NULL
               OR NOT EXISTS (
                 SELECT 1 FROM offer_rules scoped
                 WHERE scoped.offer_id = ol.id
                   AND (scoped.product_id IS NOT NULL OR scoped.category_id IS NOT NULL)
               )
             )
           ORDER BY
             CASE WHEN r.product_id = $1::uuid THEN 0 ELSE 1 END,
             CASE WHEN r.category_id = pc.category_id THEN 0 ELSE 1 END,
             r.created_at ASC
           LIMIT 1
         ) rule ON TRUE
         WHERE ol.status = 'enabled'
           AND (ol.start_date IS NULL OR ol.start_date <= CURRENT_DATE)
           AND (ol.end_date IS NULL OR ol.end_date >= CURRENT_DATE)
           AND (ol.price_group_id IS NULL OR ol.price_group_id = $3::uuid)
           AND (ol.branch_scope = 'all' OR $4::uuid IS NULL OR POSITION($4::text IN ol.branch_scope) > 0)
           AND (
             rule.id IS NOT NULL
             OR NOT EXISTS (SELECT 1 FROM offer_rules rr WHERE rr.offer_id = ol.id)
           )
         ORDER BY ol.priority DESC, ol.updated_at DESC, ol.created_at DESC
         LIMIT 1`,
        dto.productId,
        dto.uomId ?? null,
        priceGroupId,
        dto.branchId ?? null,
        dto.unitPrice ?? null,
        quantity,
      );
      if (!candidate) {
        return null;
      }
      const unitPrice = Number(candidate.resolvedUnitPrice ?? dto.unitPrice ?? 0);
      const discountValue = Number(candidate.discountValue ?? 0);
      const specialPrice =
        candidate.ruleSpecialPrice !== null && candidate.ruleSpecialPrice !== undefined
          ? Number(candidate.ruleSpecialPrice)
          : discountValue;
      const unitDiscount = this.computeUnitDiscount(
        unitPrice,
        candidate.discountType,
        discountValue,
        specialPrice,
      );
      const finalUnitPrice = Math.max(0, unitPrice - unitDiscount);
      return {
        offerId: candidate.id,
        no: candidate.no,
        description: candidate.description,
        offerType: candidate.offerType,
        discountType: candidate.discountType,
        discountValue,
        priority: candidate.priority,
        priceGroupId: candidate.priceGroupId,
        ruleId: candidate.ruleId,
        unitPrice,
        unitDiscount,
        discountAmount: Math.round((unitDiscount * quantity + Number.EPSILON) * 100) / 100,
        finalUnitPrice: Math.round((finalUnitPrice + Number.EPSILON) * 100) / 100,
        stackingEnabled: candidate.stackingEnabled,
      };
    });
  }

  private offerSelect(): string {
    return `SELECT ol.id,
                   ol.no,
                   ol.description,
                   ol.status,
                   ol.price_group_id AS "priceGroupId",
                   pg.code AS "priceGroupCode",
                   ol.priority,
                   ol.validation_period_id AS "validationPeriodId",
                   ol.start_date AS "startDate",
                   ol.end_date AS "endDate",
                   ol.offer_type AS "offerType",
                   ol.discount_type AS "discountType",
                   ol.discount_value::text AS "discountValue",
                   ol.apply_to AS "applyTo",
                   ol.branch_scope AS "branchScope",
                   ol.stacking_enabled AS "stackingEnabled",
                   ol.created_at AS "createdAt",
                   ol.updated_at AS "updatedAt"`;
  }

  private async findOneInTx(tx: Tx, id: string) {
    const [offer] = await tx.$queryRawUnsafe<OfferRow[]>(
      `${this.offerSelect()}
       FROM offer_lists ol
       LEFT JOIN price_groups pg ON pg.id = ol.price_group_id
       WHERE ol.id = $1::uuid`,
      id,
    );
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    const rules = await tx.$queryRawUnsafe<OfferRuleRow[]>(
      `SELECT r.id,
              r.offer_id AS "offerId",
              r.product_id AS "productId",
              p.name AS "productName",
              r.category_id AS "categoryId",
              c.name AS "categoryName",
              r.min_quantity::text AS "minQuantity",
              r.buy_quantity::text AS "buyQuantity",
              r.get_quantity::text AS "getQuantity",
              r.special_price::text AS "specialPrice",
              r.bundle_product_ids AS "bundleProductIds",
              r.created_at AS "createdAt"
       FROM offer_rules r
       LEFT JOIN products p ON p.id = r.product_id
       LEFT JOIN product_categories c ON c.id = r.category_id
       WHERE r.offer_id = $1::uuid
       ORDER BY r.created_at ASC`,
      id,
    );
    return { ...offer, rules };
  }

  private normalizeOffer(dto: Partial<CreateOfferDto>, partial = false) {
    const offerType = dto.offerType ?? (partial ? undefined : 'percentage');
    const discountType =
      dto.discountType ??
      (offerType === 'special_price'
        ? 'special_price'
        : offerType === 'fixed_amount'
          ? 'fixed_amount'
          : partial
            ? undefined
            : 'percentage');
    const discountValue =
      dto.discountValue === undefined
        ? partial
          ? undefined
          : 0
        : Number(dto.discountValue);
    if (discountValue !== undefined) {
      if (!Number.isFinite(discountValue) || discountValue < 0) {
        throw new BadRequestException('Discount value must be non-negative');
      }
      if (discountType === 'percentage' && discountValue > 100) {
        throw new BadRequestException('Percentage discount cannot exceed 100');
      }
    }
    if (dto.startDate && dto.endDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('Offer end date must be after start date');
    }
    return {
      description: dto.description?.trim() ?? '',
      priceGroupId: dto.priceGroupId ?? null,
      priority: Number(dto.priority ?? 0),
      validationPeriodId: dto.validationPeriodId?.trim() || null,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      offerType,
      discountType,
      discountValue: discountValue ?? 0,
      discountValueOrNull: discountValue ?? null,
      applyTo: dto.applyTo?.trim() || (partial ? undefined : 'product'),
      branchScope:
        dto.branchScope && dto.branchScope.length
          ? dto.branchScope.join(',')
          : partial
            ? null
            : 'all',
      stackingEnabled: dto.stackingEnabled === true,
      stackingEnabledOrNull:
        dto.stackingEnabled === undefined ? null : dto.stackingEnabled === true,
    };
  }

  private async nextOfferNo(tx: Tx): Promise<string> {
    const [row] = await tx.$queryRawUnsafe<{ next_no: string }[]>(
      `SELECT 'OFF-' || LPAD(
         (
           COALESCE(MAX(
             CASE
               WHEN no ~ '^OFF-[0-9]+$' THEN SUBSTRING(no FROM 5)::int
               ELSE NULL
             END
           ), 0) + 1
         )::text,
         5,
         '0'
       ) AS next_no
       FROM offer_lists`,
    );
    return row?.next_no ?? 'OFF-00001';
  }

  private async replaceRules(
    tx: Tx,
    offerId: string,
    rules?: OfferRuleDto[],
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `DELETE FROM offer_rules WHERE offer_id = $1::uuid`,
      offerId,
    );
    const nextRules = rules?.length ? rules : [{}];
    for (const rule of nextRules) {
      if (rule.productId && rule.categoryId) {
        throw new BadRequestException('Offer rule can target product or category, not both');
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO offer_rules (
           offer_id, product_id, category_id,
           min_quantity, buy_quantity, get_quantity,
           special_price, bundle_product_ids
         )
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8::jsonb)`,
        offerId,
        rule.productId ?? null,
        rule.categoryId ?? null,
        rule.minQuantity ?? null,
        rule.buyQuantity ?? null,
        rule.getQuantity ?? null,
        rule.specialPrice ?? null,
        rule.bundleProductIds ? JSON.stringify(rule.bundleProductIds) : null,
      );
    }
  }

  private async resolvePriceGroupId(
    tx: Tx,
    priceGroupId?: string | null,
  ): Promise<string | null> {
    if (priceGroupId) return priceGroupId;
    const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id
       FROM price_groups
       WHERE active IS TRUE AND is_default IS TRUE
       ORDER BY name ASC
       LIMIT 1`,
    );
    return row?.id ?? null;
  }

  private computeUnitDiscount(
    unitPrice: number,
    discountType: string,
    discountValue: number,
    specialPrice: number,
  ): number {
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return 0;
    if (discountType === 'percentage') {
      return Math.min(unitPrice, unitPrice * (discountValue / 100));
    }
    if (discountType === 'fixed_amount') {
      return Math.min(unitPrice, discountValue);
    }
    if (discountType === 'special_price') {
      return Math.max(0, unitPrice - specialPrice);
    }
    return 0;
  }
}
