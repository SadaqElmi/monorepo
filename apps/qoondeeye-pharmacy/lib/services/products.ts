import { PRODUCTS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type { Product } from "@repo/types";

export type { Product };

export async function getProducts(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Product[]> {
  return jsonFetch<Product[]>(PRODUCTS_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}

/** Full tenant product list (all branches + global). Use for purchases and stock. */
export async function getProductsCatalog(tenantSlug: string): Promise<Product[]> {
  return jsonFetch<Product[]>(`${PRODUCTS_PREFIX}/catalog`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

/** Transfer product list scoped to active branch + inventory rows. */
export async function getTransferProducts(tenantSlug: string): Promise<Product[]> {
  return jsonFetch<Product[]>(`${PRODUCTS_PREFIX}/transfer-catalog`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

/** Barcode / SKU lookup; throws if not found. */
export async function getProductByBarcode(
  tenantSlug: string,
  barcode: string,
): Promise<Product> {
  const b = encodeURIComponent(barcode.trim());
  return jsonFetch<Product>(`${PRODUCTS_PREFIX}/barcode/${b}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getProductLookup(
  tenantSlug: string,
  q: string,
): Promise<{ matches: Product[] }> {
  const query = encodeURIComponent(q.trim());
  return jsonFetch<{ matches: Product[] }>(
    `${PRODUCTS_PREFIX}/lookup?q=${query}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
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
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
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
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteProduct(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${PRODUCTS_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

