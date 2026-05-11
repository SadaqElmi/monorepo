import type { QueryClient } from "@tanstack/react-query";

import { getBatches, getCategories, getProducts, getSalesPaged } from "@/lib/api";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";

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
      queryKey: ["pos", "catalog", tenantSlug, facet],
      queryFn: async ({ signal }) => {
        const slug = tenantSlug;
        const [prods, batchesData, cats] = await Promise.all([
          getProducts(slug, { signal }),
          getBatches(slug, { signal }),
          getCategories(slug, { signal }),
        ]);
        return { prods, batchesData, cats };
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["pos", "sales", tenantSlug, facet, 1, 200],
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
