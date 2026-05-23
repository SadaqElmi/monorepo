import { getResolvedStoredUser } from "@/lib/auth-client";
import { reconcileBranchSelection } from "@/lib/branch-reconcile-core";

const GLOBAL_BRANCH_ACCESS_ROLES = new Set(["admin", "owner"]);

export function normalizeRole(role?: string | null): string {
  return role?.trim().toLowerCase() ?? "";
}

export function hasGlobalBranchAccess(
  role?: string | null,
  canViewAllBranches?: boolean | null,
): boolean {
  if (canViewAllBranches === true) return true;
  return GLOBAL_BRANCH_ACCESS_ROLES.has(normalizeRole(role));
}

export function isRestrictedToAssignedBranch(role?: string | null): boolean {
  const user = getResolvedStoredUser();
  const normalized = normalizeRole(role ?? user?.role);
  if (!normalized) return false;
  if (
    hasGlobalBranchAccess(normalized, user?.canViewAllBranches)
  ) {
    return false;
  }
  return true;
}

export function getAssignedBranchIdFromUser(): string | undefined {
  const user = getResolvedStoredUser();
  const assigned = user?.assignedBranchId?.trim();
  return assigned || undefined;
}

export function getEffectiveClientBranchId(): string | undefined {
  const user = getResolvedStoredUser();
  const assigned = getAssignedBranchIdFromUser();
  if (assigned && isRestrictedToAssignedBranch(user?.role)) {
    return assigned;
  }
  try {
    const raw = localStorage.getItem("branchId")?.trim();
    if (!raw || raw.toLowerCase() === "all") return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

/**
 * Value for `x-branch-id` on HTTP requests. When the team switcher is "All branches",
 * returns the literal `all` so the API middleware sets `req.allowedBranchIds` to
 * every tenant branch for reads. Otherwise returns a single branch UUID (or undefined).
 */
export function getClientBranchIdHeaderForApi(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const user = getResolvedStoredUser();
  if (!user) return undefined;

  let raw = "";
  try {
    raw = localStorage.getItem("branchId")?.trim() ?? "";
  } catch {
    return undefined;
  }

  const result = reconcileBranchSelection({
    role: user.role,
    canViewAllBranches: user.canViewAllBranches,
    assignedBranchId: user.assignedBranchId,
    allowedBranchIds: user.allowedBranchIds,
    rawSelection: raw,
    aggregateAllRequested: raw.toLowerCase() === "all",
  });

  return result.branchHeader;
}
