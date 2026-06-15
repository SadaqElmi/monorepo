import type { TenantStatus } from "./services/tenants";

export const TENANT_STATUSES = [
  "pending_setup",
  "active",
  "suspended",
  "inactive",
  "provisioning_failed",
  "migration_failed",
] as const satisfies readonly TenantStatus[];

export const TENANT_PROVISIONING_STATUSES = [
  "pending_setup",
  "db_created",
  "user_created",
  "migrated",
  "seeded",
  "owner_created",
  "health_checked",
  "active",
  "failed",
] as const;

export type StatusTab =
  | "all"
  | "active"
  | "pending_setup"
  | "suspended"
  | "inactive"
  | "failed"
  | "migration_failed";

export function getTenantStatusLabel(status: string): string {
  switch (status) {
    case "pending_setup":
      return "Pending setup";
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "inactive":
      return "Inactive";
    case "provisioning_failed":
      return "Provisioning failed";
    case "migration_failed":
      return "Migration failed";
    default:
      return status;
  }
}

export function getTenantStatusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "suspended":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "pending_setup":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "inactive":
      return "bg-muted text-muted-foreground";
    case "provisioning_failed":
    case "migration_failed":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function getTenantStatusDotClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500";
    case "suspended":
      return "bg-amber-500";
    case "pending_setup":
      return "bg-blue-500";
    case "inactive":
      return "bg-slate-400";
    case "provisioning_failed":
    case "migration_failed":
      return "bg-destructive";
    default:
      return "bg-slate-400";
  }
}

export function matchesStatusTab(
  status: string,
  tab: StatusTab,
): boolean {
  if (tab === "all") return true;
  if (tab === "failed") {
    return status === "migration_failed" || status === "provisioning_failed";
  }
  return status === tab;
}

export function getProvisioningStatusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isTenantProvisioning(status: string): boolean {
  return status === "pending_setup";
}

export function tenantListNeedsPolling(tenants: { status: string }[]): boolean {
  return tenants.some((t) => isTenantProvisioning(t.status));
}

export function isTenantSelectableForDomain(status: string): boolean {
  return status === "active" || status === "suspended";
}
