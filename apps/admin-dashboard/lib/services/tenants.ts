import {
  ADMIN_AUDIT_LOGS_PREFIX,
  TENANTS_PREFIX,
} from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type TenantStatus =
  | "pending_setup"
  | "active"
  | "suspended"
  | "inactive"
  | "provisioning_failed"
  | "migration_failed";

export type Tenant = {
  id: string;
  name: string;
  schemaName: string;
  slug?: string | null;
  status: TenantStatus;
  ownerName?: string | null;
  ownerEmail?: string | null;
  provisioningStatus?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  hasDatabaseUrl: boolean;
  databaseName?: string | null;
  databaseHealthStatus: string;
  migrationStatus: string;
  storageUsed: number;
  posTerminalCount: number;
  lastBackupAt?: string | null;
};

export type TenantHealth = {
  tenantId: string;
  tenantName: string;
  slug: string;
  status: TenantStatus | string;
  hasDatabaseUrl: boolean;
  databaseConnection: "connected" | "failed" | "not_configured";
  migrationStatus: "up_to_date" | "pending" | "failed" | "unknown";
  lastLoginAt?: string | null;
  storageUsed: number;
  posTerminalCount: number;
  lastBackupAt?: string | null;
  errors: string[];
};

export type CreateTenantResult = Tenant & {
  temporaryOwnerPassword: string;
};

export type TenantBackupResult = {
  jobId: string;
  tenantId: string;
  status: "accepted";
  mode: "audit_only";
  requestedAt: string;
};

export type PosTerminalSummary = {
  id: string;
  displayName: string | null;
  terminalUsername: string | null;
  status: string;
  bindingStatus: string;
  branchId: string | null;
  lastSeenAt: string | null;
  lastHeartbeatAt: string | null;
  pendingOutboxCount: number;
};

export type AdminAuditLog = {
  id: string;
  adminUserId: string | null;
  action: string;
  tenantId: string | null;
  result: "success" | "failure" | string;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  payload: unknown;
  createdAt: string;
};

export type TenantListResult = {
  items: Tenant[];
  total: number;
  limit: number;
  offset: number;
};

const TENANT_LIST_MAX_PAGE_SIZE = 100;

export async function getTenants(input?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<TenantListResult> {
  const params = new URLSearchParams();
  if (input?.limit != null) params.set("limit", String(input.limit));
  if (input?.offset != null) params.set("offset", String(input.offset));
  if (input?.search?.trim()) params.set("search", input.search.trim());
  const qs = params.toString();
  return jsonFetch<TenantListResult>(
    `${TENANTS_PREFIX}${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

export async function getAllTenants(input?: {
  search?: string;
}): Promise<Tenant[]> {
  const items: Tenant[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await getTenants({
      limit: TENANT_LIST_MAX_PAGE_SIZE,
      offset,
      search: input?.search,
    });
    items.push(...page.items);
    total = page.total;
    offset += page.items.length;
    if (page.items.length === 0) break;
  }

  return items;
}

export async function getTenant(id: string): Promise<Tenant> {
  return jsonFetch<Tenant>(`${TENANTS_PREFIX}/${id}`, { method: "GET" });
}

export async function createTenant(input: {
  name: string;
  ownerName: string;
  ownerEmail: string;
  domain?: string;
  schemaName?: string;
  slug?: string;
  subdomain?: string;
  customDomain?: string;
  domains?: string[];
}) {
  return jsonFetch<CreateTenantResult>(TENANTS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export type ActivateTenantResult = Tenant & {
  temporaryOwnerPassword?: string;
};

export type AssignTenantOwnerResult = Tenant & {
  temporaryOwnerPassword?: string;
};

export async function assignTenantOwner(
  id: string,
  input: { ownerName: string; ownerEmail: string },
) {
  return jsonFetch<AssignTenantOwnerResult>(`${TENANTS_PREFIX}/${id}/owner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function clearTenantOwner(id: string) {
  return jsonFetch<Tenant>(`${TENANTS_PREFIX}/${id}/owner`, {
    method: "DELETE",
  });
}

export async function activateTenant(
  id: string,
  input?: { ownerName?: string; ownerEmail?: string },
) {
  return jsonFetch<ActivateTenantResult>(`${TENANTS_PREFIX}/${id}/activate`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    } as JsonHeaders,
    body: JSON.stringify(input ?? {}),
  });
}

export async function suspendTenant(id: string) {
  return jsonFetch<Tenant>(`${TENANTS_PREFIX}/${id}/suspend`, {
    method: "PATCH",
  });
}

export async function markTenantInactive(id: string) {
  return jsonFetch<Tenant>(`${TENANTS_PREFIX}/${id}/inactive`, {
    method: "PATCH",
  });
}

export async function runTenantMigration(id: string) {
  return jsonFetch<Tenant>(`${TENANTS_PREFIX}/${id}/run-migration`, {
    method: "POST",
  });
}

export async function getTenantHealth(id: string) {
  return jsonFetch<TenantHealth>(`${TENANTS_PREFIX}/${id}/health`, {
    method: "GET",
  });
}

export async function createTenantBackup(id: string) {
  return jsonFetch<TenantBackupResult>(`${TENANTS_PREFIX}/${id}/backup`, {
    method: "POST",
  });
}

export async function getTenantStorage(id: string) {
  return jsonFetch<{
    tenantId: string;
    storageUsed: number;
    databaseConnection: string;
  }>(`${TENANTS_PREFIX}/${id}/storage`, { method: "GET" });
}

export async function getTenantLoginSummary(id: string) {
  return jsonFetch<{
    tenantId: string;
    lastLoginAt: string | null;
    status: string;
  }>(`${TENANTS_PREFIX}/${id}/login-summary`, { method: "GET" });
}

export async function getTenantPosTerminals(id: string) {
  return jsonFetch<PosTerminalSummary[]>(
    `${TENANTS_PREFIX}/${id}/pos-terminals`,
    { method: "GET" },
  );
}

export async function revokePosTerminalBinding(
  tenantId: string,
  terminalId: string,
) {
  return jsonFetch<{ ok: boolean }>(
    `${TENANTS_PREFIX}/${tenantId}/pos-terminals/${terminalId}/revoke-binding`,
    { method: "POST" },
  );
}

export async function resetPosTerminalBinding(
  tenantId: string,
  terminalId: string,
) {
  return jsonFetch<{ ok: boolean }>(
    `${TENANTS_PREFIX}/${tenantId}/pos-terminals/${terminalId}/reset-binding`,
    { method: "POST" },
  );
}

export async function getAdminAuditLogs(input?: {
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (input?.limit) params.set("limit", String(input.limit));
  if (input?.offset) params.set("offset", String(input.offset));
  const qs = params.toString();
  return jsonFetch<AdminAuditLog[]>(
    `${ADMIN_AUDIT_LOGS_PREFIX}${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}
