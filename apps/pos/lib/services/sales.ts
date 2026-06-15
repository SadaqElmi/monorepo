import { SALES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type { CreateSaleInput, PagedList, Sale, SaleItem } from "@repo/types";

export type { Sale, SaleItem, CreateSaleInput };

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
  init?: Pick<RequestInit, "signal">,
): Promise<Sale | null> {
  return jsonFetch<Sale | null>(`${SALES_PREFIX}/${id}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
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

export type CreateSaleOptions = {
  idempotencyKey?: string;
  clientSaleRef?: string;
};

export async function createSale(
  tenantSlug: string,
  input: CreateSaleInput,
  options?: CreateSaleOptions,
): Promise<Sale> {
  const headers: JsonHeaders = {
    "Content-Type": "application/json",
    "X-Tenant": tenantSlug,
  };
  if (options?.idempotencyKey) {
    headers["x-idempotency-key"] = options.idempotencyKey;
  }
  const body: CreateSaleInput = {
    ...input,
    clientSaleRef: options?.clientSaleRef ?? input.clientSaleRef,
    syncSource: input.syncSource ?? "online",
  };
  return jsonFetch<Sale>(SALES_PREFIX, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function voidSale(
  tenantSlug: string,
  saleId: string,
  approvalId: string,
): Promise<{ deleted: boolean }> {
  return jsonFetch<{ deleted: boolean }>(`${SALES_PREFIX}/${saleId}/void`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify({ approvalId }),
  });
}
