import type { QueryClient } from "@tanstack/react-query";

import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import { posKeys } from "@/lib/pos-query-keys";

/** After a sale: refresh sales list and stock/pricing slices only (not categories). */
export function invalidatePosAfterSale(
  queryClient: QueryClient,
  tenantSlug: string,
): void {
  const facet = getBranchQueryKeyFacet();
  void queryClient.invalidateQueries({
    queryKey: ["pos", "sales", tenantSlug, facet],
  });
  void queryClient.invalidateQueries({
    queryKey: posKeys.catalogProducts(tenantSlug, facet),
  });
  void queryClient.invalidateQueries({
    queryKey: posKeys.catalogBatches(tenantSlug, facet),
  });
}
