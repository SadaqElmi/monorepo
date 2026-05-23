import type { QueryClient } from "@tanstack/react-query";

import { getBatches, getCategories, getProducts, getSalesPaged } from "@/lib/api";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import { posKeys, POS_STALE_CATALOG, POS_STALE_SALES } from "@/lib/pos-query-keys";

const inflight = new Set<string>();

/**
 * Warm catalog slices + first page of sales for the register (call after staff login).
 */
export function prefetchPosRegisterData(
  queryClient: QueryClient,
  tenantSlug: string,
): void {
  if (typeof window === "undefined") return;
  const facet = getBranchQueryKeyFacet();
  if (!facet) return;
  const key = `${tenantSlug}|${facet}`;
  if (inflight.has(key)) return;
  inflight.add(key);

  void Promise.all([
    queryClient.prefetchQuery({
      queryKey: posKeys.catalogProducts(tenantSlug, facet),
      staleTime: POS_STALE_CATALOG,
      queryFn: ({ signal }) => getProducts(tenantSlug, { signal }),
    }),
    queryClient.prefetchQuery({
      queryKey: posKeys.catalogBatches(tenantSlug, facet),
      staleTime: POS_STALE_CATALOG,
      queryFn: ({ signal }) => getBatches(tenantSlug, { signal }),
    }),
    queryClient.prefetchQuery({
      queryKey: posKeys.catalogCategories(tenantSlug, facet),
      staleTime: POS_STALE_CATALOG,
      queryFn: ({ signal }) => getCategories(tenantSlug, { signal }),
    }),
    queryClient.prefetchQuery({
      queryKey: posKeys.sales(tenantSlug, facet, 1, 200),
      staleTime: POS_STALE_SALES,
      queryFn: async ({ signal }) => {
        const res = await getSalesPaged(tenantSlug, 1, 200, { signal });
        return res.items;
      },
    }),
  ])
    .catch(() => {
      /* prefetch best-effort */
    })
    .finally(() => {
      inflight.delete(key);
    });
}
