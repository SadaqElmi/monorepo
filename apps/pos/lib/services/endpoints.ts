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

/** Join API host with a path segment (no leading/trailing slashes on segment)cls. */
function apiUrl(pathSegment: string): string {
  const base = API_BASE.replace(/\/$/, "");
  const seg = pathSegment.replace(/^\/+/, "").replace(/\/+$/, "");
  return seg ? `${base}/${seg}` : base;
}

export const AUTH_PREFIX = `${API_BASE}/api/auth`;
export const POS_SETUP_PATH = `${AUTH_PREFIX}/pos/setup`;
export const POS_DEVICE_STATUS_PATH = `${AUTH_PREFIX}/pos/device-status`;
export const CATEGORIES_PREFIX = `${API_BASE}/api/categories`;
export const PRODUCTS_PREFIX = `${API_BASE}/api/products`;
export const BATCHES_PREFIX = `${API_BASE}/api/batches`;
export const SALES_PREFIX = `${API_BASE}/api/sales`;
export const BRANCHES_PREFIX = `${API_BASE}/api/branches`;
export const RETURN_VOUCHERS_PREFIX = `${API_BASE}/api/return-vouchers`;
export const POS_PREFIX = `${API_BASE}/api/pos`;
export const TRANSFERS_PREFIX = apiUrl(
  process.env.NEXT_PUBLIC_TRANSFERS_API_PATH ?? "api/transfers",
);
