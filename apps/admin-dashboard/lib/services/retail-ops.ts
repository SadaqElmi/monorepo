import { API_BASE } from "./endpoints";
import { jsonFetch } from "./http";

export type RetailOpsOverview = {
  tenantCount: number;
  controlAuditEvents24h: number;
  failedLogins24h: number;
  forceLogouts24h: number;
  pendingOutboxTotal: number;
  devicesReporting: number;
  auditByAction24h: Array<{ action: string; count: number }>;
  recentAuditEvents: Array<{
    id: string;
    action: string;
    tenantId: string | null;
    deviceId: string | null;
    createdAt: string;
    payload: unknown;
  }>;
  tenants: Array<{
    id: string;
    name: string;
    slug: string | null;
    status: string;
    deviceCount: number;
    boundDevices: number;
    offlineDevices: number;
  }>;
};

export async function getRetailOpsOverview(input?: {
  tenantId?: string;
}): Promise<RetailOpsOverview> {
  const qs = input?.tenantId
    ? `?tenantId=${encodeURIComponent(input.tenantId)}`
    : "";
  return jsonFetch(`${API_BASE}/api/admin/retail-ops/overview${qs}`, {
    method: "GET",
  });
}
