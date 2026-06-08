import { ImportJobDetailClient } from "@/components/features/import/import-job-detail-client";
import { requireServerSession } from "@/lib/auth-server";

export default async function OpeningStockImportJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  await requireServerSession();
  const { jobId } = await params;
  return (
    <ImportJobDetailClient
      jobId={jobId}
      backHref="/inventory/opening-stock/import/history"
      importBackHref="/inventory/opening-stock/import"
      title="Opening stock import job"
      showReverse
    />
  );
}
