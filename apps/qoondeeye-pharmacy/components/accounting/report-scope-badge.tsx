"use client";

import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useReportScopeBadge } from "@/hooks/use-branch-for-reports";

export function ReportScopeBadge() {
  const scope = useReportScopeBadge();
  const scopeMessage = scope.isAllBranches
    ? "Showing combined data from all allowed branches"
    : "Showing data for one selected branch";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline">Scope: {scope.label}</Badge>
      <Badge variant="secondary">{scopeMessage}</Badge>
      {scope.adminOverrideWarning ? (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          {scope.adminOverrideWarning}
        </Badge>
      ) : null}
    </div>
  );
}
