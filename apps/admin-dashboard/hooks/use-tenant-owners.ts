import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getAllTenants } from "@/lib/api";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import type { Tenant } from "@/lib/services/tenants";
import {
  buildTenantOwnerRows,
  filterTenantOwnerRows,
  sortTenantOwnerRows,
  type TenantOwnerRow,
} from "@/lib/tenants/tenant-owners";

export type UseTenantOwnersOptions = {
  initialTenants?: Tenant[] | null;
  serverPrefetched?: boolean;
  search?: string;
  assignment?: "all" | "assigned" | "unassigned";
};

export function useTenantOwners({
  initialTenants = null,
  serverPrefetched = false,
  search = "",
  assignment = "all",
}: UseTenantOwnersOptions = {}) {
  const hasInitialData = Boolean(serverPrefetched && initialTenants);

  const query = useQuery({
    queryKey: erpKeys.adminTenantOwners(),
    queryFn: () => getAllTenants(),
    staleTime: ERP_STALE_LIST,
    initialData: hasInitialData ? initialTenants! : undefined,
    initialDataUpdatedAt: hasInitialData ? Date.now() : undefined,
    refetchOnMount: hasInitialData ? false : undefined,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => {
    const ownerRows = buildTenantOwnerRows(query.data ?? []);
    return sortTenantOwnerRows(
      filterTenantOwnerRows(ownerRows, search, assignment),
    );
  }, [assignment, query.data, search]);

  const stats = useMemo(() => {
    const allRows = buildTenantOwnerRows(query.data ?? []);
    const assigned = allRows.filter((row) => row.hasOwner).length;
    return {
      totalTenants: allRows.length,
      assignedOwners: assigned,
      unassignedTenants: allRows.length - assigned,
    };
  }, [query.data]);

  return {
    tenants: query.data ?? [],
    rows,
    stats,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    loadError: query.error,
    refetch: query.refetch,
  };
}

export type { TenantOwnerRow };
