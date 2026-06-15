import type { Tenant } from "@/lib/services/tenants";
import { getTenantDatabaseName } from "@/lib/tenants/database-name";
import { type StatusTab, matchesStatusTab } from "@/lib/tenant-status";

/** Precomputed lowercase search blob per tenant id — O(n) once per list change. */
export type TenantSearchIndex = ReadonlyMap<string, string>;

export function buildTenantSearchIndex(tenants: Tenant[]): TenantSearchIndex {
  const index = new Map<string, string>();
  for (const tenant of tenants) {
    index.set(tenant.id, tenantSearchHaystack(tenant));
  }
  return index;
}

function tenantSearchHaystack(tenant: Tenant): string {
  const parts: string[] = [
    tenant.name,
    tenant.id,
    tenant.schemaName,
    tenant.slug ?? "",
    tenant.ownerName ?? "",
    tenant.ownerEmail ?? "",
    tenant.databaseHealthStatus ?? "",
    getTenantDatabaseName(tenant),
    tenant.migrationStatus ?? "",
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Filter by tab + search, then sort newest-first.
 * O(n) filter + O(k log k) sort where k = filtered count.
 */
export function filterAndSortTenants(
  tenants: Tenant[],
  searchIndex: TenantSearchIndex,
  query: string,
  statusTab: StatusTab,
): Tenant[] {
  const q = query.trim().toLowerCase();
  const filtered: Tenant[] = [];

  for (const tenant of tenants) {
    if (!matchesStatusTab(tenant.status, statusTab)) continue;
    if (q && !searchIndex.get(tenant.id)?.includes(q)) continue;
    filtered.push(tenant);
  }

  filtered.sort((a, b) => {
    const aTime = a.createdAt ?? "";
    const bTime = b.createdAt ?? "";
    if (aTime === bTime) return 0;
    return aTime < bTime ? 1 : -1;
  });

  return filtered;
}

export function paginateTenants<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize));
}
