/** Catalog list cache TTL (ms). Clamped to 30–60s per safety rules. */
export function resolveCatalogCacheTtlMs(): number {
  const raw = Number(process.env.CACHE_CATALOG_TTL_MS);
  const pick = Number.isFinite(raw) && raw > 0 ? raw : 45_000;
  return Math.min(60_000, Math.max(30_000, pick));
}

/** Roles/permissions list cache TTL (ms). */
export function resolveRolesCacheTtlMs(): number {
  const raw = Number(process.env.CACHE_ROLES_TTL_MS);
  const pick = Number.isFinite(raw) && raw > 0 ? raw : 300_000;
  return Math.min(600_000, Math.max(30_000, pick));
}
