import { POS_PREFIX } from "./endpoints";
import { jsonFetch, type JsonHeaders } from "./http";

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
): Promise<unknown> {
  return jsonFetch(`${POS_PREFIX}/sessions/${sessionId}/open-statement`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getPosStatement(
  tenantSlug: string,
  statementId: string,
): Promise<unknown> {
  return jsonFetch(`${POS_PREFIX}/statements/${statementId}`, {
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
  return jsonFetch(
    `${POS_PREFIX}/statements/${statementId}/lines/${lineId}`,
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
  return jsonFetch(`${POS_PREFIX}/statements/${statementId}/post`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function closePosSession(
  tenantSlug: string,
  sessionId: string,
): Promise<unknown> {
  return jsonFetch(`${POS_PREFIX}/sessions/${sessionId}/close`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}
