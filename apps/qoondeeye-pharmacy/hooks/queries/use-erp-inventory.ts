"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { erpQueryOptions } from "@/lib/erp-query-options";
import { getInventory } from "@/lib/services/inventory";
import type { InventoryEntry } from "@/lib/services/inventory";

export function useErpInventory(
  tenantSlug: string | null,
  options?: {
    initialData?: InventoryEntry[];
    includeAllBranches?: boolean;
    enabled?: boolean;
  },
) {
  const branchFacet = useErpBranchFacet();
  const includeAll = options?.includeAllBranches ?? false;
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.inventory(tenantSlug ?? "", branchFacet, includeAll),
    queryFn: ({ signal }) =>
      getInventory(tenantSlug!, { signal, includeAllBranches: includeAll }),
    enabled,
    ...erpQueryOptions.static,
    initialData: options?.initialData,
  });
}
