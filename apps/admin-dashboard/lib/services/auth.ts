import { loginSchema, parseInput } from "@repo/validation";

import { AUTH_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
};

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
): Promise<LoginResponse> {
  const body = parseInput(loginSchema, {
    email: email.trim(),
    password,
  });
  return jsonFetch<LoginResponse>(`${AUTH_PREFIX}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
