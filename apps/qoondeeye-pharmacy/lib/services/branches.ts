import { BRANCHES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Branch = {
  id: string;
  name: string | null;
  phone?: string | null;
  address?: string | null;
  /** YYYY-MM-DD; inclusive posting lock for accounting */
  accounting_lock_date?: string | null;
  created_at?: string;
};

export async function getBranches(tenantSlug: string): Promise<Branch[]> {
  return jsonFetch<Branch[]>(BRANCHES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createBranch(
  tenantSlug: string,
  input: { name?: string; phone?: string; address?: string },
) {
  return jsonFetch<Branch>(BRANCHES_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateBranch(
  tenantSlug: string,
  id: string,
  input: {
    name?: string;
    phone?: string;
    address?: string;
    accountingLockDate?: string | null;
  },
) {
  return jsonFetch<Branch>(`${BRANCHES_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteBranch(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${BRANCHES_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

