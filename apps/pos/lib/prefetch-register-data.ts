import type { QueryClient } from "@tanstack/react-query";

import { getSalesPaged } from "@/lib/api";
import { fetchPosCatalog } from "@/hooks/use-pos-catalog";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import { posKeys, POS_STALE_CATALOG, POS_STALE_SALES } from "@/lib/pos-query-keys";

const inflight = new Set<string>();

/**
 * Warm catalog + first page of sales for the register (call after staff login
 * or when navigating toward `/`).
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
      queryKey: posKeys.catalog(tenantSlug, facet),
      staleTime: POS_STALE_CATALOG,
      queryFn: ({ signal }) => fetchPosCatalog(tenantSlug, signal),
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
