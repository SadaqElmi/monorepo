import { AUTH_PREFIX } from "./endpoints";
import { authPost, jsonFetch } from "./http";

export type AuthUser = { id: string; email: string | null; name: string | null };
export type AuthResponse = { user: AuthUser; token: string };

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

/** Pharmacy owner register response */
export type RegisterResponse = {
  user: AuthUser;
  token: string;
  userId: string;
  role: string;
  tenantId: string;
  tenantSlug: string;
  userType: "tenant";
  permissions?: string[];
};

export async function login(
  email: string,
  password: string,
  tenant?: string,
): Promise<LoginResponse> {
  return jsonFetch<LoginResponse>(`${AUTH_PREFIX}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, ...(tenant ? { tenant } : {}) }),
  });
}

/** POS sign-in (PIN + pharmacy slug). Optional staffId scopes login to that staff row. */
export async function pinLogin(
  pin: string,
  tenant: string,
  branchId?: string,
  staffId?: string,
): Promise<LoginResponse> {
  // Team switcher persists "all" for all-branches; pin-login DTO only accepts a UUID or omitted field.
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

export async function register(input: {
  pharmacy_name: string;
  owner_name: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<RegisterResponse> {
  return jsonFetch<RegisterResponse>(`${AUTH_PREFIX}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// ----- Legacy (tenant/super-admin) – prefer login() / register() -----

export async function superAdminLogin(email: string, password: string) {
  return authPost<AuthResponse>(`${AUTH_PREFIX}/super-admin/login`, {
    email,
    password,
  });
}

export async function superAdminSignUp(
  email: string,
  password: string,
  name?: string,
) {
  return authPost<AuthResponse>(`${AUTH_PREFIX}/super-admin/signup`, {
    email,
    password,
    ...(name ? { name } : {}),
  });
}

export async function tenantLogin(
  email: string,
  password: string,
  tenantSlug: string,
) {
  return authPost<AuthResponse>(
    `${AUTH_PREFIX}/tenant/login`,
    { email, password },
    { "X-Tenant": tenantSlug },
  );
}

export async function tenantSignUp(
  email: string,
  password: string,
  tenantSlug: string,
  name?: string,
  roleName?: string,
) {
  return authPost<AuthResponse>(
    `${AUTH_PREFIX}/tenant/signup`,
    {
      email,
      password,
      ...(name ? { name } : {}),
      ...(roleName ? { roleName } : {}),
    },
    { "X-Tenant": tenantSlug },
  );
}

