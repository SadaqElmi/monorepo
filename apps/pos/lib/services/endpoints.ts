/**
 * Centralized API endpoint prefixes for the frontend.
 * Configure `NEXT_PUBLIC_API_URL` in `.env.local` (e.g. http://localhost:5555).
 */

export const getBaseUrl = () =>
  //process.env.NEXT_PUBLIC_API_URL_LOCAL ?? "http://localhost:5555";
process.env.NEXT_PUBLIC_API_URL ?? "https://api.qoondeeye.online";

export const API_BASE = getBaseUrl();

/** Join API host with a path segment (no leading/trailing slashes on segment). */
function apiUrl(pathSegment: string): string {
  const base = API_BASE.replace(/\/$/, "");
  const seg = pathSegment.replace(/^\/+/, "").replace(/\/+$/, "");
  return seg ? `${base}/${seg}` : base;
}

export const AUTH_PREFIX = `${API_BASE}/api/auth`;
export const CATEGORIES_PREFIX = `${API_BASE}/api/categories`;
export const PRODUCTS_PREFIX = `${API_BASE}/api/products`;
export const BATCHES_PREFIX = `${API_BASE}/api/batches`;
export const SALES_PREFIX = `${API_BASE}/api/sales`;
export const RETURN_VOUCHERS_PREFIX = `${API_BASE}/api/return-vouchers`;
export const TRANSFERS_PREFIX = apiUrl(
  process.env.NEXT_PUBLIC_TRANSFERS_API_PATH ?? "api/transfers",
);
