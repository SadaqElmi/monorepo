/** TanStack Query keys for ERP (qoondeeye-pharmacy). */

export const erpKeys = {
  branches: (tenant: string, facet: string) =>
    ["erp", "branches", tenant, facet] as const,
  productsCatalog: (tenant: string, facet: string) =>
    ["erp", "products-catalog", tenant, facet] as const,
  products: (tenant: string, facet: string) =>
    ["erp", "products", tenant, facet] as const,
  categories: (tenant: string, facet: string) =>
    ["erp", "categories", tenant, facet] as const,
  inventory: (tenant: string, facet: string, includeAll?: boolean) =>
    ["erp", "inventory", tenant, facet, includeAll ? "all" : "branch"] as const,
  customers: (tenant: string, facet: string) =>
    ["erp", "customers", tenant, facet] as const,
  suppliers: (tenant: string, facet: string) =>
    ["erp", "suppliers", tenant, facet] as const,
  roles: (tenant: string, facet: string) =>
    ["erp", "roles", tenant, facet] as const,
  batches: (tenant: string, facet: string) =>
    ["erp", "batches", tenant, facet] as const,
  returns: (tenant: string, facet: string) =>
    ["erp", "returns", tenant, facet] as const,
  staff: (tenant: string, facet: string) =>
    ["erp", "staff", tenant, facet] as const,
  chartOfAccounts: (tenant: string, facet: string, branchId?: string) =>
    ["erp", "chart-of-accounts", tenant, facet, branchId ?? ""] as const,
  journalEntries: (
    tenant: string,
    facet: string,
    branchId: string | undefined,
    limit: number,
  ) =>
    ["erp", "journal-entries", tenant, facet, branchId ?? "", limit] as const,
  journalLines: (
    tenant: string,
    facet: string,
    branchId: string,
    params: unknown,
  ) => ["erp", "journal-lines", tenant, facet, branchId, params] as const,
  journalAudit: (
    tenant: string,
    facet: string,
    branchId: string,
    asOf: string,
  ) => ["erp", "journal-audit", tenant, facet, branchId, asOf] as const,
  supplierPayments: (
    tenant: string,
    facet: string,
    branchId: string,
    limit: number,
  ) =>
    ["erp", "supplier-payments", tenant, facet, branchId, limit] as const,
  customerPayments: (
    tenant: string,
    facet: string,
    branchId: string,
    limit: number,
  ) =>
    ["erp", "customer-payments", tenant, facet, branchId, limit] as const,
  paymentTerms: (tenant: string, facet: string, branchId: string) =>
    ["erp", "payment-terms", tenant, facet, branchId] as const,
  followUpLevels: (tenant: string, facet: string, branchId: string) =>
    ["erp", "follow-up-levels", tenant, facet, branchId] as const,
  accountingJournals: (tenant: string, facet: string, branchId: string) =>
    ["erp", "accounting-journals", tenant, facet, branchId] as const,
  transferMonitoring: (tenant: string, facet: string) =>
    ["erp", "transfer-monitoring", tenant, facet] as const,
  controlCenter: (tenant: string, facet: string, params: unknown) =>
    ["erp", "control-center", tenant, facet, params] as const,
  posSession: (tenant: string, facet: string, branchId: string) =>
    ["erp", "pos-session", tenant, facet, branchId] as const,
  posStatement: (tenant: string, facet: string, sessionId: string) =>
    ["erp", "pos-statement", tenant, facet, sessionId] as const,
  adminTenants: () => ["erp", "admin", "tenants"] as const,
  adminDomains: (tenantId?: string) =>
    ["erp", "admin", "domains", tenantId ?? ""] as const,
  adminSystemUsers: () => ["erp", "admin", "system-users"] as const,
  adminDashboard: () => ["erp", "admin", "dashboard-overview"] as const,
  adminStaffUsers: () => ["erp", "admin", "staff-users"] as const,
  dashboardBundle: (tenant: string, facet: string) =>
    ["erp", "dashboard", "bundle", tenant, facet] as const,
  dashboardSeries: (
    tenant: string,
    facet: string,
    from: string,
    to: string,
    branchId: string,
    aggregateAll: boolean,
  ) =>
    [
      "erp",
      "dashboard",
      "series",
      tenant,
      facet,
      from,
      to,
      branchId,
      aggregateAll,
    ] as const,
  dashboardTopProducts: (
    tenant: string,
    facet: string,
    from: string,
    to: string,
    branchId: string,
    limit: number,
    sortBy: string,
    aggregateAll: boolean,
  ) =>
    [
      "erp",
      "dashboard",
      "top-products",
      tenant,
      facet,
      from,
      to,
      branchId,
      limit,
      sortBy,
      aggregateAll,
    ] as const,
  transfersStatusCounts: (
    tenant: string,
    facet: string,
    branchFilter: string,
  ) =>
    [
      "erp",
      "transfers",
      "status-counts",
      tenant,
      facet,
      branchFilter,
    ] as const,
  transfersList: (
    tenant: string,
    facet: string,
    page: number,
    pageSize: number,
    statusFilter: string,
    branchFilter: string,
  ) =>
    [
      "erp",
      "transfers",
      "list",
      tenant,
      facet,
      page,
      pageSize,
      statusFilter,
      branchFilter,
    ] as const,
  transfersIncoming: (tenant: string, facet: string) =>
    ["erp", "transfers", "incoming", tenant, facet] as const,
  inventoryHistory: (
    tenant: string,
    facet: string,
    page: number,
    pageSize: number,
    filtersKey: unknown,
  ) =>
    [
      "erp",
      "inventory-history",
      tenant,
      facet,
      page,
      pageSize,
      filtersKey,
    ] as const,
  reconciliation: (
    tenant: string,
    branchId: string,
    facet: string,
    aggregateAll: boolean,
    severityFilter: string,
    typeFilter: string,
    logsPage: number,
    pageSize: number,
  ) =>
    [
      "erp",
      "reconciliation",
      tenant,
      branchId,
      facet,
      aggregateAll,
      severityFilter,
      typeFilter,
      logsPage,
      pageSize,
    ] as const,
  auditTrail: (
    tenant: string,
    facet: string,
    page: number,
    pageSize: number,
    filtersKey: unknown,
  ) =>
    ["erp", "audit-trail", tenant, facet, page, pageSize, filtersKey] as const,
  transferDetail: (tenant: string, facet: string, transferId: string) =>
    ["erp", "transfer", tenant, facet, transferId] as const,
  report: (
    reportId: string,
    tenant: string,
    facet: string,
    params: unknown,
  ) => ["erp", "reports", reportId, tenant, facet, params] as const,
} as const;
