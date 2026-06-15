"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import {
  listPosShifts,
  type PosShiftListQuery,
} from "@/lib/services/pos-sessions";

export function useErpPosShifts(
  tenantSlug: string | null,
  query: PosShiftListQuery,
) {
  const branchFacet = useErpBranchFacet();

  return useQuery({
    queryKey: erpKeys.posShifts(tenantSlug ?? "", branchFacet, query),
    queryFn: ({ signal }) =>
      listPosShifts(tenantSlug!, { ...query, signal }),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_LIST,
    placeholderData: keepPreviousData,
  });
}
