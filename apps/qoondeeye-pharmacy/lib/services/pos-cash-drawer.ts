import { POS_PREFIX } from "./endpoints";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { hasGlobalBranchAccess, normalizeRole } from "@/lib/branch-access";
import { jsonFetch, type JsonHeaders } from "./http";

function headers(tenantSlug: string): JsonHeaders {
  const user = getResolvedStoredUser();
  const role = normalizeRole(user?.role);
  const useAll =
    role === "manager" || hasGlobalBranchAccess(user?.role, user?.canViewAllBranches);
  return {
    "X-Tenant": tenantSlug,
    ...(useAll ? { "x-branch-id": "all" } : {}),
  } as JsonHeaders;
}

export type CashMovementRow = {
  id: string;
  sessionId: string;
  branchId: string;
  movementType: string;
  amount: number;
  reasonCode: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export async function listCashMovements(
  tenantSlug: string,
  params?: { from?: string; to?: string; sessionId?: string; page?: number; limit?: number },
) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return jsonFetch<CashMovementRow[]>(
    `${POS_PREFIX}/reports/cash-movements${qs ? `?${qs}` : ""}`,
    { method: "GET", headers: headers(tenantSlug) },
  );
}
