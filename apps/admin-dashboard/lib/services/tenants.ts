import { TENANTS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type TenantDomain = {
  id: string;
  domain: string;
};

export type Tenant = {
  id: string;
  name: string;
  schemaName: string;
  status: string;
  domains: TenantDomain[];
  createdAt?: string;
};

export async function getTenants(): Promise<Tenant[]> {
  return jsonFetch<Tenant[]>(TENANTS_PREFIX, { method: "GET" });
}

export async function createTenant(input: {
  name: string;
  domain?: string;
  schemaName?: string;
  domains?: string[];
}) {
  return jsonFetch<Tenant>(TENANTS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateTenant(
  id: string,
  input: { name?: string; status?: string },
) {
  return jsonFetch<Tenant>(`${TENANTS_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteTenant(id: string) {
  return jsonFetch<{ deleted: boolean }>(`${TENANTS_PREFIX}/${id}`, {
    method: "DELETE",
  });
}

/** Deletes the row in `public.tenants` by unique `schemaName` (survives stale/missing client UUIDs). */
export async function deleteTenantBySchemaName(schemaName: string) {
  const enc = encodeURIComponent(schemaName.trim());
  return jsonFetch<{ deleted: boolean }>(`${TENANTS_PREFIX}/schema/${enc}`, {
    method: "DELETE",
  });
}

