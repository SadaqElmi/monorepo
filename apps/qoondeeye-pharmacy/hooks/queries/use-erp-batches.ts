"use client";

import { useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { getBatches, type Batch } from "@/lib/services/batches";

export function useErpBatches(
  tenantSlug: string | null,
  options?: { initialData?: Batch[]; enabled?: boolean },
) {
  const branchFacet = useErpBranchFacet();
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.batches(tenantSlug ?? "", branchFacet),
    queryFn: ({ signal }) => getBatches(tenantSlug!, { signal }),
    enabled,
    staleTime: ERP_STALE_STATIC,
    initialData: options?.initialData,
  });
}
