import { Suspense } from "react";

import { RouteLoading } from "@/components/loading/route-loading";
import AccountingPageContent from "./accounting-page-content";

export default function AccountingPage() {
  return (
    <Suspense fallback={<RouteLoading variant="section" />}>
      <AccountingPageContent />
    </Suspense>
  );
}
