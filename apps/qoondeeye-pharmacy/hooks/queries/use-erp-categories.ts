"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { getCategories } from "@/lib/services/categories";
import type { Category } from "@repo/types";

export function useErpCategories(
  tenantSlug: string | null,
  options?: { initialData?: Category[]; enabled?: boolean },
) {
  const branchFacet = useErpBranchFacet();
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.categories(tenantSlug ?? "", branchFacet),
    queryFn: ({ signal }) => getCategories(tenantSlug!, { signal }),
    enabled,
    staleTime: ERP_STALE_STATIC,
    initialData: options?.initialData,
  });
}
