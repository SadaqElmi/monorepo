import { normalizePublicApiUrl } from "@repo/utils";

/** Deployed environments set NEXT_PUBLIC_API_URL; local dev may use NEXT_PUBLIC_API_URL_LOCAL instead. */
export const getBaseUrl = () => {
  const value =
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL_LOCAL?.trim();
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_API_URL (or NEXT_PUBLIC_API_URL_LOCAL for local dev) is not set. Configure it in .env.local or your deployment Key Vault.",
    );
  }
  return normalizePublicApiUrl(value);
};

export const API_BASE = getBaseUrl();

export const AUTH_PREFIX = `${API_BASE}/api/auth`;
export const TENANTS_PREFIX = `${API_BASE}/api/admin/tenants`;
export const ADMIN_AUDIT_LOGS_PREFIX = `${API_BASE}/api/admin/audit-logs`;
export const DOMAINS_PREFIX = `${API_BASE}/api/domains`;
export const SYSTEM_USERS_PREFIX = `${API_BASE}/api/system-users`;
