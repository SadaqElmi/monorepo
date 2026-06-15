/**
 * Centralized API endpoint prefixes for the admin dashboard.
 */

export const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL_LOCAL ?? "http://localhost:5555";

//process.env.NEXT_PUBLIC_API_URL ??
//"https://backendserver-production-0793.up.railway.app";
export const API_BASE = getBaseUrl();

export const AUTH_PREFIX = `${API_BASE}/api/auth`;
export const TENANTS_PREFIX = `${API_BASE}/api/admin/tenants`;
export const ADMIN_AUDIT_LOGS_PREFIX = `${API_BASE}/api/admin/audit-logs`;
export const DOMAINS_PREFIX = `${API_BASE}/api/domains`;
export const SYSTEM_USERS_PREFIX = `${API_BASE}/api/system-users`;
