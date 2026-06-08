import type { PagedList } from "@repo/types";
import {
  createPurchaseSchema,
  parseInput,
  updatePurchaseSchema,
  type CreatePurchaseInput as ValidatedCreatePurchaseInput,
  type UpdatePurchaseInput as ValidatedUpdatePurchaseInput,
} from "@/lib/validation";

import { PURCHASES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Purchase = {
  id: string;
  supplier_id: string | null;
  branch_id: string | null;
  invoice_number: string | null;
  supplier_invoice_no?: string | null;
  purchase_order_no?: string | null;
  status?: string;
  // Postgres Decimal often serializes as string over JSON.
  total_amount: number | string | null;
  purchase_date: string | null;
  order_date?: string | null;
  posting_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  on_credit?: boolean;
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
  uom_id?: string | null;
  quantity: number | null;
  quantity_received?: number | null;
  conversion_factor_snapshot?: number | string | null;
  base_quantity?: number | string | null;
  base_unit_cost?: number | string | null;
  cost_price: number | string | null;
  selling_price: number | string | null;
  update_selling_price?: boolean;
  expiry_date: string | null;
  batch_number?: string | null;
  line_discount?: number | string | null;
  tax_amount?: number | string | null;
  line_notes?: string | null;
  planned_batch_number?: string | null;
  planned_expiry_date?: string | null;
  uom_code?: string | null;
  uom_symbol?: string | null;
  item_no?: string | null;
  product_name?: string | null;
};

export type CreatePurchaseInput = ValidatedCreatePurchaseInput;

export type UpdatePurchaseInput = ValidatedUpdatePurchaseInput;

/** Product pricing for the items catalog: purchase first, then batch/opening stock. */
export type PurchaseLinePricingRow = {
  product_id: string;
  uom_id?: string | null;
  uom_code?: string | null;
  uom_symbol?: string | null;
  base_uom_id?: string | null;
  base_uom_code?: string | null;
  base_uom_symbol?: string | null;
  conversion_factor_to_base?: number | string | null;
  cost_price: number | string | null;
  selling_price: number | string | null;
  cost_price_source?: string | null;
  selling_price_source?: string | null;
  batch_number?: string | null;
  expiry_date?: string | Date | null;
  supplier_id: string | null;
  supplier_name: string | null;
};

type BranchScopeOptions = {
  includeAllBranches?: boolean;
  /** Scope pricing to one branch (purchase/bill form branch). */
  branchId?: string;
  /** Prefer latest cost history for this supplier before generic product pricing. */
  supplierId?: string;
  /** Resolve pricing for this selected product UOM instead of the purchase default. */
  uomId?: string;
};

export async function getPurchaseLinePricingByProduct(
  tenantSlug: string,
  options?: BranchScopeOptions,
): Promise<PurchaseLinePricingRow[]> {
  const headers: JsonHeaders = { "X-Tenant": tenantSlug };
  if (options?.includeAllBranches) {
    headers["x-branch-id"] = "all";
  } else if (options?.branchId?.trim()) {
    headers["x-branch-id"] = options.branchId.trim();
  }
  const q = new URLSearchParams();
  if (options?.supplierId?.trim()) q.set("supplierId", options.supplierId.trim());
  if (options?.uomId?.trim()) q.set("uomId", options.uomId.trim());
  const qs = q.toString();
  return jsonFetch<PurchaseLinePricingRow[]>(
    `${PURCHASES_PREFIX}/line-pricing-by-product${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      headers,
    },
  );
}

export async function getPurchaseLinePricingForProduct(
  tenantSlug: string,
  productId: string,
  options?: BranchScopeOptions,
): Promise<PurchaseLinePricingRow | null> {
  const headers: JsonHeaders = { "X-Tenant": tenantSlug };
  if (options?.includeAllBranches) {
    headers["x-branch-id"] = "all";
  } else if (options?.branchId?.trim()) {
    headers["x-branch-id"] = options.branchId.trim();
  }
  const q = new URLSearchParams({ productId });
  if (options?.supplierId?.trim()) q.set("supplierId", options.supplierId.trim());
  if (options?.uomId?.trim()) q.set("uomId", options.uomId.trim());
  return jsonFetch<PurchaseLinePricingRow | null>(
    `${PURCHASES_PREFIX}/line-pricing-by-product?${q}`,
    {
      method: "GET",
      headers,
    },
  );
}

export async function getPurchases(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Purchase[]> {
  return jsonFetch<Purchase[]>(PURCHASES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}

export async function getPurchasesPaged(
  tenantSlug: string,
  page: number,
  limit: number,
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<Purchase>> {
  const q = new URLSearchParams({
    page: String(Math.max(1, page)),
    limit: String(Math.max(1, limit)),
  });
  return jsonFetch<PagedList<Purchase>>(`${PURCHASES_PREFIX}?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}

export async function getPurchase(
  tenantSlug: string,
  id: string,
): Promise<Purchase | null> {
  return jsonFetch<Purchase | null>(`${PURCHASES_PREFIX}/${id}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createPurchase(
  tenantSlug: string,
  input: CreatePurchaseInput,
): Promise<Purchase> {
  const body = parseInput(createPurchaseSchema, input);
  return jsonFetch<Purchase>(PURCHASES_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(body),
  });
}

export async function updatePurchase(
  tenantSlug: string,
  id: string,
  input: UpdatePurchaseInput,
): Promise<Purchase | null> {
  const body = parseInput(updatePurchaseSchema, input);
  return jsonFetch<Purchase | null>(`${PURCHASES_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(body),
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

async function purchaseAction(
  tenantSlug: string,
  id: string,
  action: "release" | "receive" | "post-invoice" | "close" | "cancel",
): Promise<Purchase> {
  return jsonFetch<Purchase>(`${PURCHASES_PREFIX}/${id}/${action}`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export const releasePurchase = (t: string, id: string) =>
  purchaseAction(t, id, "release");
export const receivePurchase = (t: string, id: string) =>
  purchaseAction(t, id, "receive");
export const postPurchaseInvoice = (t: string, id: string) =>
  purchaseAction(t, id, "post-invoice");
export const closePurchase = (t: string, id: string) =>
  purchaseAction(t, id, "close");
export const cancelPurchase = (t: string, id: string) =>
  purchaseAction(t, id, "cancel");

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
