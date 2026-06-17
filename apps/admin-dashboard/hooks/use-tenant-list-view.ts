import { useMemo, useState } from "react";

import { TENANT_VIRTUALIZE_MIN_ROWS } from "@/lib/tenants/constants";
import { type StatusTab, matchesStatusTab } from "@/lib/tenant-status";
import type { Tenant } from "@/lib/services/tenants";

export function useTenantListView(tenants: Tenant[]) {
  const [statusTab, setStatusTab] = useState<StatusTab>("all");

  const filteredTenants = useMemo(() => {
    const filtered = tenants.filter((tenant) =>
      matchesStatusTab(tenant.status, statusTab),
    );
    return filtered.sort((a, b) => {
      const aTime = a.createdAt ?? "";
      const bTime = b.createdAt ?? "";
      if (aTime === bTime) return 0;
      return aTime < bTime ? 1 : -1;
    });
  }, [tenants, statusTab]);

  const useVirtualization =
    filteredTenants.length >= TENANT_VIRTUALIZE_MIN_ROWS;

  return {
    statusTab,
    setStatusTab,
    filteredTenants,
    useVirtualization,
    totalFiltered: filteredTenants.length,
  };
}
