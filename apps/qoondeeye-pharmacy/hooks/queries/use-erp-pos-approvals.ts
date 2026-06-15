"use client";

import { useQuery } from "@tanstack/react-query";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { listPendingPosApprovals } from "@/lib/services/pos-approvals";

export function useErpPosApprovals(limit = 50) {
  const tenantSlug = getResolvedStoredUser()?.tenantSlug ?? "";
  return useQuery({
    queryKey: ["erp", "pos-approvals", tenantSlug, limit],
    enabled: Boolean(tenantSlug),
    staleTime: ERP_STALE_LIST,
    refetchInterval: 15000,
    queryFn: () => listPendingPosApprovals(tenantSlug!, limit),
  });
}
