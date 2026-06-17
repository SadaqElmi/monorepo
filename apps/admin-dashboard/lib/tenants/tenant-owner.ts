import type { Tenant } from "@/lib/services/tenants";

export function tenantMissingOwner(
  tenant: Pick<Tenant, "ownerEmail" | "hasDatabaseUrl">,
): boolean {
  return tenant.hasDatabaseUrl && !tenant.ownerEmail?.trim();
}
