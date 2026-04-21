import { SALES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Sale = {
  id: string;
  branch_id: string | null;
  receipt_number?: string | null;
  // Postgres Decimal often serializes as string over JSON.
  total_amount: number | string | null;
  discount: number | string | null;
  tax: number | string | null;
  sale_date: string | null;
  items?: SaleItem[];
};

export type SaleItem = {
  id: string;
  sale_id: string;
  branch_id: string | null;
  product_id: string | null;
  batch_id: string | null;
  quantity: number | null;
  price: number | string | null;
  total: number | string | null;
};

export type CreateSaleInput = {
  branchId?: string;
  totalAmount?: number;
  discount?: number;
  tax?: number;
  paymentMethod?: string;
  items: Array<{
    productId: string;
    quantity: number;
    price?: number;
  }>;
};

export type UpdateSaleInput = {
  branchId?: string;
  totalAmount?: number;
  discount?: number;
  tax?: number;
};

export async function getSales(tenantSlug: string): Promise<Sale[]> {
  return jsonFetch<Sale[]>(SALES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getSaleById(
  tenantSlug: string,
  id: string,
): Promise<Sale | null> {
  return jsonFetch<Sale | null>(`${SALES_PREFIX}/${id}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

/** Lookup by printed receipt # (5-digit or numeric string). Requires x-branch-id. */
export async function getSaleByReceiptNumber(
  tenantSlug: string,
  receiptNumber: string,
): Promise<Sale | null> {
  const q = new URLSearchParams({ number: receiptNumber.trim() });
  return jsonFetch<Sale | null>(`${SALES_PREFIX}/by-receipt?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createSale(
  tenantSlug: string,
  input: CreateSaleInput,
): Promise<Sale> {
  return jsonFetch<Sale>(SALES_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateSale(
  tenantSlug: string,
  id: string,
  input: UpdateSaleInput,
): Promise<Sale | null> {
  return jsonFetch<Sale | null>(`${SALES_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteSale(
  tenantSlug: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return jsonFetch<{ deleted: boolean }>(`${SALES_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

