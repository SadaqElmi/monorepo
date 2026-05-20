"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { getProductsCatalog } from "@/lib/services/products";
import type { Product } from "@repo/types";

export function useErpProductsCatalog(
  tenantSlug: string | null,
  options?: { initialData?: Product[]; enabled?: boolean },
) {
  const branchFacet = useErpBranchFacet();
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.productsCatalog(tenantSlug ?? "", branchFacet),
    queryFn: ({ signal }) => getProductsCatalog(tenantSlug!, { signal }),
    enabled,
    staleTime: ERP_STALE_STATIC,
    initialData: options?.initialData,
  });
}
