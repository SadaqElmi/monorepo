import AgedReceivableReportClient from "@/components/accounting/reports/aged-receivable-client";
import { loadReportPageContext } from "@/lib/server-page-props";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await loadReportPageContext(searchParams);
  return <AgedReceivableReportClient />;
}
