import { Suspense } from "react";

import { RouteLoading } from "@/components/loading/route-loading";
import StockPageContent from "./stock-page-content";

export default function Page() {
  return (
    <Suspense fallback={<RouteLoading variant="section" />}>
      <StockPageContent />
    </Suspense>
  );
}
