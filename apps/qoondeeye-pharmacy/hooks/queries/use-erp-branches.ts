"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { erpQueryOptions } from "@/lib/erp-query-options";
import { getBranches, getConfigurationBranches } from "@/lib/services/branches";
import type { Branch } from "@/lib/services/branches";

export function useErpBranches(
  tenantSlug: string | null,
  options?: {
    initialData?: Branch[];
    enabled?: boolean;
    /** Load all branches for configuration forms (staff, POS terminals). */
    configuration?: boolean;
  },
) {
  const branchFacet = useErpBranchFacet();
  const forConfiguration = options?.configuration === true;
  const enabled =
    options?.enabled !== false &&
    Boolean(tenantSlug && (forConfiguration || branchFacet));

  return useQuery({
    queryKey: [
      ...erpKeys.branches(tenantSlug ?? "", branchFacet),
      forConfiguration ? "configuration" : "default",
    ],
    queryFn: ({ signal }) =>
      forConfiguration
        ? getConfigurationBranches(tenantSlug!, { signal })
        : getBranches(tenantSlug!, { signal }),
    enabled,
    ...erpQueryOptions.static,
    initialData: options?.initialData,
  });
}
