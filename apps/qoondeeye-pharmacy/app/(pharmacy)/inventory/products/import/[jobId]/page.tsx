import { requireServerSession } from "@/lib/auth-server";

import { ImportJobDetailClient } from "./import-job-detail-client";

type Props = {
  params: Promise<{ jobId: string }>;
};

export default async function Page({ params }: Props) {
  await requireServerSession();
  const { jobId } = await params;
  return <ImportJobDetailClient jobId={jobId} />;
}
