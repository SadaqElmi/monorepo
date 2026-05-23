import { buildPagedQuery, unwrapListResponse } from "@repo/utils";
import type { PagedList } from "@repo/types";

import { INVENTORY_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type InventoryEntry = {
  id: string;
  product_id: string | null;
  branch_id: string | null;
  quantity: number;
  reorder_level: number;
  updated_at?: string;
};

export type UpdateInventoryInput = {
  reorderLevel?: number;
};

type BranchScopeOptions = {
  includeAllBranches?: boolean;
  signal?: AbortSignal;
};

export async function getInventory(
  tenantSlug: string,
  options?: BranchScopeOptions,
): Promise<InventoryEntry[]> {
  const headers: Record<string, string> = {};
  if (options?.includeAllBranches) {
    headers["x-branch-id"] = "all";
  }
  const data = await jsonFetch<InventoryEntry[] | PagedList<InventoryEntry>>(
    INVENTORY_PREFIX,
    {
      method: "GET",
      tenantSlug,
      headers,
      signal: options?.signal,
    },
  );
  return unwrapListResponse(data).items;
}

export async function getInventoryPaged(
  tenantSlug: string,
  params: { page: number; limit?: number },
  options?: BranchScopeOptions,
): Promise<PagedList<InventoryEntry>> {
  const q = buildPagedQuery({
    page: params.page,
    limit: params.limit ?? 50,
  });
  const headers: Record<string, string> = {};
  if (options?.includeAllBranches) {
    headers["x-branch-id"] = "all";
  }
  const data = await jsonFetch<InventoryEntry[] | PagedList<InventoryEntry>>(
    `${INVENTORY_PREFIX}${q}`,
    {
      method: "GET",
      tenantSlug,
      headers,
      signal: options?.signal,
    },
  );
  return unwrapListResponse(data, params.page, params.limit ?? 50);
}

export type ProductStockByBranch = {
  branchId: string;
  branchName: string | null;
  quantity: number;
};

/** On-hand quantity per branch for one product (respects branch scope in headers). */
export async function getInventoryStockByProduct(
  tenantSlug: string,
  productId: string,
): Promise<ProductStockByBranch[]> {
  return jsonFetch<ProductStockByBranch[]>(
    `${INVENTORY_PREFIX}/product/${encodeURIComponent(productId)}/stock`,
    {
      method: "GET",
      tenantSlug,
    },
  );
}

export async function updateInventory(
  tenantSlug: string,
  id: string,
  input: UpdateInventoryInput,
): Promise<InventoryEntry | null> {
  return jsonFetch<InventoryEntry | null>(`${INVENTORY_PREFIX}/${id}`, {
    method: "PATCH",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

