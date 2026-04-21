import { ROLES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Role = {
  id: string;
  name: string;
  permissions: string[];
  createdAt?: string;
};

export async function getRoles(tenantSlug: string): Promise<Role[]> {
  return jsonFetch<Role[]>(ROLES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createRole(
  tenantSlug: string,
  input: { name: string; permissions: string[] },
) {
  return jsonFetch<Role>(ROLES_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateRole(
  tenantSlug: string,
  id: string,
  input: { name?: string; permissions?: string[] },
) {
  return jsonFetch<Role>(`${ROLES_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteRole(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${ROLES_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

