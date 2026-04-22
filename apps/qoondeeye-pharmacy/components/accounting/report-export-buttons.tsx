"use client";

import * as React from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { Button } from "@repo/ui/button";
import { getClientBranchIdHeaderForApi } from "@/lib/branch-access";
import {
  computeReportScopeHash,
  enqueueReportExport,
  getReportExportStatus,
  reportExportDownloadUrl,
  type EnqueueReportExportBody,
} from "@/lib/services/accounting";

type ReportExportButtonsProps = {
  tenantSlug: string;
  reportType: EnqueueReportExportBody["reportType"];
  branchId?: string;
  aggregateAll?: boolean;
  /** Balance sheet export only: multi-branch consolidated view. */
  consolidated?: boolean;
  from?: string;
  to?: string;
  asOf?: string;
  disabled?: boolean;
};

async function downloadExportBlob(
  tenantSlug: string,
  jobId: string,
  format: "pdf" | "xlsx",
): Promise<void> {
  const url = reportExportDownloadUrl(jobId);
  const headers: Record<string, string> = { "X-Tenant": tenantSlug };
  const b = getClientBranchIdHeaderForApi();
  if (b) headers["x-branch-id"] = b;
  const res = await fetch(url, { credentials: "include", headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `report-${jobId.slice(0, 8)}.${format === "pdf" ? "pdf" : "xlsx"}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ReportExportButtons({
  tenantSlug,
  reportType,
  branchId,
  aggregateAll,
  consolidated,
  from,
  to,
  asOf,
  disabled,
}: ReportExportButtonsProps) {
  const [busy, setBusy] = React.useState<"pdf" | "xlsx" | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const scopeHash = React.useMemo(
    () => computeReportScopeHash(branchId, aggregateAll, consolidated),
    [branchId, aggregateAll, consolidated],
  );

  const run = React.useCallback(
    async (format: "pdf" | "xlsx") => {
      setBusy(format);
      setMsg(null);
      try {
        const { id } = await enqueueReportExport(tenantSlug, {
          reportType,
          format,
          from,
          to,
          asOf,
          branchId,
          aggregateAll: aggregateAll ? true : undefined,
          consolidated: consolidated ? true : undefined,
          scopeHash,
        });
        for (let i = 0; i < 90; i += 1) {
          const st = await getReportExportStatus(tenantSlug, id);
          if (st.status === "failed") {
            const tries = `${st.retryCount ?? 0}/${st.maxRetries ?? 3}`;
            throw new Error(
              st.errorMessage
                ? `${st.errorMessage} (attempts ${tries})`
                : `Export failed (attempts ${tries})`,
            );
          }
          if (st.downloadReady) {
            await downloadExportBlob(tenantSlug, id, format);
            return;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        throw new Error("Export timed out; try again later.");
      } catch (e: unknown) {
        setMsg(e instanceof Error ? e.message : "Export failed");
      } finally {
        setBusy(null);
      }
    },
    [
      tenantSlug,
      reportType,
      from,
      to,
      asOf,
      branchId,
      aggregateAll,
      consolidated,
      scopeHash,
    ],
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={disabled || Boolean(busy)}
          onClick={() => void run("pdf")}
        >
          {busy === "pdf" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="mr-1 h-3.5 w-3.5" />
          )}
          PDF
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={disabled || Boolean(busy)}
          onClick={() => void run("xlsx")}
        >
          {busy === "xlsx" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
          )}
          Excel
        </Button>
      </div>
      {msg ? (
        <p className="max-w-xs text-xs text-destructive">{msg}</p>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          Async export; file downloads when ready.
        </p>
      )}
    </div>
  );
}
