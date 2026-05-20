import { Suspense } from "react";

import { RouteLoading } from "@/components/loading/route-loading";
import DashboardPageContent from "./dashboard-page-content";

export default function DashboardPage() {
  return (
    <Suspense fallback={<RouteLoading variant="section" />}>
      <DashboardPageContent />
    </Suspense>
  );
}
