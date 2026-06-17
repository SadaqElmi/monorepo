import { POS_PREFIX } from "./endpoints";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { hasGlobalBranchAccess, normalizeRole } from "@/lib/branch-access";
import { jsonFetch, type JsonHeaders } from "./http";

function headers(tenantSlug: string): JsonHeaders {
  const user = getResolvedStoredUser();
  const role = normalizeRole(user?.role);
  const useAll =
    role === "manager" ||
    hasGlobalBranchAccess(user?.role, user?.canViewAllBranches);
  return {
    "X-Tenant": tenantSlug,
    ...(useAll ? { "x-branch-id": "all" } : {}),
  } as JsonHeaders;
}

export type PosDeviceInventoryItem = {
  id: string;
  displayName: string | null;
  deviceName: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  browserVersion: string | null;
  lastIp: string | null;
  lastHeartbeatAt: string | null;
  bindingStatus: string;
  branchId: string | null;
  disabled: boolean;
  forceLogoutAt: string | null;
  pendingOutboxCount: number;
};

export async function listPosDevices(
  tenantSlug: string,
  params?: { branchId?: string; page?: number; limit?: number },
) {
  const q = new URLSearchParams();
  if (params?.branchId) q.set("branchId", params.branchId);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return jsonFetch<PosDeviceInventoryItem[]>(
    `${POS_PREFIX}/devices${qs ? `?${qs}` : ""}`,
    { method: "GET", headers: headers(tenantSlug) },
  );
}

export async function disablePosDevice(tenantSlug: string, id: string) {
  return jsonFetch(`${POS_PREFIX}/devices/${id}/disable`, {
    method: "POST",
    headers: headers(tenantSlug),
  });
}

export async function enablePosDevice(tenantSlug: string, id: string) {
  return jsonFetch(`${POS_PREFIX}/devices/${id}/enable`, {
    method: "POST",
    headers: headers(tenantSlug),
  });
}

export async function forceLogoutPosDevice(tenantSlug: string, id: string) {
  return jsonFetch(`${POS_PREFIX}/devices/${id}/force-logout`, {
    method: "POST",
    headers: headers(tenantSlug),
  });
}

export async function wipePosDeviceCredential(tenantSlug: string, id: string) {
  return jsonFetch(`${POS_PREFIX}/devices/${id}/wipe-credential`, {
    method: "POST",
    headers: headers(tenantSlug),
  });
}
