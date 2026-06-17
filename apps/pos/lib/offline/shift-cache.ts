import { getOfflineDb, type CachedShift } from "./db";

export async function cacheShiftState(
  tenantSlug: string,
  branchId: string,
  shift: CachedShift,
) {
  const db = await getOfflineDb();
  await db.put("shift", {
    tenantSlug,
    branchId,
    ...shift,
    cachedAt: Date.now(),
  });
}

export async function loadCachedShift(
  tenantSlug: string,
): Promise<(CachedShift & { branchId: string }) | null> {
  const db = await getOfflineDb();
  const row = await db.get("shift", tenantSlug);
  if (!row) return null;
  return {
    sessionId: row.sessionId,
    status: row.status,
    openingCash: row.openingCash,
    openedAt: row.openedAt,
    cachedAt: row.cachedAt,
    branchId: row.branchId,
  };
}

export async function clearCachedShift(tenantSlug: string) {
  const db = await getOfflineDb();
  await db.delete("shift", tenantSlug);
}
