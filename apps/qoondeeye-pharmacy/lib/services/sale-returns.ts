import { SALE_RETURNS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type SaleReturn = {
  id: string;
  sale_id: string;
  branch_id: string | null;
  reason: string | null;
  return_date: string;
};

export type CreateSaleReturnInput = {
  saleId: string;
  reason?: string;
  items: Array<{
    saleItemId: string;
    quantity: number;
  }>;
};

export async function getSaleReturns(tenantSlug: string): Promise<SaleReturn[]> {
  return jsonFetch<SaleReturn[]>(SALE_RETURNS_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createSaleReturn(
  tenantSlug: string,
  input: CreateSaleReturnInput,
): Promise<SaleReturn> {
  return jsonFetch<SaleReturn>(SALE_RETURNS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}
