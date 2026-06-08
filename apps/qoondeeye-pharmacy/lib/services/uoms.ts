import type { ProductUom, Uom } from "@repo/types";

import { PRODUCTS_PREFIX, UOMS_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type { ProductUom, Uom };

export async function getUoms(tenantSlug: string): Promise<Uom[]> {
  return jsonFetch<Uom[]>(UOMS_PREFIX, {
    method: "GET",
    tenantSlug,
  });
}

export async function createUom(
  tenantSlug: string,
  input: { code: string; name: string; symbol?: string; active?: boolean },
): Promise<Uom> {
  return jsonFetch<Uom>(UOMS_PREFIX, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateUom(
  tenantSlug: string,
  id: string,
  input: Partial<{ code: string; name: string; symbol: string | null; active: boolean }>,
): Promise<Uom> {
  return jsonFetch<Uom>(`${UOMS_PREFIX}/${id}`, {
    method: "PATCH",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getProductUoms(
  tenantSlug: string,
  productId: string,
): Promise<ProductUom[]> {
  return jsonFetch<ProductUom[]>(
    `${PRODUCTS_PREFIX}/${productId}/uoms`,
    { method: "GET", tenantSlug },
  );
}

export async function upsertProductUom(
  tenantSlug: string,
  productId: string,
  input: {
    uomId: string;
    conversionFactorToBase: number;
    isBase?: boolean;
    isPurchaseDefault?: boolean;
    isSalesDefault?: boolean;
    isPosDefault?: boolean;
    isActive?: boolean;
    sellingPrice?: number | null;
    costPrice?: number | null;
  },
): Promise<ProductUom> {
  return jsonFetch<ProductUom>(`${PRODUCTS_PREFIX}/${productId}/uoms`, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateProductUom(
  tenantSlug: string,
  productId: string,
  productUomId: string,
  input: Partial<{
    conversionFactorToBase: number;
    isBase: boolean;
    isPurchaseDefault: boolean;
    isSalesDefault: boolean;
    isPosDefault: boolean;
    isActive: boolean;
    sellingPrice: number | null;
    costPrice: number | null;
  }>,
): Promise<ProductUom> {
  return jsonFetch<ProductUom>(
    `${PRODUCTS_PREFIX}/${productId}/uoms/${productUomId}`,
    {
      method: "PATCH",
      tenantSlug,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}
