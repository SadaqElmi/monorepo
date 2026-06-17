import type { Tenant } from "@/lib/services/tenants";

export function getTenantDatabaseName(
  tenant: Pick<Tenant, "databaseName" | "slug" | "schemaName">,
): string {
  const configured = tenant.databaseName?.trim();
  if (configured) return configured;

  const slug = (tenant.slug ?? tenant.schemaName).trim().toLowerCase();
  return slug ? `tenant_${slug}_db` : "—";
}

export function formatDatabaseHealthStatus(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase();
  if (!normalized || normalized === "unknown") return "Unknown";
  if (normalized === "connected") return "Connected";
  if (normalized === "failed") return "Failed";
  if (normalized === "not_configured") return "Not configured";
  if (normalized === "not_checked") return "Not checked";
  return status ?? "Unknown";
}
