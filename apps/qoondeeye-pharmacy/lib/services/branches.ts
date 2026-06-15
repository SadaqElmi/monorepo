import { getResolvedStoredUser } from "@/lib/auth-client";
import { hasGlobalBranchAccess, normalizeRole } from "@/lib/branch-access";
import { BRANCHES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

function canLoadAllBranchesForConfiguration(): boolean {
  const user = getResolvedStoredUser();
  const role = normalizeRole(user?.role);
  return (
    hasGlobalBranchAccess(role, user?.canViewAllBranches) ||
    role === "manager"
  );
}

export type Branch = {
  id: string;
  name: string | null;
  code?: string | null;
  phone?: string | null;
  address?: string | null;
  /** YYYY-MM-DD; inclusive posting lock for accounting */
  accounting_lock_date?: string | null;
  created_at?: string;
};

/** System branch for consolidation journals — not a pharmacy location. */
export function isConsolidationBranch(branch: Pick<Branch, "name">): boolean {
  return (branch.name ?? "").trim().toLowerCase() === "consolidation";
}

export function filterOperationalBranches(branches: Branch[]): Branch[] {
  return branches.filter((b) => !isConsolidationBranch(b));
}

export async function getBranches(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Branch[]> {
  const rows = await jsonFetch<Branch[]>(BRANCHES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
  return filterOperationalBranches(rows);
}

/** Branch list for configuration forms (staff, POS terminals, etc.). */
export async function getConfigurationBranches(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Branch[]> {
  const rows = await jsonFetch<Branch[]>(BRANCHES_PREFIX, {
    method: "GET",
    headers: {
      "X-Tenant": tenantSlug,
      ...(canLoadAllBranchesForConfiguration() ? { "x-branch-id": "all" } : {}),
    } as JsonHeaders,
    signal: init?.signal,
  });
  return filterOperationalBranches(rows);
}

export async function createBranch(
  tenantSlug: string,
  input: { name?: string; code?: string; phone?: string; address?: string },
) {
  return jsonFetch<Branch>(BRANCHES_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateBranch(
  tenantSlug: string,
  id: string,
  input: {
    name?: string;
    code?: string;
    phone?: string;
    address?: string;
    accountingLockDate?: string | null;
  },
) {
  return jsonFetch<Branch>(`${BRANCHES_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteBranch(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${BRANCHES_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

