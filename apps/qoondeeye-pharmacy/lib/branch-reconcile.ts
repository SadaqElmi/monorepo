import { getResolvedStoredUser } from "@/lib/auth-client";
import { syncActiveBranchCookie } from "@/lib/branch-cookie";
import { getAssignedBranchIdFromUser } from "@/lib/branch-access";
import { reconcileBranchSelection } from "@/lib/branch-reconcile-core";

export type BranchReconcileResult = {
  branchHeader: string | null;
  /** True when localStorage/cookie branch selection was updated. */
  changed: boolean;
};

/**
 * Align localStorage `branchId` with the signed-in user so API `x-branch-id`
 * never disagrees with the server (fixes "Access denied to this branch").
 */
export function reconcileClientBranchSelection(
  validBranchIds?: string[],
): BranchReconcileResult {
  if (typeof window === "undefined") {
    return { branchHeader: null, changed: false };
  }
  const user = getResolvedStoredUser();
  if (!user) return { branchHeader: null, changed: false };

  let raw = "";
  try {
    raw = localStorage.getItem("branchId")?.trim() ?? "";
  } catch {
    return { branchHeader: null, changed: false };
  }

  const result = reconcileBranchSelection({
    role: user.role,
    canViewAllBranches: user.canViewAllBranches,
    assignedBranchId: getAssignedBranchIdFromUser(),
    allowedBranchIds: user.allowedBranchIds,
    rawSelection: raw,
    aggregateAllRequested: raw.toLowerCase() === "all",
    validBranchIds,
  });

  let changed = false;

  try {
    const header = result.branchHeader;
    if (header === "all") {
      if (raw !== "all") {
        localStorage.setItem("branchId", "all");
        syncActiveBranchCookie("all");
        window.dispatchEvent(new CustomEvent("activeBranchChanged"));
        changed = true;
      }
      return { branchHeader: "all", changed };
    }

    if (header) {
      if (raw !== header) {
        localStorage.setItem("branchId", header);
        syncActiveBranchCookie(header);
        window.dispatchEvent(new CustomEvent("activeBranchChanged"));
        changed = true;
      }
      return { branchHeader: header, changed };
    }

    if (raw) {
      localStorage.removeItem("branchId");
      syncActiveBranchCookie("");
      window.dispatchEvent(new CustomEvent("activeBranchChanged"));
      changed = true;
    }
  } catch {
    /* ignore */
  }

  return { branchHeader: result.branchHeader ?? null, changed };
}
