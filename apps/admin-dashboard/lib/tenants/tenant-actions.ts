import type { Tenant } from "@/lib/services/tenants";

export function getTenantActionAvailability(tenant: Pick<Tenant, "status">) {
  return {
    canActivate: tenant.status !== "active",
    canSuspend: tenant.status === "active",
    canInactive: tenant.status !== "inactive",
  };
}

export function canRevokePosBinding(bindingStatus: string): boolean {
  return bindingStatus !== "revoked";
}

export function canResetPosBinding(bindingStatus: string): boolean {
  return bindingStatus !== "unbound";
}
