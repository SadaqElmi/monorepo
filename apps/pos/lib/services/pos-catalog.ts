import type { PosCatalogData } from "@/lib/pos-catalog-view";

import { POS_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

/** Register catalog: products, batches, and categories in one request. */
export async function getPosRegisterCatalog(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<PosCatalogData> {
  return jsonFetch<PosCatalogData>(`${POS_PREFIX}/register-catalog`, {
    method: "GET",
    tenantSlug,
    signal: init?.signal,
  });
}
