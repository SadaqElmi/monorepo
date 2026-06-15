import { getResolvedStoredUser } from "@/lib/auth-client";
import { hasGlobalBranchAccess, normalizeRole } from "@/lib/branch-access";
import { AUDIT_PREFIX, POS_TERMINALS_PREFIX } from "./endpoints";
import { jsonFetch, type JsonHeaders } from "./http";

function buildPosTerminalHeaders(
  tenantSlug: string,
  extra?: JsonHeaders,
): JsonHeaders {
  const user = getResolvedStoredUser();
  const role = normalizeRole(user?.role);
  const useAllBranches =
    role === "manager" ||
    hasGlobalBranchAccess(user?.role, user?.canViewAllBranches);
  return {
    ...(useAllBranches ? { "x-branch-id": "all" } : {}),
    "X-Tenant": tenantSlug,
    ...extra,
  } as JsonHeaders;
}

export type PosTerminal = {
  id: string;
  displayName: string | null;
  terminalUsername: string | null;
  deviceCode: string;
  branchId: string | null;
  branchName: string | null;
  status: string;
  bindingStatus: "unbound" | "bound" | "revoked" | string;
  boundAt: string | null;
  lastSeenAt: string | null;
  lastSetupAttemptAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  deviceFingerprint: string | null;
};

export type PaginatedPosTerminals = {
  items: PosTerminal[];
  total: number;
  page: number;
  limit: number;
};

export type PosTerminalListQuery = {
  page?: number;
  limit?: number;
  q?: string;
  branchId?: string;
  status?: "active" | "inactive" | "";
  bindingStatus?: "unbound" | "bound" | "revoked" | "";
  signal?: AbortSignal;
};

export type CreatePosTerminalInput = {
  displayName: string;
  branchId: string;
  terminalUsername: string;
  password: string;
  status?: "active" | "inactive";
};

export type UpdatePosTerminalInput = {
  displayName?: string;
  branchId?: string;
  status?: "active" | "inactive";
};

export type PosTerminalActivity = {
  terminal: PosTerminal;
  currentSession: {
    id: string;
    staffUserId: string | null;
    staffName: string | null;
    openedAt: string;
  } | null;
  stats: {
    salesLast24h: number;
    loginFailuresLast24h: number;
  };
  recentSessions: {
    items: Array<{
      id: string;
      status: string;
      staffName: string | null;
      openedAt: string;
      closedAt: string | null;
    }>;
    total: number;
    page: number;
    limit: number;
  };
  recentAudit: {
    items: Array<{
      id: string;
      action: string;
      actorUserId: string | null;
      actorName: string | null;
      createdAt: string;
      payload: Record<string, unknown> | null;
    }>;
    total: number;
    page: number;
    limit: number;
  };
  recentLoginFailures: {
    items: Array<{
      id: string;
      createdAt: string;
      payload: Record<string, unknown> | null;
    }>;
    total: number;
    page: number;
    limit: number;
  };
};

function buildListQueryString(query: PosTerminalListQuery): string {
  const params = new URLSearchParams();
  if (query.page != null) params.set("page", String(query.page));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.branchId?.trim()) params.set("branchId", query.branchId.trim());
  if (query.status) params.set("status", query.status);
  if (query.bindingStatus) params.set("bindingStatus", query.bindingStatus);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getPosTerminals(
  tenantSlug: string,
  options?: PosTerminalListQuery,
): Promise<PaginatedPosTerminals> {
  const { signal, ...query } = options ?? {};
  return jsonFetch<PaginatedPosTerminals>(
    `${POS_TERMINALS_PREFIX}${buildListQueryString(query)}`,
    {
      method: "GET",
      headers: buildPosTerminalHeaders(tenantSlug),
      signal,
    },
  );
}

export async function getPosTerminal(
  tenantSlug: string,
  id: string,
  options?: { signal?: AbortSignal },
): Promise<PosTerminal> {
  return jsonFetch<PosTerminal>(`${POS_TERMINALS_PREFIX}/${id}`, {
    method: "GET",
    headers: buildPosTerminalHeaders(tenantSlug),
    signal: options?.signal,
  });
}

export async function getPosTerminalActivity(
  tenantSlug: string,
  id: string,
  options?: { page?: number; limit?: number; signal?: AbortSignal },
): Promise<PosTerminalActivity> {
  const params = new URLSearchParams();
  if (options?.page != null) params.set("page", String(options.page));
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  return jsonFetch<PosTerminalActivity>(
    `${POS_TERMINALS_PREFIX}/${id}/activity${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      headers: buildPosTerminalHeaders(tenantSlug),
      signal: options?.signal,
    },
  );
}

export async function createPosTerminal(
  tenantSlug: string,
  input: CreatePosTerminalInput,
): Promise<PosTerminal> {
  return jsonFetch<PosTerminal>(POS_TERMINALS_PREFIX, {
    method: "POST",
    headers: buildPosTerminalHeaders(tenantSlug, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(input),
  });
}

export async function updatePosTerminal(
  tenantSlug: string,
  id: string,
  input: UpdatePosTerminalInput,
): Promise<PosTerminal> {
  return jsonFetch<PosTerminal>(`${POS_TERMINALS_PREFIX}/${id}`, {
    method: "PATCH",
    headers: buildPosTerminalHeaders(tenantSlug, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(input),
  });
}

export async function resetPosTerminalPassword(
  tenantSlug: string,
  id: string,
  password: string,
): Promise<PosTerminal> {
  return jsonFetch<PosTerminal>(`${POS_TERMINALS_PREFIX}/${id}/reset-password`, {
    method: "POST",
    headers: buildPosTerminalHeaders(tenantSlug, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ password }),
  });
}

export async function revokePosTerminalBinding(
  tenantSlug: string,
  id: string,
): Promise<PosTerminal> {
  return jsonFetch<PosTerminal>(`${POS_TERMINALS_PREFIX}/${id}/revoke-binding`, {
    method: "POST",
    headers: buildPosTerminalHeaders(tenantSlug),
  });
}

export async function deactivatePosTerminal(
  tenantSlug: string,
  id: string,
): Promise<PosTerminal> {
  return jsonFetch<PosTerminal>(`${POS_TERMINALS_PREFIX}/${id}`, {
    method: "DELETE",
    headers: buildPosTerminalHeaders(tenantSlug),
  });
}

export async function reactivatePosTerminal(
  tenantSlug: string,
  id: string,
): Promise<PosTerminal> {
  return jsonFetch<PosTerminal>(`${POS_TERMINALS_PREFIX}/${id}/reactivate`, {
    method: "POST",
    headers: buildPosTerminalHeaders(tenantSlug),
  });
}

export type PosGlobalAuditItem = {
  id: string;
  source: "tenant" | "control";
  deviceId: string | null;
  action: string;
  actorUserId: string | null;
  actorType: string;
  createdAt: string;
  payload: Record<string, unknown> | null;
};

export async function getPosGlobalAudit(
  tenantSlug: string,
  query?: {
    page?: number;
    limit?: number;
    deviceId?: string;
    action?: string;
    from?: string;
    to?: string;
    signal?: AbortSignal;
  },
): Promise<{
  items: PosGlobalAuditItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.deviceId) params.set("deviceId", query.deviceId);
  if (query?.action) params.set("action", query.action);
  if (query?.from) params.set("from", query.from);
  if (query?.to) params.set("to", query.to);
  const qs = params.toString();
  return jsonFetch(`${AUDIT_PREFIX}/pos${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: buildPosTerminalHeaders(tenantSlug),
    signal: query?.signal,
  });
}

