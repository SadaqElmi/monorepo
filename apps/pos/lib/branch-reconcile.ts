import { getResolvedStoredUser } from "@/lib/auth-client";
import { syncActiveBranchCookie } from "@/lib/branch-cookie";
import {
  getAssignedBranchIdFromUser,
  hasGlobalBranchAccess,
  isRestrictedToAssignedBranch,
} from "@/lib/branch-access";

export type BranchReconcileResult = {
  branchHeader: string | null;
  changed: boolean;
};

function applyBranch(
  next: string,
  raw: string,
): { branchHeader: string; changed: boolean } {
  if (raw !== next) {
    localStorage.setItem("branchId", next);
    syncActiveBranchCookie(next);
    window.dispatchEvent(new CustomEvent("activeBranchChanged"));
    return { branchHeader: next, changed: true };
  }
  return { branchHeader: next, changed: false };
}

export function reconcileClientBranchSelection(
  validBranchIds?: string[],
): BranchReconcileResult {
  if (typeof window === "undefined") {
    return { branchHeader: null, changed: false };
  }
  const user = getResolvedStoredUser();
  if (!user) return { branchHeader: null, changed: false };

  const assigned = getAssignedBranchIdFromUser();
  const restricted = isRestrictedToAssignedBranch(user.role);
  const canGlobal = hasGlobalBranchAccess(
    user.role,
    user.canViewAllBranches,
  );
  const allowed = (user.allowedBranchIds ?? []).filter(Boolean);

  const pickFallback = (): string | undefined => {
    if (assigned && (!validBranchIds?.length || validBranchIds.includes(assigned))) {
      return assigned;
    }
    if (allowed.length) {
      const inList = validBranchIds?.length
        ? allowed.find((id) => validBranchIds.includes(id))
        : allowed[0];
      return inList;
    }
    if (validBranchIds?.length) return validBranchIds[0];
    return assigned;
  };

  try {
    const raw = localStorage.getItem("branchId")?.trim() ?? "";

    if (restricted && assigned) {
      return applyBranch(assigned, raw);
    }

    if (!canGlobal && raw.toLowerCase() === "all") {
      const fix = pickFallback();
      if (fix) return applyBranch(fix, raw);
      if (raw) {
        localStorage.removeItem("branchId");
        syncActiveBranchCookie("");
        window.dispatchEvent(new CustomEvent("activeBranchChanged"));
        return { branchHeader: null, changed: true };
      }
      return { branchHeader: null, changed: false };
    }

    if (raw && raw.toLowerCase() !== "all") {
      const allowedByJwt =
        allowed.length === 0 || allowed.includes(raw);
      const existsInTenant =
        !validBranchIds?.length || validBranchIds.includes(raw);
      if (!allowedByJwt || !existsInTenant) {
        const fix = pickFallback();
        if (fix) return applyBranch(fix, raw);
      }
      return { branchHeader: raw, changed: false };
    }

    if (!raw && assigned) {
      return applyBranch(assigned, raw);
    }

    if (raw.toLowerCase() === "all" && canGlobal) {
      return { branchHeader: "all", changed: false };
    }
  } catch {
    /* ignore */
  }

  return { branchHeader: null, changed: false };
}
