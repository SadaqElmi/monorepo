/**
 * Inventory movement timeline (`GET /api/inventory/history`).
 *
 * v1: `before_quantity` / `after_quantity` are always null server-side until an
 * append-only `inventory_movements` ledger exists (see backend service docblock).
 */
import type { PagedList } from "@repo/types";

import { INVENTORY_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type InventoryHistoryPerformedBy = {
  user_id: string | null;
  name: string | null;
};

export type InventoryHistoryRow = {
  id: string;
  created_at: string;
  action_type: string;
  product_id: string | null;
  product_name: string | null;
  batch_number: string | null;
  quantity_change: number;
  before_quantity: number | null;
  after_quantity: number | null;
  branch_id: string | null;
  branch_name: string | null;
  reference_type: string;
  reference_id: string;
  performed_by: InventoryHistoryPerformedBy | null;
  ref_hint: string | null;
};

export type InventoryHistoryListQuery = {
  page: number;
  limit: number;
  branch_id?: string;
  product_id?: string;
  action_type?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
};

function buildQuery(q: InventoryHistoryListQuery): string {
  const p = new URLSearchParams();
  p.set("page", String(Math.max(1, q.page)));
  p.set("limit", String(Math.max(1, q.limit)));
  if (q.branch_id?.trim()) p.set("branch_id", q.branch_id.trim());
  if (q.product_id?.trim()) p.set("product_id", q.product_id.trim());
  if (q.action_type?.trim()) p.set("action_type", q.action_type.trim());
  if (q.start_date?.trim()) p.set("start_date", q.start_date.trim());
  if (q.end_date?.trim()) p.set("end_date", q.end_date.trim());
  if (q.search?.trim()) p.set("search", q.search.trim());
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function getInventoryHistoryPaged(
  tenantSlug: string,
  query: InventoryHistoryListQuery,
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<InventoryHistoryRow>> {
  return jsonFetch<PagedList<InventoryHistoryRow>>(
    `${INVENTORY_PREFIX}/history${buildQuery(query)}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}
