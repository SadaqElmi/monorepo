import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { getTenants } from "@/lib/api";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { TENANT_PAGE_SIZE, TENANT_POLL_INTERVAL_MS } from "@/lib/tenants/constants";
import { tenantListNeedsPolling } from "@/lib/tenant-status";
import type { TenantListResult } from "@/lib/services/tenants";

export type UseAdminTenantsOptions = {
  initialData?: TenantListResult | null;
  serverPrefetched?: boolean;
  page?: number;
  pageSize?: number;
  search?: string;
};

export function useAdminTenants({
  initialData = null,
  serverPrefetched = false,
  page = 1,
  pageSize = TENANT_PAGE_SIZE,
  search = "",
}: UseAdminTenantsOptions = {}) {
  const queryClient = useQueryClient();
  const offset = (page - 1) * pageSize;
  const trimmedSearch = search.trim();
  const listInput = useMemo(
    () => ({
      limit: pageSize,
      offset,
      search: trimmedSearch || undefined,
    }),
    [pageSize, offset, trimmedSearch],
  );
  const hasInitialData = Boolean(serverPrefetched && initialData);

  const query = useQuery({
    queryKey: erpKeys.adminTenants(listInput),
    queryFn: () => getTenants(listInput),
    staleTime: ERP_STALE_LIST,
    initialData: hasInitialData ? initialData! : undefined,
    initialDataUpdatedAt: hasInitialData ? Date.now() : undefined,
    refetchOnMount: hasInitialData ? false : undefined,
    refetchOnWindowFocus: false,
  });

  const tenants = query.data?.items ?? [];
  const serverTotal = query.data?.total ?? 0;
  const provisioningPollActive = tenantListNeedsPolling(tenants);

  useEffect(() => {
    if (!provisioningPollActive) return;

    const poll = () => {
      void queryClient.refetchQueries({
        queryKey: erpKeys.adminTenants(listInput),
        exact: true,
      });
    };

    const timer = window.setInterval(poll, TENANT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [provisioningPollActive, queryClient, listInput]);

  return {
    tenants,
    serverTotal,
    provisioningPollActive,
    isLoading: query.isLoading,
    loadError: query.error,
  };
}
