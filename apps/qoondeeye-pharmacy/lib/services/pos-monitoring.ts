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

export type PosMonitoringOverview = {
  terminals: { total: number; online: number; offline: number };
  activeShifts: number;
  salesTodayTotal: number;
  salesTodayCount: number;
  refundsToday: number;
  varianceAlerts: number;
  devices: Array<{
    id: string;
    name: string | null;
    bindingStatus: string;
    online: boolean;
    pendingOutbox: number;
    lastHeartbeatAt: string | null;
  }>;
};

export async function getPosMonitoringOverview(tenantSlug: string) {
  return jsonFetch<PosMonitoringOverview>(`${POS_PREFIX}/monitoring/overview`, {
    method: "GET",
    headers: headers(tenantSlug),
  });
}

export async function getPosMonitoringEvents(tenantSlug: string, limit = 50) {
  return jsonFetch<
    Array<{
      id: string;
      action: string;
      actorUserId: string | null;
      createdAt: string;
      payload: unknown;
    }>
  >(`${POS_PREFIX}/monitoring/events?limit=${limit}`, {
    method: "GET",
    headers: headers(tenantSlug),
  });
}
