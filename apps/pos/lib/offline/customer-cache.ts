import { getOfflineDb, type CachedCustomer } from "./db";

const MAX_CUSTOMERS = 200;

export async function cacheCustomer(customer: Omit<CachedCustomer, "cachedAt">) {
  const db = await getOfflineDb();
  await db.put("customers", { ...customer, cachedAt: Date.now() });

  const all = await db.getAll("customers");
  if (all.length <= MAX_CUSTOMERS) return;

  const sorted = [...all].sort((a, b) => a.cachedAt - b.cachedAt);
  const excess = sorted.slice(0, all.length - MAX_CUSTOMERS);
  for (const row of excess) {
    await db.delete("customers", row.id);
  }
}

export async function searchCachedCustomers(query: string): Promise<CachedCustomer[]> {
  const db = await getOfflineDb();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await db.getAll("customers");
  return all
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, 20);
}
