"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { getCustomers } from "@/lib/services/customers";
import type { Customer } from "@/lib/services/customers";

export function useErpCustomers(
  tenantSlug: string | null,
  options?: { initialData?: Customer[]; enabled?: boolean },
) {
  const branchFacet = useErpBranchFacet();
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.customers(tenantSlug ?? "", branchFacet),
    queryFn: ({ signal }) => getCustomers(tenantSlug!, { signal }),
    enabled,
    staleTime: ERP_STALE_STATIC,
    initialData: options?.initialData,
  });
}
