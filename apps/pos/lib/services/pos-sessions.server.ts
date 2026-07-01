import "server-only";

import { API_BASE } from "./endpoints";
import { serverJsonFetch } from "./server-http";

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

export async function getCurrentPosSessionServer(): Promise<PosSessionCurrentResponse> {
  return serverJsonFetch<PosSessionCurrentResponse>(
    `${PREFIX}/sessions/current`,
    { method: "GET" },
  );
}

export async function getZReportServer(sessionId: string): Promise<unknown> {
  return serverJsonFetch(`${PREFIX}/sessions/${sessionId}/z-report`, {
    method: "GET",
  });
}

export async function getXReportServer(sessionId: string): Promise<unknown> {
  return serverJsonFetch(`${PREFIX}/sessions/${sessionId}/x-report`, {
    method: "GET",
  });
}
