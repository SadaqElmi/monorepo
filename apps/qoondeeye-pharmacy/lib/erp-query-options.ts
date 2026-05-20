/** Tiered TanStack Query cache timings for ERP. */

/** Products, categories, branches, COA — rarely change within a session. */
export const ERP_STALE_STATIC = 5 * 60_000;

/** Paged lists, dashboard bundle. */
export const ERP_STALE_LIST = 60_000;

/** Financial reports (params in query key). */
export const ERP_STALE_REPORT = 2 * 60_000;

/** Inventory history rows, audit trail pages. */
export const ERP_STALE_HISTORY = 30_000;

export const ERP_GC_TIME = 30 * 60_000;

/** Spread into useQuery / prefetchQuery for consistent cache tiers. */
export const erpQueryOptions = {
  static: { staleTime: ERP_STALE_STATIC, gcTime: ERP_GC_TIME },
  list: { staleTime: ERP_STALE_LIST, gcTime: ERP_GC_TIME },
  report: { staleTime: ERP_STALE_REPORT, gcTime: ERP_GC_TIME },
  history: { staleTime: ERP_STALE_HISTORY, gcTime: ERP_GC_TIME },
} as const;
