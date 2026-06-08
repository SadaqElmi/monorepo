import "server-only";

import { cache } from "react";

import type { Batch } from "@repo/types";
import type { Category } from "@repo/types";
import type { PagedList } from "@repo/types";
import type { Product } from "@repo/types";
import type { Sale } from "@repo/types";

import { appendReportBranchQuery } from "@/lib/accounting-report-query";
import {
  parseImportCenterSearchParams,
  type ImportCenterPageData,
} from "@/lib/import-center";
import type {
  ImportCenterDashboard,
  ImportCenterFiltersQuery,
  ImportCenterJobListItem,
  ImportJobListItem,
  ImportType,
  ImportJobStatus,
} from "@/lib/services/imports";

export type { ImportCenterPageData } from "@/lib/import-center";
import { sanitizeBranchIdForQuery } from "@/lib/branch-scope";
import {
  ACCOUNTING_PREFIX,
  BATCHES_PREFIX,
  BRANCHES_PREFIX,
  CATEGORIES_PREFIX,
  CUSTOMERS_PREFIX,
  DOMAINS_PREFIX,
  INVENTORY_PREFIX,
  PRODUCTS_PREFIX,
  PURCHASES_PREFIX,
  POS_PREFIX,
  RECONCILIATION_PREFIX,
  REPORTS_PREFIX,
  ROLES_PREFIX,
  SALES_PREFIX,
  STAFF_PREFIX,
  SUPPLIERS_PREFIX,
  SYSTEM_USERS_PREFIX,
  TENANTS_PREFIX,
  TRANSFERS_PREFIX,
  IMPORTS_PREFIX,
} from "@/lib/services/endpoints";
import {
  serverJsonFetch,
  serverJsonFetchWithSession,
  serverPlatformJsonFetch,
} from "@/lib/services/server-http";
import {
  filterOperationalBranches,
  type Branch,
} from "@/lib/services/branches";
import type { StaffMember } from "@/lib/services/staff";
import type { Role } from "@/lib/services/roles";
import type { Customer } from "@/lib/services/customers";
import type { Supplier } from "@/lib/services/suppliers";
import type { Purchase } from "@/lib/services/purchases";
import type { Tenant } from "@/lib/services/tenants";
import type { Domain } from "@/lib/services/domains";
import type { SystemUser } from "@/lib/services/system-users";
import type {
  TransferDto,
  TransferEventDto,
} from "@/lib/services/transfers";
import type { InventoryEntry } from "@/lib/services/inventory";
import type {
  InventoryHistoryListQuery,
  InventoryHistoryRow,
} from "@/lib/services/inventory-history";
import type {
  ChartOfAccountRow,
  ChartAccountRow,
  JournalEntryRow,
  JournalLineFlatRow,
  JournalAuditResult,
  AuditLogRow,
  CustomerPaymentRow,
  SupplierPaymentRow,
  PaymentTermRow,
  FollowUpLevelRow,
  IncomeStatementResult,
  BalanceSheetResult,
  ReportEnvelope,
  InventoryValuationResult,
  DashboardSeriesPoint,
  TopProductsResult,
  ExecutiveSummaryResult,
} from "@/lib/services/accounting";
import type {
  LatestRunResponse,
  LogsResponse,
} from "@/lib/services/reconciliation";
import type { PosSessionCurrentResponse } from "@/lib/services/pos-sessions";

export { serverJsonFetch, serverJsonFetchWithSession, serverPlatformJsonFetch };

const cachedTenantGet = cache(
  async <T>(tenantSlug: string, url: string, init?: RequestInit): Promise<T> =>
    serverJsonFetch<T>(url, { tenantSlug, ...init }),
);

/** --- List / read endpoints (mirror `lib/api` client services) --- */

export async function getBranchesServer(
  tenantSlug: string,
): Promise<Branch[]> {
  const rows = await cachedTenantGet<Branch[]>(tenantSlug, BRANCHES_PREFIX);
  return filterOperationalBranches(rows);
}

export async function getProductsServer(
  tenantSlug: string,
): Promise<Product[]> {
  return cachedTenantGet<Product[]>(tenantSlug, PRODUCTS_PREFIX);
}

export async function getProductsCatalogServer(
  tenantSlug: string,
): Promise<Product[]> {
  return cachedTenantGet<Product[]>(tenantSlug, `${PRODUCTS_PREFIX}/catalog`);
}

export async function getTransferProductsServer(
  tenantSlug: string,
): Promise<Product[]> {
  return serverJsonFetch<Product[]>(`${PRODUCTS_PREFIX}/transfer-catalog`, {
    tenantSlug,
  });
}

export async function getCategoriesServer(
  tenantSlug: string,
): Promise<Category[]> {
  return cachedTenantGet<Category[]>(tenantSlug, CATEGORIES_PREFIX);
}

export async function getInventoryServer(
  tenantSlug: string,
  opts?: { includeAllBranches?: boolean },
): Promise<InventoryEntry[]> {
  const headers: Record<string, string> = {};
  if (opts?.includeAllBranches) {
    headers["x-branch-id"] = "all";
  }
  const cacheKey = opts?.includeAllBranches ? `${INVENTORY_PREFIX}?all=1` : INVENTORY_PREFIX;
  return cachedTenantGet<InventoryEntry[]>(tenantSlug, cacheKey, { headers });
}

export async function getBatchesServer(
  tenantSlug: string,
): Promise<Batch[]> {
  return serverJsonFetch<Batch[]>(BATCHES_PREFIX, { tenantSlug });
}

export async function getCustomersServer(
  tenantSlug: string,
): Promise<Customer[]> {
  return cachedTenantGet<Customer[]>(tenantSlug, CUSTOMERS_PREFIX);
}

export async function getSalesServer(
  tenantSlug: string,
): Promise<Sale[]> {
  return serverJsonFetch<Sale[]>(SALES_PREFIX, { tenantSlug });
}

export async function getPurchasesServerRaw(
  tenantSlug: string,
): Promise<Purchase[]> {
  return serverJsonFetch<Purchase[]>(PURCHASES_PREFIX, { tenantSlug });
}

export async function getSuppliersServer(
  tenantSlug: string,
): Promise<Supplier[]> {
  return serverJsonFetch<Supplier[]>(SUPPLIERS_PREFIX, { tenantSlug });
}

export async function getStaffServer(
  tenantSlug: string,
): Promise<StaffMember[]> {
  return serverJsonFetch<StaffMember[]>(STAFF_PREFIX, { tenantSlug });
}

export async function getRolesServer(tenantSlug: string): Promise<Role[]> {
  return serverJsonFetch<Role[]>(ROLES_PREFIX, { tenantSlug });
}

export async function getTenantsServer(): Promise<Tenant[]> {
  return serverPlatformJsonFetch<Tenant[]>(TENANTS_PREFIX, { method: "GET" });
}

export async function getDomainsServer(
  input?: { tenantId?: string },
): Promise<Domain[]> {
  const qs = input?.tenantId
    ? `?tenantId=${encodeURIComponent(input.tenantId)}`
    : "";
  return serverPlatformJsonFetch<Domain[]>(`${DOMAINS_PREFIX}${qs}`, {
    method: "GET",
  });
}

export async function getSystemUsersServer(): Promise<SystemUser[]> {
  return serverPlatformJsonFetch<SystemUser[]>(SYSTEM_USERS_PREFIX, {
    method: "GET",
  });
}

export async function getChartOfAccountsServer(
  tenantSlug: string,
  branchId?: string,
): Promise<ChartOfAccountRow[]> {
  const b = sanitizeBranchIdForQuery(branchId);
  const q = b ? `?branchId=${encodeURIComponent(b)}` : "";
  return serverJsonFetch<ChartOfAccountRow[]>(
    `${ACCOUNTING_PREFIX}/chart-of-accounts${q}`,
    { tenantSlug },
  );
}

export async function getAccountsServer(
  tenantSlug: string,
  branchId?: string,
): Promise<ChartAccountRow[]> {
  const b = sanitizeBranchIdForQuery(branchId);
  const q = b ? `?branchId=${encodeURIComponent(b)}` : "";
  return serverJsonFetch<ChartAccountRow[]>(
    `${ACCOUNTING_PREFIX}/accounts${q}`,
    { tenantSlug },
  );
}

export async function getJournalEntriesServer(
  tenantSlug: string,
  branchId?: string,
  limit = 100,
  opts?: { sourceType?: string; from?: string; to?: string },
): Promise<JournalEntryRow[]> {
  const q = new URLSearchParams();
  const jb = sanitizeBranchIdForQuery(branchId);
  if (jb) q.set("branchId", jb);
  q.set("limit", String(limit));
  if (opts?.sourceType) q.set("sourceType", opts.sourceType);
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  return serverJsonFetch<JournalEntryRow[]>(
    `${ACCOUNTING_PREFIX}/journal-entries?${q}`,
    { tenantSlug },
  );
}

export async function getJournalLinesServer(
  tenantSlug: string,
  branchId: string,
  opts?: { from?: string; to?: string; limit?: number; accountKey?: string },
): Promise<JournalLineFlatRow[]> {
  const q = new URLSearchParams({ branchId });
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.accountKey) q.set("accountKey", opts.accountKey);
  return serverJsonFetch<JournalLineFlatRow[]>(
    `${ACCOUNTING_PREFIX}/journal-lines?${q}`,
    { tenantSlug },
  );
}

export async function getJournalAuditServer(
  tenantSlug: string,
  branchId: string,
  asOf: string,
): Promise<JournalAuditResult> {
  const q = new URLSearchParams({ branchId, asOf });
  return serverJsonFetch<JournalAuditResult>(
    `${ACCOUNTING_PREFIX}/journal-audit?${q}`,
    { tenantSlug },
  );
}

export async function getAuditTrailPagedServer(
  tenantSlug: string,
  branchId: string,
  page: number,
  limit: number,
): Promise<PagedList<AuditLogRow>> {
  const q = new URLSearchParams({
    branchId,
    page: String(Math.max(1, page)),
    limit: String(Math.min(500, Math.max(1, limit))),
  });
  return serverJsonFetch<PagedList<AuditLogRow>>(
    `${ACCOUNTING_PREFIX}/audit-trail?${q}`,
    { tenantSlug },
  );
}

export async function getSupplierPaymentsServer(
  tenantSlug: string,
  branchId: string,
  limit = 50,
): Promise<SupplierPaymentRow[]> {
  const q = new URLSearchParams({
    branchId,
    limit: String(limit),
  });
  return serverJsonFetch<SupplierPaymentRow[]>(
    `${ACCOUNTING_PREFIX}/supplier-payments?${q}`,
    { tenantSlug },
  );
}

export async function getCustomerPaymentsServer(
  tenantSlug: string,
  branchId: string,
  limit = 50,
): Promise<CustomerPaymentRow[]> {
  const q = new URLSearchParams({
    branchId,
    limit: String(limit),
  });
  return serverJsonFetch<CustomerPaymentRow[]>(
    `${ACCOUNTING_PREFIX}/customer-payments?${q}`,
    { tenantSlug },
  );
}

export async function getPaymentTermsServer(
  tenantSlug: string,
  branchId: string,
): Promise<PaymentTermRow[]> {
  const q = new URLSearchParams({ branchId });
  return serverJsonFetch<PaymentTermRow[]>(
    `${ACCOUNTING_PREFIX}/payment-terms?${q}`,
    { tenantSlug },
  );
}

export async function getFollowUpLevelsServer(
  tenantSlug: string,
  branchId: string,
): Promise<FollowUpLevelRow[]> {
  const q = new URLSearchParams({ branchId });
  return serverJsonFetch<FollowUpLevelRow[]>(
    `${ACCOUNTING_PREFIX}/follow-up-levels?${q}`,
    { tenantSlug },
  );
}

export async function getIncomeStatementServer(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<ReportEnvelope<IncomeStatementResult>> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return serverJsonFetch<ReportEnvelope<IncomeStatementResult>>(
    `${REPORTS_PREFIX}/income-statement?${q}`,
    { tenantSlug },
  );
}

export async function getBalanceSheetServerSimple(
  tenantSlug: string,
  asOf: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<ReportEnvelope<BalanceSheetResult>> {
  const q = new URLSearchParams({ asOf });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return serverJsonFetch<ReportEnvelope<BalanceSheetResult>>(
    `${REPORTS_PREFIX}/balance-sheet?${q}`,
    { tenantSlug },
  );
}

export async function getInventoryValuationServer(
  tenantSlug: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<InventoryValuationResult> {
  const q = new URLSearchParams();
  appendReportBranchQuery(q, branchId, aggregateAll);
  return serverJsonFetch<InventoryValuationResult>(
    `${REPORTS_PREFIX}/inventory-valuation?${q}`,
    { tenantSlug },
  );
}

export async function getDashboardSeriesServer(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<DashboardSeriesPoint[]> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return serverJsonFetch<DashboardSeriesPoint[]>(
    `${REPORTS_PREFIX}/dashboard-series?${q}`,
    { tenantSlug },
  );
}

export async function getTopProductsServer(
  tenantSlug: string,
  from: string,
  to: string,
  branchId: string | undefined,
  limit: number,
  sort: "revenue" | "quantity",
  aggregateAll?: boolean,
): Promise<TopProductsResult> {
  const q = new URLSearchParams({
    from,
    to,
    limit: String(limit),
    sort,
  });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return serverJsonFetch(
    `${REPORTS_PREFIX}/top-products?${q}`,
    { tenantSlug },
  );
}

export async function getTransferServer(
  tenantSlug: string,
  id: string,
): Promise<TransferDto> {
  return serverJsonFetch<TransferDto>(
    `${TRANSFERS_PREFIX}/${encodeURIComponent(id)}`,
    { tenantSlug },
  );
}

export async function getTransferEventsServer(
  tenantSlug: string,
  id: string,
): Promise<TransferEventDto[]> {
  const raw = await serverJsonFetch<unknown>(
    `${TRANSFERS_PREFIX}/${encodeURIComponent(id)}/events`,
    { tenantSlug },
  );
  if (Array.isArray(raw)) return raw as TransferEventDto[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as TransferEventDto[];
    if (Array.isArray(o.events)) return o.events as TransferEventDto[];
  }
  return [];
}

export async function getLatestReconciliationRunServer(
  tenantSlug: string,
): Promise<LatestRunResponse> {
  return serverJsonFetch<LatestRunResponse>(
    `${RECONCILIATION_PREFIX}/runs/latest`,
    { tenantSlug },
  );
}

export async function getReconciliationLogsServer(
  tenantSlug: string,
  opts?: {
    runId?: string;
    severity?: string;
    type?: string;
    limit?: number;
    offset?: number;
    page?: number;
  },
): Promise<LogsResponse> {
  const q = new URLSearchParams();
  if (opts?.runId) q.set("runId", opts.runId);
  if (opts?.severity) q.set("severity", opts.severity);
  if (opts?.type) q.set("type", opts.type);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.offset != null) q.set("offset", String(opts.offset));
  if (opts?.page != null) q.set("page", String(opts.page));
  const qs = q.toString();
  return serverJsonFetch<LogsResponse>(
    `${RECONCILIATION_PREFIX}/logs${qs ? `?${qs}` : ""}`,
    { tenantSlug },
  );
}

export async function getCurrentPosSessionServer(
  tenantSlug: string,
): Promise<PosSessionCurrentResponse> {
  return serverJsonFetch<PosSessionCurrentResponse>(
    `${POS_PREFIX}/sessions/current`,
    { tenantSlug },
  );
}

export async function getInventoryHistoryPagedServer(
  tenantSlug: string,
  query: InventoryHistoryListQuery,
): Promise<PagedList<InventoryHistoryRow>> {
  const p = new URLSearchParams();
  p.set("page", String(Math.max(1, query.page)));
  p.set("limit", String(Math.max(1, query.limit)));
  if (query.branch_id?.trim()) p.set("branch_id", query.branch_id.trim());
  if (query.product_id?.trim()) p.set("product_id", query.product_id.trim());
  if (query.action_type?.trim()) p.set("action_type", query.action_type.trim());
  if (query.start_date?.trim()) p.set("start_date", query.start_date.trim());
  if (query.end_date?.trim()) p.set("end_date", query.end_date.trim());
  if (query.search?.trim()) p.set("search", query.search.trim());
  const s = p.toString();
  return serverJsonFetch<PagedList<InventoryHistoryRow>>(
    `${INVENTORY_PREFIX}/history${s ? `?${s}` : ""}`,
    { tenantSlug },
  );
}

export async function getExecutiveSummaryServerSimple(
  tenantSlug: string,
  from: string,
  to: string,
  branchId?: string,
  aggregateAll?: boolean,
): Promise<ExecutiveSummaryResult> {
  const q = new URLSearchParams({ from, to });
  appendReportBranchQuery(q, branchId, aggregateAll);
  return serverJsonFetch(
    `${REPORTS_PREFIX}/executive-summary?${q}`,
    { tenantSlug },
  );
}

export async function getAuditTrailServerSimple(
  tenantSlug: string,
  branchId: string,
  limit = 8,
): Promise<AuditLogRow[]> {
  const q = new URLSearchParams({
    branchId,
    limit: String(Math.min(500, Math.max(1, limit))),
  });
  return serverJsonFetch<AuditLogRow[]>(
    `${ACCOUNTING_PREFIX}/audit-trail?${q}`,
    { tenantSlug },
  );
}

function importCenterFilterQs(
  filters: ImportCenterFiltersQuery,
): string {
  const q = new URLSearchParams();
  if (filters.importType) q.set("importType", filters.importType);
  if (filters.status) q.set("status", filters.status);
  if (filters.from) q.set("from", filters.from);
  if (filters.to) q.set("to", filters.to);
  if (filters.createdBy) q.set("createdBy", filters.createdBy);
  if (filters.limit != null) q.set("limit", String(filters.limit));
  if (filters.offset != null) q.set("offset", String(filters.offset));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function getImportCenterDashboardServer(
  tenantSlug: string,
  filters: Omit<ImportCenterFiltersQuery, "limit" | "offset" | "status"> = {},
): Promise<ImportCenterDashboard> {
  return serverJsonFetch<ImportCenterDashboard>(
    `${IMPORTS_PREFIX}/center/dashboard${importCenterFilterQs(filters)}`,
    { tenantSlug, cacheMode: "report" },
  );
}

export async function listImportCenterJobsServer(
  tenantSlug: string,
  filters: ImportCenterFiltersQuery,
): Promise<{ jobs: ImportCenterJobListItem[]; total: number }> {
  return serverJsonFetch<{ jobs: ImportCenterJobListItem[]; total: number }>(
    `${IMPORTS_PREFIX}/center/jobs${importCenterFilterQs(filters)}`,
    { tenantSlug, cacheMode: "report" },
  );
}

export async function listImportCenterFailedServer(
  tenantSlug: string,
  limit = 10,
): Promise<{ jobs: ImportJobListItem[]; total: number }> {
  const q = new URLSearchParams({ limit: String(limit), offset: "0" });
  return serverJsonFetch<{ jobs: ImportJobListItem[]; total: number }>(
    `${IMPORTS_PREFIX}/center/failed?${q}`,
    { tenantSlug, cacheMode: "report" },
  );
}

export function importCenterFiltersFromSearchParams(
  raw: Record<string, string | string[] | undefined>,
): ImportCenterFiltersQuery {
  const p = parseImportCenterSearchParams(raw);
  return {
    importType: p.importType as ImportType | undefined,
    status: p.status as ImportJobStatus | undefined,
    from: p.from,
    to: p.to,
    createdBy: p.createdBy,
    limit: p.limit,
    offset: p.offset,
  };
}

export async function loadImportCenterPageData(
  tenantSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<ImportCenterPageData> {
  const filters = importCenterFiltersFromSearchParams(searchParams);
  const pageNum = Math.max(
    1,
    Number(
      typeof searchParams.page === "string"
        ? searchParams.page
        : Array.isArray(searchParams.page)
          ? searchParams.page[0]
          : 1,
    ) || 1,
  );
  const pageSize = 25;
  const listFilters: ImportCenterFiltersQuery = {
    ...filters,
    limit: pageSize,
    offset: (pageNum - 1) * pageSize,
  };
  const dashFilters = {
    importType: filters.importType,
    from: filters.from,
    to: filters.to,
    createdBy: filters.createdBy,
  };
  const [dashboard, jobs, failed] = await Promise.all([
    getImportCenterDashboardServer(tenantSlug, dashFilters),
    listImportCenterJobsServer(tenantSlug, listFilters),
    listImportCenterFailedServer(tenantSlug, 10),
  ]);
  return {
    dashboard,
    jobs,
    failed,
    filters: listFilters,
    pageNum,
    pageSize,
  };
}
