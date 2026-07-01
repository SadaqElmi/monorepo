import { Suspense } from "react";

import { RouteLoading } from "@/components/loading/route-loading";
import { requireServerSession } from "@/lib/auth-server";

import JournalsPageContent from "./journals-page-content";

export default async function Page() {
  await requireServerSession();
  return (
    <Suspense fallback={<RouteLoading variant="section" />}>
      <JournalsPageContent />
    </Suspense>
  );
}
