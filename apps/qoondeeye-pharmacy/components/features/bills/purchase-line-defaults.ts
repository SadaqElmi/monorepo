import type { Product, PurchaseLinePricingRow } from "@/lib/api";
import { getPurchaseLinePricingForProduct } from "@/lib/api";

import type { EditablePurchase } from "./bills-types";

export function parseMoneyField(
  v: number | string | { toString(): string } | null | undefined,
): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && typeof v.toString === "function") {
    const n = Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatPricingDate(
  v: string | Date | null | undefined,
): string {
  if (v == null || v === "") return "";
  const s = typeof v === "string" ? v : v.toISOString();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Normalize API row (snake_case or accidental camelCase). */
export function normalizePricingRow(
  row: PurchaseLinePricingRow | Record<string, unknown> | null | undefined,
): PurchaseLinePricingRow | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;
  const productId = r.product_id ?? r.productId;
  if (!productId) return undefined;
  return {
    product_id: String(productId),
    uom_id: (r.uom_id ?? r.uomId ?? null) as string | null,
    uom_code: (r.uom_code ?? r.uomCode ?? null) as string | null,
    uom_symbol: (r.uom_symbol ?? r.uomSymbol ?? null) as string | null,
    base_uom_id: (r.base_uom_id ?? r.baseUomId ?? null) as string | null,
    base_uom_code: (r.base_uom_code ?? r.baseUomCode ?? null) as string | null,
    base_uom_symbol: (r.base_uom_symbol ?? r.baseUomSymbol ?? null) as
      | string
      | null,
    conversion_factor_to_base: (r.conversion_factor_to_base ??
      r.conversionFactorToBase ??
      1) as PurchaseLinePricingRow["conversion_factor_to_base"],
    cost_price: (r.cost_price ?? r.costPrice) as PurchaseLinePricingRow["cost_price"],
    selling_price: (r.selling_price ?? r.sellingPrice) as PurchaseLinePricingRow["selling_price"],
    cost_price_source: (r.cost_price_source ?? r.costPriceSource ?? null) as
      | string
      | null,
    selling_price_source: (r.selling_price_source ??
      r.sellingPriceSource ??
      null) as string | null,
    batch_number: (r.batch_number ?? r.batchNumber ?? null) as string | null,
    expiry_date: (r.expiry_date ?? r.expiryDate ?? null) as PurchaseLinePricingRow["expiry_date"],
    supplier_id: (r.supplier_id ?? r.supplierId ?? null) as string | null,
    supplier_name: (r.supplier_name ?? r.supplierName ?? null) as string | null,
  };
}

export type ProductLineDefaults = {
  costPrice: number;
  sellingPrice: number;
  batchNumber: string;
  expiryDate: string;
  uomId?: string;
  uomCode?: string | null;
  baseUomId?: string | null;
  baseUomCode?: string | null;
  conversionFactorToBase: number;
  costPriceSource?: string | null;
  sellingPriceSource?: string | null;
};

export function productLineDefaultsFromPricing(
  pricing: PurchaseLinePricingRow | undefined,
  product?: Product | null,
): ProductLineDefaults {
  const row = normalizePricingRow(pricing);
  const cost = parseMoneyField(row?.cost_price) ?? 0;
  const selling =
    parseMoneyField(row?.selling_price) ??
    parseMoneyField(product?.listPrice) ??
    0;
  return {
    costPrice: cost,
    sellingPrice: selling,
    batchNumber: (row?.batch_number ?? "").trim(),
    expiryDate: formatPricingDate(row?.expiry_date),
    uomId: row?.uom_id ?? undefined,
    uomCode: row?.uom_code ?? null,
    baseUomId: row?.base_uom_id ?? null,
    baseUomCode: row?.base_uom_code ?? null,
    conversionFactorToBase: parseMoneyField(row?.conversion_factor_to_base) ?? 1,
    costPriceSource: row?.cost_price_source ?? null,
    sellingPriceSource: row?.selling_price_source ?? null,
  };
}

export function applyProductLineDefaults<
  T extends {
    productId: string;
    costPrice: number;
    sellingPrice: number;
    batchNumber: string;
    expiryDate: string;
    uomId?: string;
    conversionFactorToBase?: number;
  },
>(
  line: T,
  pricing: PurchaseLinePricingRow | undefined,
  product?: Product | null,
): T {
  if (!line.productId) return line;
  const d = productLineDefaultsFromPricing(pricing, product);
  return {
    ...line,
    costPrice: d.costPrice,
    sellingPrice: d.sellingPrice,
    batchNumber: d.batchNumber,
    expiryDate: d.expiryDate,
    uomId: d.uomId ?? line.uomId,
    conversionFactorToBase: d.conversionFactorToBase,
  };
}

export function applyProductDefaultsToEditable(
  prev: EditablePurchase,
  pricing: PurchaseLinePricingRow | undefined,
  product?: Product | null,
): EditablePurchase {
  if (!prev.productId) return prev;
  const d = productLineDefaultsFromPricing(pricing, product);
  return {
    ...prev,
    costPrice: d.costPrice > 0 ? String(d.costPrice) : "",
    sellingPrice: d.sellingPrice > 0 ? String(d.sellingPrice) : "",
    batchNumber: d.batchNumber,
    expiryDate: d.expiryDate,
  };
}

/** Resolve pricing for a product (map first, then live API). */
export async function resolveProductLinePricing(
  tenantSlug: string,
  productId: string,
  options: {
    branchId?: string;
    supplierId?: string;
    uomId?: string;
    cached?: PurchaseLinePricingRow;
  },
): Promise<PurchaseLinePricingRow | undefined> {
  const cached = normalizePricingRow(options.cached);
  const cachedMatchesUom =
    !options.uomId || !cached?.uom_id || cached.uom_id === options.uomId;
  const hasCost = (parseMoneyField(cached?.cost_price) ?? 0) > 0;
  const hasBatch = Boolean(cached?.batch_number?.trim());
  const hasExpiry = Boolean(formatPricingDate(cached?.expiry_date));
  if (cached && cachedMatchesUom && (hasCost || hasBatch || hasExpiry)) {
    return cached;
  }

  try {
    const live = await getPurchaseLinePricingForProduct(tenantSlug, productId, {
      includeAllBranches: true,
      branchId: options.branchId,
      supplierId: options.supplierId,
      uomId: options.uomId,
    });
    return normalizePricingRow(live) ?? cached;
  } catch {
    return cached;
  }
}
