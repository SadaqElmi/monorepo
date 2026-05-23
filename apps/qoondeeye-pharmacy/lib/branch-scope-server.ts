import { cache } from "react";
import { cookies } from "next/headers";

import type { AuthCookiePayload } from "@/lib/auth-client";
import {
  ACTIVE_BRANCH_AGGREGATE_COOKIE,
  ACTIVE_BRANCH_ID_COOKIE,
} from "@/lib/branch-cookie";
import { reconcileBranchSelection } from "@/lib/branch-reconcile-core";
import { sanitizeBranchIdForQuery } from "@/lib/branch-scope";

export type ServerBranchScope = {
  branchId: string | undefined;
  aggregateAll: boolean;
  branchHeader: string | undefined;
};

async function resolveServerBranchScope(
  user: AuthCookiePayload,
): Promise<ServerBranchScope> {
  const jar = await cookies();
  const aggregateCookie = jar.get(ACTIVE_BRANCH_AGGREGATE_COOKIE)?.value === "1";
  const branchCookie = jar.get(ACTIVE_BRANCH_ID_COOKIE)?.value?.trim();

  const reconciled = reconcileBranchSelection({
    role: user.role,
    canViewAllBranches: user.canViewAllBranches,
    assignedBranchId: user.assignedBranchId,
    allowedBranchIds: user.allowedBranchIds,
    rawSelection: branchCookie,
    aggregateAllRequested: aggregateCookie,
  });

  const branchId = sanitizeBranchIdForQuery(reconciled.branchId);
  return {
    branchId,
    aggregateAll: reconciled.aggregateAll,
    branchHeader: reconciled.branchHeader,
  };
}

/** Deduped per RSC request for the same user id. */
export const getServerBranchScope = cache(
  async (user: AuthCookiePayload): Promise<ServerBranchScope> =>
    resolveServerBranchScope(user),
);
