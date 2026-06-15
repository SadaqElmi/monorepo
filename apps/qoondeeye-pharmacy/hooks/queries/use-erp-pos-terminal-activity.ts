"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { getPosTerminalActivity } from "@/lib/services/pos-terminals";

export function useErpPosTerminalActivity(
  tenantSlug: string | null,
  terminalId: string | null,
  query?: { page?: number; limit?: number },
) {
  const page = query?.page ?? 1;
  const limit = query?.limit ?? 20;

  return useQuery({
    queryKey: erpKeys.posTerminalActivity(
      tenantSlug ?? "",
      terminalId ?? "",
      page,
    ),
    queryFn: ({ signal }) =>
      getPosTerminalActivity(tenantSlug!, terminalId!, {
        page,
        limit,
        signal,
      }),
    enabled: Boolean(tenantSlug && terminalId),
    staleTime: ERP_STALE_LIST,
    placeholderData: keepPreviousData,
  });
}
