import AgedPayableReportClient from "@/components/accounting/reports/aged-payable-client";
import { loadReportPageContext } from "@/lib/server-page-props";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await loadReportPageContext(searchParams);
  return <AgedPayableReportClient />;
}
