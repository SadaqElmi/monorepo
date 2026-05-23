import { unwrapListResponse } from "@repo/utils";
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
