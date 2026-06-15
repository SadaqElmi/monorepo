import type { Tenant } from "@/lib/services/tenants";

export type TenantOwnerRow = {
  id: string;
  ownerName: string | null;
  ownerEmail: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string | null;
  tenantStatus: string;
  lastLoginAt: string | null;
  hasOwner: boolean;
};

export function tenantToOwnerRow(tenant: Tenant): TenantOwnerRow {
  const ownerEmail = tenant.ownerEmail?.trim() || null;
  const ownerName = tenant.ownerName?.trim() || null;

  return {
    id: `${tenant.id}:${ownerEmail ?? "unassigned"}`,
    ownerName,
    ownerEmail,
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug ?? null,
    tenantStatus: tenant.status,
    lastLoginAt: tenant.lastLoginAt ?? null,
    hasOwner: Boolean(ownerEmail),
  };
}

export function buildTenantOwnerRows(tenants: Tenant[]): TenantOwnerRow[] {
  return tenants.map(tenantToOwnerRow);
}

export function filterTenantOwnerRows(
  rows: TenantOwnerRow[],
  query: string,
  assignment: "all" | "assigned" | "unassigned",
): TenantOwnerRow[] {
  const q = query.trim().toLowerCase();

  return rows.filter((row) => {
    if (assignment === "assigned" && !row.hasOwner) return false;
    if (assignment === "unassigned" && row.hasOwner) return false;
    if (!q) return true;

    const haystack = [
      row.ownerName,
      row.ownerEmail,
      row.tenantName,
      row.tenantSlug,
      row.tenantStatus,
      row.tenantId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });
}

export function sortTenantOwnerRows(rows: TenantOwnerRow[]): TenantOwnerRow[] {
  return [...rows].sort((a, b) => {
    const ownerA = (a.ownerEmail ?? a.ownerName ?? "zzz").toLowerCase();
    const ownerB = (b.ownerEmail ?? b.ownerName ?? "zzz").toLowerCase();
    if (ownerA !== ownerB) return ownerA.localeCompare(ownerB);
    return a.tenantName.localeCompare(b.tenantName);
  });
}
