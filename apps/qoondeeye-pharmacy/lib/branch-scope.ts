import { getEffectiveClientBranchId } from "@/lib/branch-access";

/**
 * Team switcher stores "all" in localStorage when viewing all branches.
 * APIs that require a single branch must omit branchId / x-branch-id so the
 * backend falls back to the default branch from middleware.
 */
export function sanitizeBranchIdForQuery(
  branchId?: string | null,
): string | undefined {
  const t = branchId?.trim();
  if (!t || t.toLowerCase() === "all") return undefined;
  return t;
}

export function readBranchIdFromStorageForApi(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return sanitizeBranchIdForQuery(getEffectiveClientBranchId());
}
