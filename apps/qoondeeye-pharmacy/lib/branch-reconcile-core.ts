import { hasGlobalBranchAccess, normalizeRole } from "@/lib/branch-access";

export type BranchReconcileParams = {
  role?: string | null;
  canViewAllBranches?: boolean | null;
  assignedBranchId?: string | null;
  allowedBranchIds?: string[];
  /** Current branch selection (localStorage value or active_branch_id cookie). */
  rawSelection?: string | null;
  /** Whether the aggregate-all-branches cookie/flag is set. */
  aggregateAllRequested?: boolean;
  /** Optional tenant branch list from GET /api/branches. */
  validBranchIds?: string[];
};

export type ReconciledBranchSelection = {
  branchId: string | undefined;
  aggregateAll: boolean;
  branchHeader: string | undefined;
};

function isRestrictedToAssignedBranch(
  role?: string | null,
  canViewAllBranches?: boolean | null,
): boolean {
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  return !hasGlobalBranchAccess(normalized, canViewAllBranches);
}

function pickFallbackBranch(params: BranchReconcileParams): string | undefined {
  const assigned = params.assignedBranchId?.trim() || undefined;
  const allowed = (params.allowedBranchIds ?? []).filter(Boolean);
  const valid = params.validBranchIds;

  if (assigned && (!valid?.length || valid.includes(assigned))) {
    return assigned;
  }
  if (allowed.length) {
    const inList = valid?.length
      ? allowed.find((id) => valid.includes(id))
      : allowed[0];
    return inList;
  }
  if (valid?.length) return valid[0];
  return assigned;
}

/**
 * Pure branch selection reconcile shared by client (localStorage) and server (cookies).
 * Ensures x-branch-id never disagrees with the signed-in user's allowed branches.
 */
export function reconcileBranchSelection(
  params: BranchReconcileParams,
): ReconciledBranchSelection {
  const assigned = params.assignedBranchId?.trim() || undefined;
  const allowed = (params.allowedBranchIds ?? []).filter(Boolean);
  const restricted = isRestrictedToAssignedBranch(
    params.role,
    params.canViewAllBranches,
  );
  const canGlobal = hasGlobalBranchAccess(
    params.role,
    params.canViewAllBranches,
  );
  const pickFallback = () => pickFallbackBranch(params);

  if (restricted && assigned) {
    return {
      branchId: assigned,
      aggregateAll: false,
      branchHeader: assigned,
    };
  }

  if (params.aggregateAllRequested && canGlobal) {
    return { branchId: undefined, aggregateAll: true, branchHeader: "all" };
  }

  const raw = params.rawSelection?.trim() ?? "";

  if (!canGlobal && raw.toLowerCase() === "all") {
    const fix = pickFallback();
    if (fix) {
      return { branchId: fix, aggregateAll: false, branchHeader: fix };
    }
    return {
      branchId: undefined,
      aggregateAll: false,
      branchHeader: undefined,
    };
  }

  if (raw && raw.toLowerCase() !== "all") {
    const allowedByUser = allowed.length === 0 || allowed.includes(raw);
    const existsInTenant =
      !params.validBranchIds?.length || params.validBranchIds.includes(raw);
    if (allowedByUser && existsInTenant) {
      return { branchId: raw, aggregateAll: false, branchHeader: raw };
    }
    const fix = pickFallback();
    if (fix) {
      return { branchId: fix, aggregateAll: false, branchHeader: fix };
    }
    return {
      branchId: undefined,
      aggregateAll: false,
      branchHeader: undefined,
    };
  }

  if (!raw && assigned) {
    return {
      branchId: assigned,
      aggregateAll: false,
      branchHeader: assigned,
    };
  }

  if (raw.toLowerCase() === "all" && canGlobal) {
    return { branchId: undefined, aggregateAll: true, branchHeader: "all" };
  }

  const fix = pickFallback();
  return {
    branchId: fix,
    aggregateAll: false,
    branchHeader: fix,
  };
}
