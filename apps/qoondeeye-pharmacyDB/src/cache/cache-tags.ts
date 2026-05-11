/** Financial / dashboard report caches scoped by tenant schema + branch. */
export function financialBranchTags(
  schemaName: string,
  branchIds: readonly string[],
): string[] {
  const unique = [...new Set(branchIds.filter(Boolean))].sort();
  if (unique.length === 0) {
    return [`financial:${schemaName}:branch:none`];
  }
  return unique.map((b) => `financial:${schemaName}:branch:${b}`);
}

/** Reconciliation read models + log list caches keyed by public tenant id. */
export function reconciliationTenantTags(tenantId: string): string[] {
  return [`reconciliation:${tenantId}`, `reconciliation_logs:${tenantId}`];
}

/**
 * Branch security / access metrics — same per-branch tag pattern as financial caches
 * so mutations can invalidate without scanning keys.
 */
export function branchStatsBranchTags(
  schemaName: string,
  branchIds: readonly string[],
): string[] {
  const unique = [...new Set(branchIds.filter(Boolean))].sort();
  if (unique.length === 0) {
    return [`branch-stats:${schemaName}:branch:none`];
  }
  return unique.map((b) => `branch-stats:${schemaName}:branch:${b}`);
}
