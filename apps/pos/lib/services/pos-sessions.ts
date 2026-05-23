import { POS_PREFIX } from "./endpoints";
import { jsonFetch, type JsonFetchOptions } from "./http";
import { getPosDeviceBinding } from "@/lib/device-client";

const PREFIX = POS_PREFIX;

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
    tenantSlug,
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
  const binding = getPosDeviceBinding();
  const payload = {
    ...body,
    deviceId: body?.deviceId ?? binding?.deviceId,
  };
  return jsonPos(`${PREFIX}/sessions/open`, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function postSessionStatement(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/sessions/${sessionId}/open-statement`, {
    method: "POST",
    tenantSlug,
  });
}

export async function getPosStatement(
  tenantSlug: string,
  statementId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/statements/${statementId}`, {
    method: "GET",
    tenantSlug,
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
      tenantSlug,
      headers: { "Content-Type": "application/json" },
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
    tenantSlug,
  });
}

export async function getXReport(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/sessions/${sessionId}/x-report`, {
    method: "GET",
    tenantSlug,
  });
}

export async function getZReport(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/sessions/${sessionId}/z-report`, {
    method: "GET",
    tenantSlug,
  });
}

export async function closePosSession(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonPos(`${PREFIX}/sessions/${sessionId}/close`, {
    method: "POST",
    tenantSlug,
  });
}

async function jsonPos<T>(url: string, init: JsonFetchOptions): Promise<T> {
  return jsonFetch<T>(url, init);
}
