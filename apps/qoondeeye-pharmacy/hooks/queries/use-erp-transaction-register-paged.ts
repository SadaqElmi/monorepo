"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import {
  getTransactionRegisterPaged,
  type TransactionRegisterListQuery,
} from "@/lib/services/transaction-register";

export function useErpTransactionRegisterPaged(
  tenantSlug: string | null,
  query: TransactionRegisterListQuery,
) {
  const branchFacet = useErpBranchFacet();
  const enabled = Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: [
      ...erpKeys.transactionRegister(
        tenantSlug ?? "",
        branchFacet,
        query.page,
        query.limit,
        {
          branch_id: query.branch_id,
          date_from: query.date_from,
          date_to: query.date_to,
          terminal_id: query.terminal_id,
          staff_id: query.staff_id,
          receipt_no: query.receipt_no,
          transaction_no: query.transaction_no,
          customer_q: query.customer_q,
          transaction_type: query.transaction_type,
          refund_status: query.refund_status,
          statement_id: query.statement_id,
          sort_by: query.sort_by,
          sort_dir: query.sort_dir,
        },
      ),
    ] as const,
    queryFn: ({ signal }) =>
      getTransactionRegisterPaged(tenantSlug!, query, { signal }),
    enabled,
    staleTime: ERP_STALE_LIST,
    placeholderData: keepPreviousData,
  });
}
