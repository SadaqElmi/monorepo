import { PURCHASES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Purchase = {
  id: string;
  supplier_id: string | null;
  branch_id: string | null;
  invoice_number: string | null;
  // Postgres Decimal often serializes as string over JSON.
  total_amount: number | string | null;
  purchase_date: string | null;
  created_at?: string;
  item_count?: number;
  items?: PurchaseItem[];
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  branch_id: string | null;
  product_id: string | null;
  batch_id: string | null;
  quantity: number | null;
  cost_price: number | string | null;
  selling_price: number | string | null;
  expiry_date: string | null;
  batch_number?: string | null;
};

export type CreatePurchaseInput = {
  supplierId?: string;
  branchId?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  purchaseDate?: string;
  items: Array<{
    productId: string;
    quantity: number;
    batchNumber?: string;
    costPrice?: number;
    sellingPrice?: number;
    expiryDate?: string;
  }>;
};

export type UpdatePurchaseInput = {
  supplierId?: string;
  branchId?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  purchaseDate?: string;
};

/** Latest purchase line per product (items catalog: unit cost, selling, supplier). */
export type PurchaseLinePricingRow = {
  product_id: string;
  cost_price: number | string | null;
  selling_price: number | string | null;
  supplier_id: string | null;
  supplier_name: string | null;
};

type BranchScopeOptions = {
  includeAllBranches?: boolean;
};

export async function getPurchaseLinePricingByProduct(
  tenantSlug: string,
  options?: BranchScopeOptions,
): Promise<PurchaseLinePricingRow[]> {
  const headers: JsonHeaders = { "X-Tenant": tenantSlug };
  if (options?.includeAllBranches) {
    headers["x-branch-id"] = "all";
  }
  return jsonFetch<PurchaseLinePricingRow[]>(
    `${PURCHASES_PREFIX}/line-pricing-by-product`,
    {
      method: "GET",
      headers,
    },
  );
}

export async function getPurchases(tenantSlug: string): Promise<Purchase[]> {
  return jsonFetch<Purchase[]>(PURCHASES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createPurchase(
  tenantSlug: string,
  input: CreatePurchaseInput,
): Promise<Purchase> {
  return jsonFetch<Purchase>(PURCHASES_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updatePurchase(
  tenantSlug: string,
  id: string,
  input: UpdatePurchaseInput,
): Promise<Purchase | null> {
  return jsonFetch<Purchase | null>(`${PURCHASES_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deletePurchase(
  tenantSlug: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return jsonFetch<{ deleted: boolean }>(`${PURCHASES_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function deletePurchaseItems(
  tenantSlug: string,
  id: string,
): Promise<{ deleted: boolean; count: number }> {
  return jsonFetch<{ deleted: boolean; count: number }>(
    `${PURCHASES_PREFIX}/${id}/items`,
    {
      method: "DELETE",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

