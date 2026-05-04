import { API_BASE } from "./endpoints";
import { jsonFetch, type JsonHeaders } from "./http";

const PREFIX = `${API_BASE}/api/pos`;

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
  return jsonPos<PosSessionCurrentResponse>(`${PREFIX}/sessions/current`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function openPosSession(
  tenantSlug: string,
  body?: { deviceId?: string; staffUserId?: string },
): Promise<{
  id: string;
  branch_id: string;
  status: string;
  opened_at: string;
}> {
  return jsonPos(`${PREFIX}/sessions/open`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(body ?? {}),
  });
}

export async function postSessionStatement(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/sessions/${sessionId}/open-statement`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getPosStatement(
  tenantSlug: string,
  statementId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/statements/${statementId}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function patchPosStatementLine(
  tenantSlug: string,
  statementId: string,
  lineId: string,
  actualAmount: number,
): Promise<unknown> {
  return jsonPos(
    `${PREFIX}/statements/${statementId}/lines/${lineId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant": tenantSlug,
      } as JsonHeaders,
      body: JSON.stringify({ actualAmount }),
    },
  );
}

export async function postPosStatement(
  tenantSlug: string,
  statementId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/statements/${statementId}/post`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getXReport(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/sessions/${sessionId}/x-report`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getZReport(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/sessions/${sessionId}/z-report`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function closePosSession(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/sessions/${sessionId}/close`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

async function jsonPos<T>(url: string, init: RequestInit): Promise<T> {
  return jsonFetch<T>(url, init);
}
