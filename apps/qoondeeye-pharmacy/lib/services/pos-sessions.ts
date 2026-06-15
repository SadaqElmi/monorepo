import { POS_PREFIX } from "./endpoints";
import { jsonFetch, type JsonHeaders } from "./http";

function posSessionHeaders(
  tenantSlug: string,
  branchId?: string,
): JsonHeaders {
  const headers: JsonHeaders = { "X-Tenant": tenantSlug };
  if (branchId?.trim()) {
    headers["x-branch-id"] = branchId.trim();
  }
  return headers;
}

export type PosSessionCurrentResponse = {
  id: string;
  branch_id: string;
  device_id: string | null;
  staff_user_id: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  hasPostedStatement?: boolean;
} | null;

export async function getCurrentPosSession(
  tenantSlug: string,
): Promise<PosSessionCurrentResponse> {
  return jsonFetch<PosSessionCurrentResponse>(
    `${POS_PREFIX}/sessions/current`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function postSessionStatement(
  tenantSlug: string,
  sessionId: string,
  branchId?: string,
): Promise<unknown> {
  return jsonFetch(`${POS_PREFIX}/sessions/${sessionId}/open-statement`, {
    method: "POST",
    headers: posSessionHeaders(tenantSlug, branchId),
  });
}

export async function getPosStatement(
  tenantSlug: string,
  statementId: string,
  branchId?: string,
): Promise<unknown> {
  return jsonFetch(`${POS_PREFIX}/statements/${statementId}`, {
    method: "GET",
    headers: posSessionHeaders(tenantSlug, branchId),
  });
}

export async function patchPosStatementLine(
  tenantSlug: string,
  statementId: string,
  lineId: string,
  actualAmount: number,
  branchId?: string,
): Promise<unknown> {
  return jsonFetch(
    `${POS_PREFIX}/statements/${statementId}/lines/${lineId}`,
    {
      method: "PATCH",
      headers: {
        ...posSessionHeaders(tenantSlug, branchId),
        "Content-Type": "application/json",
      } as JsonHeaders,
      body: JSON.stringify({ actualAmount }),
    },
  );
}

export async function postPosStatement(
  tenantSlug: string,
  statementId: string,
  branchId?: string,
): Promise<unknown> {
  return jsonFetch(`${POS_PREFIX}/statements/${statementId}/post`, {
    method: "POST",
    headers: posSessionHeaders(tenantSlug, branchId),
  });
}

export async function closePosSession(
  tenantSlug: string,
  sessionId: string,
  branchId?: string,
): Promise<unknown> {
  return jsonFetch(`${POS_PREFIX}/sessions/${sessionId}/close`, {
    method: "POST",
    headers: posSessionHeaders(tenantSlug, branchId),
  });
}

export type PosShiftListItem = {
  id: string;
  branchId: string;
  branchName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  staffUserId: string | null;
  staffName: string | null;
  status: string;
  openingCash: number;
  closingCash: number | null;
  openedAt: string;
  closedAt: string | null;
  totalVariance: number;
  varianceApproved: boolean;
  varianceApprovedAt: string | null;
  statementStatus: string | null;
};

export type PosShiftListQuery = {
  page?: number;
  limit?: number;
  branchId?: string;
  deviceId?: string;
  staffUserId?: string;
  status?: "open" | "paused" | "closed";
  from?: string;
  to?: string;
  signal?: AbortSignal;
};

export async function listPosShifts(
  tenantSlug: string,
  query: PosShiftListQuery = {},
): Promise<{
  items: PosShiftListItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.branchId) params.set("branchId", query.branchId);
  if (query.deviceId) params.set("deviceId", query.deviceId);
  if (query.staffUserId) params.set("staffUserId", query.staffUserId);
  if (query.status) params.set("status", query.status);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  const qs = params.toString();
  return jsonFetch(`${POS_PREFIX}/reports/shifts${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: query.signal,
  });
}

export async function approvePosShiftVariance(
  tenantSlug: string,
  sessionId: string,
): Promise<{ id: string; approved: boolean }> {
  return jsonFetch(`${POS_PREFIX}/sessions/${sessionId}/approve-variance`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}
