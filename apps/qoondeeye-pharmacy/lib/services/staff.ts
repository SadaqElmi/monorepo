import { STAFF_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  branch_id?: string | null;
  created_at?: string;
};

export async function getStaff(tenantSlug: string): Promise<StaffMember[]> {
  return jsonFetch<StaffMember[]>(STAFF_PREFIX, {
    method: "GET",
    headers: {
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
  });
}

export async function createStaff(
  tenantSlug: string,
  input: {
    name?: string;
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
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
      ...(branchScope ? { "x-branch-id": branchScope } : {}),
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateStaff(
  tenantSlug: string,
  id: string,
  input: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    pin?: string;
    branchId?: string;
  },
) {
  const branchScope = input.branchId?.trim();
  return jsonFetch<StaffMember>(`${STAFF_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
      ...(branchScope ? { "x-branch-id": branchScope } : {}),
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteStaff(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${STAFF_PREFIX}/${id}`, {
    method: "DELETE",
    headers: {
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
  });
}

