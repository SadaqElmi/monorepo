import { getResolvedStoredUser } from "@/lib/auth-client";

const GLOBAL_BRANCH_ACCESS_ROLES = new Set(["admin", "owner"]);

export function normalizeRole(role?: string | null): string {
  return role?.trim().toLowerCase() ?? "";
}

export function hasGlobalBranchAccess(
  role?: string | null,
  canViewAllBranches?: boolean | null,
): boolean {
  if (typeof canViewAllBranches === "boolean") return canViewAllBranches;
  return GLOBAL_BRANCH_ACCESS_ROLES.has(normalizeRole(role));
}

export function isRestrictedToAssignedBranch(role?: string | null): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  if (hasGlobalBranchAccess(normalized, getResolvedStoredUser()?.canViewAllBranches)) {
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
  if (user && isRestrictedToAssignedBranch(user.role)) {
    const assigned = getAssignedBranchIdFromUser();
    if (assigned) return assigned;
    return undefined;
  }
  try {
    const raw = localStorage.getItem("branchId")?.trim();
    if (raw?.toLowerCase() === "all") {
      if (!hasGlobalBranchAccess(user?.role, user?.canViewAllBranches)) {
        return getAssignedBranchIdFromUser();
      }
      return "all";
    }
  } catch {
    /* ignore */
  }
  return getEffectiveClientBranchId();
}
