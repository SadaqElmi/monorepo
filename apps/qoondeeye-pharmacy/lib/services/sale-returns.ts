import { buildPagedQuery, unwrapListResponse } from "@repo/utils";
import type { PagedList } from "@repo/types";

import { SALE_RETURNS_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

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

export async function getSaleReturns(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<SaleReturn[]> {
  const data = await jsonFetch<SaleReturn[] | PagedList<SaleReturn>>(
    SALE_RETURNS_PREFIX,
    { method: "GET", tenantSlug, signal: init?.signal },
  );
  return unwrapListResponse(data).items;
}

export async function getSaleReturnsPaged(
  tenantSlug: string,
  params: { page: number; limit?: number },
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<SaleReturn>> {
  const q = buildPagedQuery({
    page: params.page,
    limit: params.limit ?? 25,
  });
  const data = await jsonFetch<SaleReturn[] | PagedList<SaleReturn>>(
    `${SALE_RETURNS_PREFIX}${q}`,
    { method: "GET", tenantSlug, signal: init?.signal },
  );
  return unwrapListResponse(data, params.page, params.limit ?? 25);
}

export async function createSaleReturn(
  tenantSlug: string,
  input: CreateSaleReturnInput,
): Promise<SaleReturn> {
  return jsonFetch<SaleReturn>(SALE_RETURNS_PREFIX, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
