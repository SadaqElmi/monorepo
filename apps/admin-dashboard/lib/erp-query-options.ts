/** TanStack Query cache timings for admin dashboard. */

export const ERP_STALE_STATIC = 5 * 60_000;
export const ERP_STALE_LIST = 60_000;
export const ERP_GC_TIME = 30 * 60_000;

export const erpQueryOptions = {
  static: { staleTime: ERP_STALE_STATIC, gcTime: ERP_GC_TIME },
  list: { staleTime: ERP_STALE_LIST, gcTime: ERP_GC_TIME },
} as const;
