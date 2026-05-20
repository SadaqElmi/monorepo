"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { erpQueryOptions } from "@/lib/erp-query-options";
import { getBranches } from "@/lib/services/branches";
import type { Branch } from "@/lib/services/branches";

export function useErpBranches(
  tenantSlug: string | null,
  options?: { initialData?: Branch[]; enabled?: boolean },
) {
  const branchFacet = useErpBranchFacet();
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.branches(tenantSlug ?? "", branchFacet),
    queryFn: ({ signal }) => getBranches(tenantSlug!, { signal }),
    enabled,
    ...erpQueryOptions.static,
    initialData: options?.initialData,
  });
}
