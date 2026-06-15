import type { QueryClient } from "@tanstack/react-query";

import type { Tenant, TenantListResult } from "@/lib/services/tenants";

/** Merge a tenant into paginated list caches without a network round-trip. */
export function upsertTenantInCache(
  queryClient: QueryClient,
  tenant: Tenant,
): void {
  queryClient.setQueriesData<TenantListResult>(
    { queryKey: ["erp", "admin", "tenants"] },
    (old) => {
      if (!old?.items?.length) return old;
      const index = old.items.findIndex((row) => row.id === tenant.id);
      if (index === -1) {
        return {
          ...old,
          items: [tenant, ...old.items],
          total: old.total + 1,
        };
      }
      const items = old.items.slice();
      items[index] = tenant;
      return { ...old, items };
    },
  );
}
