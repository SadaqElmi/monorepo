import { SALE_RETURNS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type ReturnRecord = {
  id: string;
  sale_id: string;
  branch_id: string | null;
  reason: string | null;
  return_date: string;
};

export type CreateReturnInput = {
  saleId: string;
  reason?: string;
  items: Array<{
    saleItemId: string;
    quantity: number;
  }>;
};

export type UpdateReturnInput = {
  reason?: string;
};

export async function getReturns(tenantSlug: string): Promise<ReturnRecord[]> {
  return jsonFetch<ReturnRecord[]>(SALE_RETURNS_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getReturnById(
  tenantSlug: string,
  id: string,
): Promise<ReturnRecord | null> {
  return jsonFetch<ReturnRecord | null>(`${SALE_RETURNS_PREFIX}/${id}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createReturn(
  tenantSlug: string,
  input: CreateReturnInput,
): Promise<ReturnRecord> {
  return jsonFetch<ReturnRecord>(SALE_RETURNS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateReturn(
  tenantSlug: string,
  id: string,
  input: UpdateReturnInput,
): Promise<ReturnRecord | null> {
  return jsonFetch<ReturnRecord | null>(`${SALE_RETURNS_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteReturn(
  tenantSlug: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return jsonFetch<{ deleted: boolean }>(`${SALE_RETURNS_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}
