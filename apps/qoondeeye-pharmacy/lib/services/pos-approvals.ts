import { POS_PREFIX } from "./endpoints";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { jsonFetch, type JsonHeaders } from "./http";

export type PosApprovalRequest = {
  id: string;
  actionType: string;
  status: string;
  reasonCode?: string | null;
  reasonNote?: string | null;
  payload?: unknown;
  expiresAt?: string | null;
  createdAt?: string;
};

function headers(tenantSlug: string): JsonHeaders {
  return { "X-Tenant": tenantSlug } as JsonHeaders;
}

export async function listPendingPosApprovals(tenantSlug: string, limit = 50) {
  return jsonFetch<PosApprovalRequest[]>(
    `${POS_PREFIX}/approvals/pending?limit=${limit}`,
    { method: "GET", headers: headers(tenantSlug) },
  );
}

export function getErpTenantSlug() {
  return getResolvedStoredUser()?.tenantSlug ?? "";
}
