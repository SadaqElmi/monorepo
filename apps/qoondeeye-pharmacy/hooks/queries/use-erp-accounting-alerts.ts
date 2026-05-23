"use client";

import { useQuery } from "@tanstack/react-query";

import { getStoredUser } from "@/lib/auth-client";
import {
  getReportBranchSnapshot,
  useReportBranchQuery,
} from "@/hooks/use-branch-for-reports";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { getAccountingAlerts } from "@/lib/services/accounting";

export type AccountingAlertStats = {
  total: number;
  critical: number;
  warning: number;
};

function statsFromItems(
  items: { severity: string }[] | undefined,
): AccountingAlertStats {
  const list = items ?? [];
  const critical = list.filter((i) => i.severity === "critical").length;
  const warning = list.filter((i) => i.severity === "warning").length;
  return { total: list.length, critical, warning };
}

export function useErpAccountingAlerts(pollMs = 45_000) {
  const tenantSlug = getStoredUser()?.tenantSlug ?? null;
  const branchFacet = useErpBranchFacet();
  const { branchId, aggregateAll } = useReportBranchQuery();

  const query = useQuery({
    queryKey: erpKeys.accountingAlerts(
      tenantSlug ?? "",
      branchFacet,
      branchId ?? "",
      aggregateAll,
    ),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_LIST,
    refetchInterval: Math.max(10_000, pollMs),
    refetchOnWindowFocus: false,
    queryFn: () => {
      const scope = getReportBranchSnapshot();
      return getAccountingAlerts(
        tenantSlug!,
        scope.branchId,
        scope.aggregateAll,
      );
    },
  });

  const stats = statsFromItems(query.data?.items);

  return {
    stats,
    loading: query.isPending || query.isFetching,
    refresh: () => void query.refetch(),
    query,
  };
}
