import { PRODUCTS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type { Product } from "@repo/types";

export type { Product };

export async function getProducts(tenantSlug: string): Promise<Product[]> {
  return jsonFetch<Product[]>(PRODUCTS_PREFIX, {
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
