import { getResolvedStoredUser } from "@/lib/auth-client";
import { STAFF_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

/** System admins list/manage staff across tenants; never send a branch UUID from another pharmacy. */
function buildStaffRequestHeaders(extra?: JsonHeaders): JsonHeaders {
  const user = getResolvedStoredUser();
  const isSystemAdmin =
    user?.userType === "system" ||
    user?.role?.trim().toLowerCase() === "super_admin";

  return {
    ...(isSystemAdmin ? { "x-branch-id": "all" } : {}),
    ...extra,
  } as JsonHeaders;
}

export type StaffMember = {
  id: string;
  name: string | null;
  staff_id?: string | null;
  email: string | null;
  role: string | null;
  branch_id?: string | null;
  created_at?: string;
};

export async function getStaff(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<StaffMember[]> {
  return jsonFetch<StaffMember[]>(STAFF_PREFIX, {
    method: "GET",
    headers: buildStaffRequestHeaders({
      "X-Tenant": tenantSlug,
    }),
    signal: init?.signal,
  });
}

export async function createStaff(
  tenantSlug: string,
  input: {
    name?: string;
    staffId?: string;
    email?: string;
    password?: string;
    role?: string;
    pin?: string;
    branchId?: string;
  },
) {
  const branchScope = input.branchId?.trim();
  return jsonFetch<StaffMember>(STAFF_PREFIX, {
    method: "POST",
    headers: buildStaffRequestHeaders({
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
      ...(branchScope ? { "x-branch-id": branchScope } : {}),
    }),
    body: JSON.stringify(input),
  });
}

export async function updateStaff(
  tenantSlug: string,
  id: string,
  input: {
    name?: string;
    staffId?: string;
    email?: string;
    password?: string;
    role?: string;
    pin?: string;
    branchId?: string;
    targetTenant?: string;
  },
) {
  const branchScope = input.branchId?.trim();
  return jsonFetch<StaffMember>(`${STAFF_PREFIX}/${id}`, {
    method: "PATCH",
    headers: buildStaffRequestHeaders({
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
      ...(branchScope ? { "x-branch-id": branchScope } : {}),
    }),
    body: JSON.stringify(input),
  });
}

export async function deleteStaff(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${STAFF_PREFIX}/${id}`, {
    method: "DELETE",
    headers: buildStaffRequestHeaders({
      "X-Tenant": tenantSlug,
    }),
  });
}

