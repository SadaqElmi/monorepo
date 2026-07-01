"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { usePos } from "@/components/pos-context";
import { usePosBranchFacet } from "@/hooks/use-pos-branch-facet";
import { getXReport } from "@/lib/api";
import { getCurrentPosSession } from "@/lib/services/pos-sessions";
import { posKeys } from "@/lib/pos-query-keys";
import { normalizeZReportPayload } from "@/lib/z-report-payload";
import type { ZReportPayload } from "@/lib/z-report-payload";
import { ShiftReportView } from "@/components/pos/shift-report";
import { Button } from "@/components/ui/button";

export type XReportProps = {
  initialData?: ZReportPayload | null;
  serverPrefetched?: boolean;
  serverError?: string | null;
};

export function XReport({
  initialData = null,
  serverPrefetched = false,
  serverError = null,
}: XReportProps) {
  const { currentUser, posSessionId, posSessionLoading } = usePos();
  const tenantSlug = currentUser?.tenantSlug?.trim() ?? null;
  const branchFacet = usePosBranchFacet(tenantSlug);
  const prefetched: ZReportPayload | undefined =
    serverPrefetched && initialData != null ? initialData : undefined;
  const sessionKey =
    (prefetched?.sessionId ?? posSessionId ?? "").trim() || "pending";

  const xReportQuery = useQuery({
    queryKey: posKeys.xReport(tenantSlug ?? "", branchFacet, sessionKey),
    enabled: Boolean(tenantSlug && !posSessionLoading),
    initialData: prefetched,
    staleTime: 0,
    queryFn: async () => {
      const current = await getCurrentPosSession(tenantSlug!);
      const sessionId = current?.id ?? posSessionId;
      if (!sessionId) {
        throw new Error("No open shift. Sign in again from the register.");
      }
      const raw = await getXReport(tenantSlug!, sessionId);
      const normalized = normalizeZReportPayload(raw);
      if (!normalized) {
        throw new Error("Invalid X-Report response from server.");
      }
      return normalized;
    },
  });

  const data = xReportQuery.data ?? null;
  const loading = xReportQuery.isFetching;
  const clientError =
    xReportQuery.error instanceof Error
      ? xReportQuery.error.message
      : xReportQuery.error
        ? "Could not load X-Report."
        : null;

  const blockingError = !data
    ? (clientError ??
      (serverPrefetched && serverError?.trim() ? serverError.trim() : null))
    : null;

  const showSkeleton =
    !data &&
    (posSessionLoading ||
      xReportQuery.isPending ||
      (xReportQuery.isFetching && !serverPrefetched));

  if (showSkeleton) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="text-muted-foreground text-sm">Loading X-Report…</p>
      </div>
    );
  }

  if (blockingError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <p className="max-w-md text-center text-sm text-red-600">
          {blockingError}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => void xReportQuery.refetch()}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to register</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const staffDisplay =
    currentUser?.staffId?.trim() || currentUser?.id?.slice(0, 8) || "—";

  return (
    <ShiftReportView
      kind="x"
      data={data}
      staffDisplay={staffDisplay}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="w-full"
            variant="default"
            onClick={() => window.print()}
          >
            Print X-Report
          </Button>
          <Button asChild className="w-full" variant="secondary">
            <Link href="/">Back to register</Link>
          </Button>
        </div>
      }
    />
  );
}
