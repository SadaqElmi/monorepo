import "server-only";

import type { ServerBranchScope } from "@/lib/branch-scope-server";

/** Mirrors client `getBranchQueryKeyFacet()` for TanStack Query key alignment. */
export function getServerBranchQueryKeyFacet(scope: ServerBranchScope): string {
  const header = scope.branchHeader ?? "none";
  const eff = scope.branchId ?? "none";
  return `${header}|${eff}`;
}
