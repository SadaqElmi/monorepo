"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import {
  getPosGlobalAudit,
  type PosGlobalAuditItem,
} from "@/lib/services/pos-terminals";

export type PosGlobalAuditQuery = {
  page?: number;
  limit?: number;
  deviceId?: string;
  action?: string;
  from?: string;
  to?: string;
};

export function useErpPosGlobalAudit(
  tenantSlug: string | null,
  query: PosGlobalAuditQuery,
) {
  const branchFacet = useErpBranchFacet();

  return useQuery({
    queryKey: erpKeys.posGlobalAudit(tenantSlug ?? "", branchFacet, query),
    queryFn: ({ signal }) =>
      getPosGlobalAudit(tenantSlug!, { ...query, signal }),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_LIST,
    placeholderData: keepPreviousData,
  });
}

export type { PosGlobalAuditItem };
