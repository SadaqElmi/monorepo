"use client";

import { useQuery } from "@tanstack/react-query";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { listPosDevices } from "@/lib/services/pos-devices";

export function useErpPosDevices(filters?: {
  branchId?: string;
  page?: number;
  limit?: number;
}) {
  const tenantSlug = getResolvedStoredUser()?.tenantSlug ?? "";
  const facet = useErpBranchFacet();
  return useQuery({
    queryKey: ["erp", "pos-devices", tenantSlug, facet, filters ?? {}],
    enabled: Boolean(tenantSlug),
    staleTime: ERP_STALE_LIST,
    queryFn: () => listPosDevices(tenantSlug!, filters),
  });
}
