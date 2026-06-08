import type { ProductUom, Uom } from "@/lib/api";

import type { FormUomDraft, ProductUomDraft } from "./products-types";

export function buildInitialFormUomByCode(
  uoms: Uom[],
): Record<string, FormUomDraft> {
  const defaultBase = uoms.find((u) => u.code === "PCS") ?? uoms[0];
  const map: Record<string, FormUomDraft> = {};
  for (const uom of uoms) {
    const isDefaultBase = uom.code === defaultBase?.code;
    map[uom.code] = {
      code: uom.code,
      enabled: isDefaultBase,
      conversionFactorToBase: "1",
      isBase: isDefaultBase,
      isPurchaseDefault: isDefaultBase,
      isSalesDefault: isDefaultBase,
      isPosDefault: isDefaultBase,
      sellingPrice: "",
    };
  }
  return map;
}

export function calculateUomCostFromBase(
  baseCost: number | string | null | undefined,
  factor: number | string | null | undefined,
): number | null {
  const base = Number(baseCost);
  const f = Number(factor ?? 1);
  if (!Number.isFinite(base) || !Number.isFinite(f) || f <= 0) return null;
  return Math.round((base * f + Number.EPSILON) * 10000) / 10000;
}

export function formatCalculatedUomCost(
  baseCost: number | string | null | undefined,
  factor: number | string | null | undefined,
): string {
  const value = calculateUomCostFromBase(baseCost, factor);
  if (value == null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function getEnabledFormUoms(
  map: Record<string, FormUomDraft>,
): FormUomDraft[] {
  return Object.values(map).filter((row) => row.enabled && row.code.trim());
}

export function priceToFormString(
  value: number | string | null | undefined,
): string {
  if (value == null || value === "") return "";
  return String(value);
}

export function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export function productUomDraftFromRow(row: ProductUom): ProductUomDraft {
  return {
    uomId: row.uomId,
    conversionFactorToBase: String(row.conversionFactorToBase ?? "1"),
    isBase: row.isBase,
    isPurchaseDefault: row.isPurchaseDefault,
    isSalesDefault: row.isSalesDefault,
    isPosDefault: row.isPosDefault,
    isActive: row.isActive,
    sellingPrice: row.sellingPrice == null ? "" : String(row.sellingPrice),
  };
}
