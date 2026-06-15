"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import {
  getPosTerminal,
  getPosTerminals,
  type PosTerminalListQuery,
} from "@/lib/services/pos-terminals";

export function useErpPosTerminals(
  tenantSlug: string | null,
  query: PosTerminalListQuery,
) {
  const branchFacet = useErpBranchFacet();
  const enabled = Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.posTerminals(tenantSlug ?? "", branchFacet, query),
    queryFn: ({ signal }) =>
      getPosTerminals(tenantSlug!, { ...query, signal }),
    enabled,
    staleTime: ERP_STALE_LIST,
    placeholderData: keepPreviousData,
  });
}

export function useErpPosTerminal(
  tenantSlug: string | null,
  terminalId: string | null,
) {
  const enabled = Boolean(tenantSlug && terminalId);

  return useQuery({
    queryKey: erpKeys.posTerminal(tenantSlug ?? "", terminalId ?? ""),
    queryFn: ({ signal }) =>
      getPosTerminal(tenantSlug!, terminalId!, { signal }),
    enabled,
    staleTime: ERP_STALE_LIST,
  });
}
