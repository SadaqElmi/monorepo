import { cache } from "react";
import { cookies } from "next/headers";

import type { AuthCookiePayload } from "@/lib/auth-client";
import {
  ACTIVE_BRANCH_AGGREGATE_COOKIE,
  ACTIVE_BRANCH_ID_COOKIE,
} from "@/lib/branch-cookie";
import { hasGlobalBranchAccess, normalizeRole } from "@/lib/branch-access";
import { sanitizeBranchIdForQuery } from "@/lib/branch-scope";

export type ServerBranchScope = {
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
  if (hasGlobalBranchAccess(normalized, canViewAllBranches)) return false;
  return true;
}

async function resolveServerBranchScope(
  user: AuthCookiePayload,
): Promise<ServerBranchScope> {
  const jar = await cookies();
  const assigned = user.assignedBranchId?.trim() || undefined;
  const restricted = isRestrictedToAssignedBranch(
    user.role,
    user.canViewAllBranches,
  );

  if (restricted && assigned) {
    return {
      branchId: sanitizeBranchIdForQuery(assigned),
      aggregateAll: false,
      branchHeader: assigned,
    };
  }

  const aggregateCookie = jar.get(ACTIVE_BRANCH_AGGREGATE_COOKIE)?.value === "1";
  const branchCookie = jar.get(ACTIVE_BRANCH_ID_COOKIE)?.value?.trim();

  if (
    aggregateCookie &&
    hasGlobalBranchAccess(user.role, user.canViewAllBranches)
  ) {
    return { branchId: undefined, aggregateAll: true, branchHeader: "all" };
  }

  const branchId = sanitizeBranchIdForQuery(branchCookie) ?? assigned;
  return {
    branchId,
    aggregateAll: false,
    branchHeader: branchId,
  };
}

export const getServerBranchScope = cache(
  async (user: AuthCookiePayload): Promise<ServerBranchScope> =>
    resolveServerBranchScope(user),
);
