"use client";

import { useQuery } from "@tanstack/react-query";

import {
  getReportBranchSnapshot,
  type ReportBranchScope,
} from "@/hooks/use-branch-for-reports";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { erpQueryOptions } from "@/lib/erp-query-options";

export function useErpReportQuery<T>(options: {
  reportId: string;
  tenantSlug: string;
  params: unknown;
  queryFn: (scope: ReportBranchScope) => Promise<T>;
  initialData?: T | null;
  enabled?: boolean;
}) {
  const branchFacet = useErpBranchFacet();
  const enabled =
    options.enabled !== false && Boolean(options.tenantSlug && branchFacet);

  return useQuery({
    queryKey: erpKeys.report(
      options.reportId,
      options.tenantSlug,
      branchFacet,
      options.params,
    ),
    queryFn: () => options.queryFn(getReportBranchSnapshot()),
    enabled,
    ...erpQueryOptions.report,
    initialData:
      options.initialData != null ? options.initialData : undefined,
  });
}
