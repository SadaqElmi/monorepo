import { AUTH_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type AuthUser = { id: string; email: string | null; name: string | null };

/** Unified login response: backend decides role and userType */
export type LoginResponse = {
  user: AuthUser;
  token: string;
  userId: string;
  role: "admin" | "pharmacist" | "cashier" | "super_admin" | string;
  tenantId: string | null;
  tenantSlug: string | null;
  userType: "system" | "tenant";
  defaultBranchId: string | null;
  assignedBranchId: string | null;
  allowedBranchIds: string[];
  canViewAllBranches?: boolean;
  permissions?: string[];
};

export type PosDeviceEnrollmentResponse = {
  deviceId: string;
  deviceCode: string;
  displayName?: string | null;
  branchId?: string | null;
  status: "active" | "revoked" | string;
  tenantId: string;
  tenantSlug: string;
  enrolledByUserId: string;
  deviceCredential: string;
};

/** PIN-only POS sign-in (pharmacy slug). Optional staffId scopes login to that staff row. */
export async function pinLogin(
  pin: string,
  tenant: string,
  branchId?: string,
  staffId?: string,
): Promise<LoginResponse> {
  const trimmed = branchId?.trim();
  const resolvedBranchId =
    trimmed && trimmed.toLowerCase() !== "all" ? trimmed : undefined;
  const sid = staffId?.trim();
  return jsonFetch<LoginResponse>(`${AUTH_PREFIX}/pin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pin,
      tenant,
      ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
      ...(sid ? { staffId: sid } : {}),
    }),
  });
}

export async function staffLogin(
  staffId: string,
  pin: string,
  deviceCredential: string,
  branchId?: string,
): Promise<LoginResponse> {
  const trimmed = branchId?.trim();
  const resolvedBranchId =
    trimmed && trimmed.toLowerCase() !== "all" ? trimmed : undefined;
  return jsonFetch<LoginResponse>(`${AUTH_PREFIX}/staff-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      staffId,
      pin,
      deviceCredential,
      ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
    }),
  });
}

export async function enrollPosDevice(input: {
  tenant: string;
  email: string;
  password: string;
  deviceCode?: string;
  displayName?: string;
  branchId?: string;
}): Promise<PosDeviceEnrollmentResponse> {
  return jsonFetch<PosDeviceEnrollmentResponse>(`${AUTH_PREFIX}/pos/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function revokePosDevice(input: {
  tenant: string;
  email: string;
  password: string;
  deviceCode: string;
}) {
  return jsonFetch<{
    deviceId: string;
    deviceCode: string;
    status: string;
    revoked: boolean;
  }>(`${AUTH_PREFIX}/pos/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
