import type {
  PriceGroup,
  ProductPriceHistory,
} from "@repo/types";

import { PRICE_GROUPS_PREFIX, PRICING_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type { PriceGroup, ProductPriceHistory };

export type PricingProductRow = {
  productId: string;
  itemNo?: string | null;
  productName: string;
  categoryId?: string | null;
  categoryName?: string | null;
  priceGroupId?: string | null;
  priceGroupCode?: string | null;
  priceGroupName?: string | null;
  baseUomId?: string | null;
  baseUom?: string | null;
  currentCostPrice?: number | string | null;
  currentSellingPrice?: number | string | null;
  lastPurchaseCost?: number | string | null;
  lastUpdated?: string | null;
  marginPercent?: number | string | null;
  status?: string | null;
};

export type PagedPricingProducts = {
  items: PricingProductRow[];
  total: number;
  limit: number;
  offset: number;
};

function queryString(params: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      qs.set(key, String(value));
    }
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function getPriceGroups(tenantSlug: string): Promise<PriceGroup[]> {
  return jsonFetch<PriceGroup[]>(PRICE_GROUPS_PREFIX, {
    method: "GET",
    tenantSlug,
  });
}

export async function createPriceGroup(
  tenantSlug: string,
  input: {
    code: string;
    name: string;
    description?: string;
    isDefault?: boolean;
    active?: boolean;
  },
): Promise<PriceGroup> {
  return jsonFetch<PriceGroup>(PRICE_GROUPS_PREFIX, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updatePriceGroup(
  tenantSlug: string,
  id: string,
  input: Partial<{
    code: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    active: boolean;
  }>,
): Promise<PriceGroup> {
  return jsonFetch<PriceGroup>(`${PRICE_GROUPS_PREFIX}/${id}`, {
    method: "PATCH",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getPricingProducts(
  tenantSlug: string,
  params: {
    categoryId?: string;
    supplierId?: string;
    priceGroupId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<PagedPricingProducts> {
  return jsonFetch<PagedPricingProducts>(
    `${PRICING_PREFIX}/products${queryString(params)}`,
    { method: "GET", tenantSlug },
  );
}

export async function updateProductPricing(
  tenantSlug: string,
  productId: string,
  input: {
    priceGroupId?: string;
    uomId?: string;
    costPrice?: number;
    sellingPrice?: number;
    reason?: string;
  },
) {
  return jsonFetch(`${PRICING_PREFIX}/products/${productId}`, {
    method: "PATCH",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function bulkUpdatePricing(
  tenantSlug: string,
  input: {
    categoryId?: string;
    supplierId?: string;
    priceGroupId?: string;
    percentChange: number;
    reason?: string;
  },
) {
  return jsonFetch<{ updated: number; skipped: number; percentChange: number }>(
    `${PRICING_PREFIX}/bulk-update`,
    {
      method: "POST",
      tenantSlug,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function getPricingHistory(
  tenantSlug: string,
  params: {
    productId?: string;
    priceGroupId?: string;
    source?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ items: ProductPriceHistory[]; total: number; limit: number; offset: number }> {
  return jsonFetch(
    `${PRICING_PREFIX}/history${queryString(params)}`,
    { method: "GET", tenantSlug },
  );
}
