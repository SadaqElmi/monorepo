"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { getCategoriesPaged } from "@/lib/services/categories";

export function useErpCategoriesPaged(
  tenantSlug: string | null,
  page: number,
  limit = 50,
) {
  const branchFacet = useErpBranchFacet();
  const enabled = Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: [...erpKeys.categories(tenantSlug ?? "", branchFacet), "paged", page, limit] as const,
    queryFn: ({ signal }) =>
      getCategoriesPaged(tenantSlug!, { page, limit }, { signal }),
    enabled,
    staleTime: ERP_STALE_LIST,
    placeholderData: (prev) => prev,
  });
}
