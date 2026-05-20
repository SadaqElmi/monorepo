/** TanStack Query keys for POS. */

export const posKeys = {
  catalog: (tenant: string, facet: string) =>
    ["pos", "catalog", tenant, facet] as const,
  sales: (tenant: string, facet: string, page: number, limit: number) =>
    ["pos", "sales", tenant, facet, page, limit] as const,
  session: (tenant: string, facet: string) =>
    ["pos", "session", tenant, facet] as const,
  zReport: (tenant: string, facet: string, sessionId: string) =>
    ["pos", "z-report", tenant, facet, sessionId] as const,
} as const;

/** Catalog products, batches, categories — warm after login. */
export const POS_STALE_CATALOG = 5 * 60_000;

export const POS_STALE_SALES = 60_000;

export const POS_GC_TIME = 30 * 60_000;
