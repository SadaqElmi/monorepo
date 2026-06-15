/** TanStack Query keys for platform admin dashboard. */

export const erpKeys = {
  adminTenants: (input?: {
    limit?: number;
    offset?: number;
    search?: string;
  }) => ["erp", "admin", "tenants", input ?? {}] as const,
  adminTenantOwners: (search?: string) =>
    ["erp", "admin", "tenant-owners", search ?? ""] as const,
  adminDomains: (tenantId?: string) =>
    ["erp", "admin", "domains", tenantId ?? ""] as const,
  adminSystemUsers: () => ["erp", "admin", "system-users"] as const,
  adminDashboard: () => ["erp", "admin", "dashboard-overview"] as const,
  adminRetailOps: (tenantId?: string) =>
    ["erp", "admin", "retail-ops", tenantId ?? ""] as const,
  adminAuditLogs: () => ["erp", "admin", "audit-logs"] as const,
};
