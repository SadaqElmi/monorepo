import { parseInput, posSetupSchema, staffLoginSchema } from "@/lib/validation";



import { AUTH_PREFIX, POS_DEVICE_STATUS_PATH } from "./endpoints";

import { jsonFetch } from "./http";

import { getOrCreateDeviceFingerprint, getPosServerUrl } from "../device-client";



export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  staffId?: string | null;
};



/** Unified login response: backend decides role and userType */

export type LoginResponse = {
  user: AuthUser;
  token: string;
  refreshToken?: string;
  expiresIn?: number;
  userId: string;

  role: "admin" | "pharmacist" | "cashier" | "super_admin" | string;

  tenantId: string | null;

  tenantSlug: string | null;

  userType: "system" | "tenant";

  defaultBranchId: string | null;

  assignedBranchId: string | null;

  allowedBranchIds: string[];

  canViewAllBranches?: boolean;
  staffId?: string | null;
  permissions?: string[];
  posSession?: {
    id: string;
    branch_id: string;
    device_id: string | null;
    staff_user_id: string | null;
    status: string;
    opened_at: string;
    closed_at: string | null;
    opening_cash: number;
  } | null;
};



export type PosTerminalSetupResponse = {

  deviceCredential: string;

  deviceId: string;

  terminalId: string;

  tenantId: string;

  tenantSlug: string;

  branchId: string | null;

  displayName: string | null;

  status: string;

};



export async function staffLogin(

  staffId: string,

  pin: string,

  deviceCredential: string,

  branchId?: string,

): Promise<LoginResponse> {

  const trimmed = branchId?.trim();

  const resolvedBranchId =

    trimmed && trimmed.toLowerCase() !== "all" ? trimmed : undefined;

  const body = parseInput(staffLoginSchema, {

    staffId: staffId.trim(),

    pin,

    deviceCredential,

    ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),

  });

  return jsonFetch<LoginResponse>(`${AUTH_PREFIX}/staff-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function refreshPosSession(
  refreshToken: string,
  tenantSlug: string,
  deviceCredential: string,
): Promise<{ token: string; refreshToken: string; expiresIn: number }> {
  return jsonFetch(`${AUTH_PREFIX}/pos/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken, tenantSlug, deviceCredential }),
    _skipRefresh: true,
  });
}



export type PosDeviceStatusResponse = {
  ok: boolean;
  reason: "missing" | "revoked" | "inactive" | "invalid" | null;
  status: string | null;
  bindingStatus: string | null;
  displayName: string | null;
  branchId: string | null;
  tenantSlug: string | null;
};

export async function checkPosDeviceStatus(
  deviceCredential: string,
): Promise<PosDeviceStatusResponse> {
  const serverUrl = getPosServerUrl().replace(/\/$/, "");
  const url = serverUrl.endsWith("/api/auth/pos/device-status")
    ? serverUrl
    : `${serverUrl}/api/auth/pos/device-status`;
  return jsonFetch<PosDeviceStatusResponse>(url, {
    method: "GET",
    headers: {
      "X-Pos-Device-Credential": deviceCredential.trim(),
    },
  });
}

export async function setupPosTerminal(input: {

  terminalUsername: string;

  password: string;

  tenantCode?: string;

  serverUrl?: string;

  deviceFingerprint?: string;

}): Promise<PosTerminalSetupResponse> {

  const serverUrl = (input.serverUrl?.trim() || getPosServerUrl()).replace(

    /\/$/,

    "",

  );

  const body = parseInput(posSetupSchema, {

    terminalUsername: input.terminalUsername.trim(),

    password: input.password,

    tenantCode: input.tenantCode?.trim() ?? "",

    deviceFingerprint:

      input.deviceFingerprint?.trim() || getOrCreateDeviceFingerprint(),

  });

  const url = serverUrl.endsWith("/api/auth/pos/setup")

    ? serverUrl

    : `${serverUrl}/api/auth/pos/setup`;

  return jsonFetch<PosTerminalSetupResponse>(url, {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify(body),

  });

}

