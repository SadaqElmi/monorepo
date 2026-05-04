"use client";

import { Badge } from "@/components/ui/badge";
import type { ReportStatus } from "@/lib/services/accounting";

export function ReportCertificationBadge({
  reportStatus,
}: {
  reportStatus?: ReportStatus;
}) {
  const status = reportStatus ?? "WARNING";
  if (status === "CLEAN") {
    return <Badge className="bg-emerald-600 text-white">Certified</Badge>;
  }
  if (status === "CRITICAL") {
    return <Badge variant="destructive">Not Reliable</Badge>;
  }
  return (
    <Badge variant="secondary" className="bg-amber-700 text-amber-50">
      Warning
    </Badge>
  );
}
