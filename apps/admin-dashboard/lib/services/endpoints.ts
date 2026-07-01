/** Toggle target: comment one block and uncomment the other. */
//export const getBaseUrl = () => {
//  const value = process.env.NEXT_PUBLIC_API_URL_LOCAL?.trim();
//  if (!value) {
//    throw new Error(
//      "NEXT_PUBLIC_API_URL_LOCAL is not set. Configure it in .env.local or your deployment Key Vault.",
//    );
//  }
//  return normalizePublicApiUrl(value);
//};

import { normalizePublicApiUrl } from "@repo/utils";

export const getBaseUrl = () => {
  const value = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Configure it in .env.local or your deployment Key Vault.",
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
