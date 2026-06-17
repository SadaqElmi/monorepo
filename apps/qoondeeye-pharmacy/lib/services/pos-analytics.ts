import { POS_PREFIX } from "./endpoints";
import { jsonFetch, type JsonHeaders } from "./http";

function headers(tenantSlug: string): JsonHeaders {
  return { "X-Tenant": tenantSlug } as JsonHeaders;
}

export type AnalyticsBucket = {
  label?: string;
  hour?: number;
  total: number;
  count?: number;
  quantity?: number;
};

async function fetchAnalytics(
  tenantSlug: string,
  path: string,
  from?: string,
  to?: string,
) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return jsonFetch<AnalyticsBucket[]>(
    `${POS_PREFIX}/analytics/${path}${qs ? `?${qs}` : ""}`,
    { method: "GET", headers: headers(tenantSlug) },
  );
}

export const getSalesByBranch = (t: string, from?: string, to?: string) =>
  fetchAnalytics(t, "sales-by-branch", from, to);
export const getSalesByTerminal = (t: string, from?: string, to?: string) =>
  fetchAnalytics(t, "sales-by-terminal", from, to);
export const getSalesByCashier = (t: string, from?: string, to?: string) =>
  fetchAnalytics(t, "sales-by-cashier", from, to);
export const getSalesByHour = (t: string, from?: string, to?: string) =>
  fetchAnalytics(t, "sales-by-hour", from, to);
export const getTopProducts = (t: string, from?: string, to?: string) =>
  fetchAnalytics(t, "top-products", from, to);
