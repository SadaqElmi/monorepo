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

/** Product/category list caches — public tenant id + branch for targeted invalidation. */
export function catalogBranchTags(
  tenantId: string,
  branchIds: readonly string[],
): string[] {
  const unique = [...new Set(branchIds.filter(Boolean))].sort();
  if (unique.length === 0) {
    return [`tenant:${tenantId}:branch:none:catalog`];
  }
  return unique.map((b) => `tenant:${tenantId}:branch:${b}:catalog`);
}

/** Tenant-wide catalog (roles, full tenant product catalog, branches list). */
export function catalogTenantTags(tenantId: string): string[] {
  return [`tenant:${tenantId}:catalog`];
}
