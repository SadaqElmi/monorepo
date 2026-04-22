import { SALES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type { CreateSaleInput, Sale, SaleItem } from "@repo/types";

export type { Sale, SaleItem, CreateSaleInput };

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
