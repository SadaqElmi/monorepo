"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { erpQueryOptions } from "@/lib/erp-query-options";
import { getProducts } from "@/lib/services/products";
import type { Product } from "@repo/types";

export function useErpProducts(
  tenantSlug: string | null,
  options?: { initialData?: Product[]; enabled?: boolean },
) {
  const branchFacet = useErpBranchFacet();
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.products(tenantSlug ?? "", branchFacet),
    queryFn: ({ signal }) => getProducts(tenantSlug!, { signal }),
    enabled,
    ...erpQueryOptions.static,
    initialData: options?.initialData,
  });
}
