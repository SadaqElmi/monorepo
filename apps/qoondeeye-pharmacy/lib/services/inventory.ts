import { INVENTORY_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

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
  const headers: JsonHeaders = { "X-Tenant": tenantSlug };
  if (options?.includeAllBranches) {
    headers["x-branch-id"] = "all";
  }
  return jsonFetch<InventoryEntry[]>(INVENTORY_PREFIX, {
    method: "GET",
    headers,
    signal: options?.signal,
  });
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
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
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
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

