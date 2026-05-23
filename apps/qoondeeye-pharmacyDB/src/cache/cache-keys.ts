/**
 * Normalizes branch UUIDs for stable cache keys and tag buckets (multi-tenant + branch isolation).
 */
export function normalizeBranchScope(branchIds: readonly string[]): string {
  const unique = [...new Set(branchIds.filter(Boolean))].sort();
  return unique.join(',') || 'none';
}

export function stableCacheKeySegment(
  parts: ReadonlyArray<string | number | boolean | null | undefined>,
): string {
  return parts.map((p) => String(p ?? '')).join('|');
}

/**
 * Catalog cache keys: tenant public id + branch scope + resource (never host-only).
 * Example: tenant:uuid:branch:uuid1,uuid2:products:list
 */
export function catalogListCacheKey(
  tenantId: string,
  branchScope: string,
  resource:
    | 'products'
    | 'products:catalog'
    | 'categories'
    | 'branches'
    | 'roles',
): string {
  return `tenant:${tenantId}:branch:${branchScope}:${resource}:list`;
}
