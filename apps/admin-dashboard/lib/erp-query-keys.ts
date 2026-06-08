/** TanStack Query keys for platform admin dashboard. */

export const erpKeys = {
  adminTenants: () => ["erp", "admin", "tenants"] as const,
  adminDomains: (tenantId?: string) =>
    ["erp", "admin", "domains", tenantId ?? ""] as const,
  adminSystemUsers: () => ["erp", "admin", "system-users"] as const,
  adminDashboard: () => ["erp", "admin", "dashboard-overview"] as const,
  adminStaffUsers: () => ["erp", "admin", "staff-users"] as const,
};
