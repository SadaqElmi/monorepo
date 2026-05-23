import { buildPagedQuery, unwrapListResponse } from "@repo/utils";
import type { PagedList, Product } from "@repo/types";

import { PRODUCTS_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type { Product };

export async function getProducts(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Product[]> {
  const data = await jsonFetch<Product[] | PagedList<Product>>(PRODUCTS_PREFIX, {
    method: "GET",
    tenantSlug,
    signal: init?.signal,
  });
  return unwrapListResponse(data).items;
}

export async function getProductsPaged(
  tenantSlug: string,
  params: { page: number; limit?: number },
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<Product>> {
  const q = buildPagedQuery({
    page: params.page,
    limit: params.limit ?? 50,
  });
  const data = await jsonFetch<Product[] | PagedList<Product>>(
    `${PRODUCTS_PREFIX}${q}`,
    { method: "GET", tenantSlug, signal: init?.signal },
  );
  return unwrapListResponse(data, params.page, params.limit ?? 50);
}

/** Full tenant product list (all branches + global). Use for purchases and stock. */
export async function getProductsCatalog(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Product[]> {
  const data = await jsonFetch<Product[] | PagedList<Product>>(
    `${PRODUCTS_PREFIX}/catalog`,
    { method: "GET", tenantSlug, signal: init?.signal },
  );
  return unwrapListResponse(data).items;
}

/** Transfer product list scoped to active branch + inventory rows. */
export async function getTransferProducts(tenantSlug: string): Promise<Product[]> {
  const data = await jsonFetch<Product[] | PagedList<Product>>(
    `${PRODUCTS_PREFIX}/transfer-catalog`,
    { method: "GET", tenantSlug },
  );
  return unwrapListResponse(data).items;
}

/** Barcode / SKU lookup; throws if not found. */
export async function getProductByBarcode(
  tenantSlug: string,
  barcode: string,
): Promise<Product> {
  const b = encodeURIComponent(barcode.trim());
  return jsonFetch<Product>(`${PRODUCTS_PREFIX}/barcode/${b}`, {
    method: "GET",
    tenantSlug,
  });
}

export async function getProductLookup(
  tenantSlug: string,
  q: string,
): Promise<{ matches: Product[] }> {
  const query = encodeURIComponent(q.trim());
  return jsonFetch<{ matches: Product[] }>(
    `${PRODUCTS_PREFIX}/lookup?q=${query}`,
    { method: "GET", tenantSlug },
  );
}

export async function createProduct(
  tenantSlug: string,
  input: {
    name: string;
    genericName?: string;
    sku?: string;
    barcode?: string;
    listPrice?: number;
    catalogWide?: boolean;
    categoryId?: string;
    strength?: string;
    formulation?: string;
    unit?: string;
    description?: string;
  },
) {
  return jsonFetch<Product>(PRODUCTS_PREFIX, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateProduct(
  tenantSlug: string,
  id: string,
  input: {
    name?: string;
    genericName?: string;
    sku?: string;
    listPrice?: number | null;
    categoryId?: string | null;
    strength?: string;
    formulation?: string;
    unit?: string;
    description?: string;
  },
) {
  return jsonFetch<Product>(`${PRODUCTS_PREFIX}/${id}`, {
    method: "PATCH",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteProduct(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${PRODUCTS_PREFIX}/${id}`, {
    method: "DELETE",
    tenantSlug,
  });
}

