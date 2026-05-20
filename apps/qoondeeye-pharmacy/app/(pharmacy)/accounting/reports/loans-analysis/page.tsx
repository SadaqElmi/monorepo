import LoansAnalysisReportClient from "@/components/accounting/reports/loans-analysis-client";
import { loadReportPageContext } from "@/lib/server-page-props";
import { getPatientLoansServer } from "@/lib/services/patient-loans.server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await loadReportPageContext(searchParams);

  let initialLoans = null;
  try {
    initialLoans = await getPatientLoansServer(ctx.tenantSlug);
  } catch {
    /* client refetch */
  }

  return (
    <LoansAnalysisReportClient
      initialLoans={initialLoans}
      serverPrefetched={initialLoans != null}
    />
  );
}
