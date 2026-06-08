/**
 * Centralized API endpoint prefixes for the admin dashboard.
 */

export const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL_LOCAL ?? "http://localhost:5555";

export const API_BASE = getBaseUrl();

export const AUTH_PREFIX = `${API_BASE}/api/auth`;
export const TENANTS_PREFIX = `${API_BASE}/api/tenants`;
export const DOMAINS_PREFIX = `${API_BASE}/api/domains`;
export const STAFF_PREFIX = `${API_BASE}/api/staff`;
export const SYSTEM_USERS_PREFIX = `${API_BASE}/api/system-users`;
