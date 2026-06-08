import { DOMAINS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type DomainTenant = {
  id: string;
  name: string;
  schemaName: string;
  status: string;
  createdAt?: string;
};

export type Domain = {
  id: string;
  tenantId: string;
  domain: string;
  createdAt?: string;
  tenant?: DomainTenant;
};

export async function getDomains(input?: { tenantId?: string }): Promise<Domain[]> {
  const qs = input?.tenantId
    ? `?tenantId=${encodeURIComponent(input.tenantId)}`
    : "";
  return jsonFetch<Domain[]>(`${DOMAINS_PREFIX}${qs}`, { method: "GET" });
}

export async function createDomain(input: { tenantId: string; domain: string }) {
  return jsonFetch<Domain>(DOMAINS_PREFIX, {
    method: "POST",
    headers: { "Content-Type": "application/json" } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateDomain(id: string, input: { domain?: string }) {
  return jsonFetch<Domain>(`${DOMAINS_PREFIX}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteDomain(id: string) {
  return jsonFetch<{ deleted: boolean }>(`${DOMAINS_PREFIX}/${id}`, {
    method: "DELETE",
  });
}

