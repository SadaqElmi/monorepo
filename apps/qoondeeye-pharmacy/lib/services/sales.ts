import { SALES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type {
  CreateSaleInput,
  PagedList,
  Sale,
  SaleItem,
  UpdateSaleInput,
} from "@repo/types";

export type { Sale, SaleItem, CreateSaleInput, UpdateSaleInput };

export async function getSales(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Sale[]> {
  return jsonFetch<Sale[]>(SALES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}

/** Paginated sales (`page` enables server paging). */
export async function getSalesPaged(
  tenantSlug: string,
  page: number,
  limit: number,
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<Sale>> {
  const q = new URLSearchParams({
    page: String(Math.max(1, page)),
    limit: String(Math.max(1, limit)),
  });
  return jsonFetch<PagedList<Sale>>(`${SALES_PREFIX}?${q}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
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

