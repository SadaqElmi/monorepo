/**
 * Centralized API endpoint prefixes for the frontend.
 * Frontend requests use same-origin `/api/*` paths.
 */

export const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL_LOCAL ?? "http://localhost:5555";
//process.env.NEXT_PUBLIC_API_URL ?? "https://api.qoondeeye.online";

export const API_BASE = getBaseUrl();

/** Join API host with a path segment (no leading/trailing slashes on segment). */
function apiUrl(pathSegment: string): string {
  const base = API_BASE.replace(/\/$/, "");
  const seg = pathSegment.replace(/^\/+/, "").replace(/\/+$/, "");
  return seg ? `${base}/${seg}` : base;
}

export const AUTH_PREFIX = `${API_BASE}/api/auth`;
export const TENANTS_PREFIX = `${API_BASE}/api/tenants`;
export const DOMAINS_PREFIX = `${API_BASE}/api/domains`;
export const STAFF_PREFIX = `${API_BASE}/api/staff`;
export const SYSTEM_USERS_PREFIX = `${API_BASE}/api/system-users`;
export const CATEGORIES_PREFIX = `${API_BASE}/api/categories`;
export const PRODUCTS_PREFIX = `${API_BASE}/api/products`;
export const BRANCHES_PREFIX = `${API_BASE}/api/branches`;
export const ROLES_PREFIX = `${API_BASE}/api/roles`;
export const INVENTORY_PREFIX = `${API_BASE}/api/inventory`;
export const BATCHES_PREFIX = `${API_BASE}/api/batches`;
export const SUPPLIERS_PREFIX = `${API_BASE}/api/suppliers`;
export const PURCHASES_PREFIX = `${API_BASE}/api/purchases`;
export const SALES_PREFIX = `${API_BASE}/api/sales`;
export const SALE_RETURNS_PREFIX = `${API_BASE}/api/sale-returns`;
export const RETURN_VOUCHERS_PREFIX = `${API_BASE}/api/return-vouchers`;
export const CUSTOMERS_PREFIX = `${API_BASE}/api/customers`;
export const PATIENT_LOANS_PREFIX = `${API_BASE}/api/patient-loans`;
export const ACCOUNTING_PREFIX = `${API_BASE}/api/accounting`;
export const REPORTS_PREFIX = `${API_BASE}/api/reports`;
export const RECONCILIATION_PREFIX = `${API_BASE}/api/reconciliation`;
/** Tamper-evident audit chain (Nest `AuditController`). */
export const AUDIT_PREFIX = `${API_BASE}/api/audit`;
/**
 * Stock transfers (inter-branch). Expects Nest-style JSON: snake_case fields, X-Tenant + optional x-branch-id.
 *
 * If the server returns "Cannot GET /api/transfers", the route is missing or mounted elsewhere—set
 * `NEXT_PUBLIC_TRANSFERS_API_PATH` to match your controller (path only, relative to the app origin),
 * e.g. `api/inventory/transfers`.
 */
export const TRANSFERS_PREFIX = apiUrl(
  process.env.NEXT_PUBLIC_TRANSFERS_API_PATH ?? "api/transfers",
);

/** POS device / shift APIs (cash declaration, Z-report data). */
export const POS_PREFIX = `${API_BASE}/api/pos`;
