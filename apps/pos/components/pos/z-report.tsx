"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { usePos } from "@/components/pos-context";
import { usePosBranchFacet } from "@/hooks/use-pos-branch-facet";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { getZReport } from "@/lib/api";
import {
  closeShiftViaZReport,
  getCurrentPosSession,
} from "@/lib/services/pos-sessions";
import { clearAuthToken } from "@/lib/auth-client";
import { posKeys, POS_STALE_SALES } from "@/lib/pos-query-keys";
import { normalizeZReportPayload } from "@/lib/z-report-payload";
import type { ZReportPayload } from "@/lib/z-report-payload";
import { ShiftReportView } from "@/components/pos/shift-report";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { posToast } from "@/lib/pos-toast";

export type ZReportProps = {
  initialData?: ZReportPayload | null;
  serverPrefetched?: boolean;
  serverError?: string | null;
};

export function ZReport({
  initialData = null,
  serverPrefetched = false,
  serverError = null,
}: ZReportProps) {
  const router = useRouter();
  const { currentUser, posSessionId, posSessionLoading, applyPosSessionFromLogin } =
    usePos();
  const { isOffline } = useOfflineSync(currentUser?.tenantSlug);
  const tenantSlug = currentUser?.tenantSlug?.trim() ?? null;
  const branchFacet = usePosBranchFacet(tenantSlug);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [closedReport, setClosedReport] = React.useState<ZReportPayload | null>(
    null,
  );

  const prefetched: ZReportPayload | undefined =
    serverPrefetched && initialData != null ? initialData : undefined;
  const sessionKey =
    (closedReport?.sessionId ??
      prefetched?.sessionId ??
      posSessionId ??
      "").trim() || "pending";

  const zReportQuery = useQuery({
    queryKey: posKeys.zReport(tenantSlug ?? "", branchFacet, sessionKey),
    enabled: Boolean(tenantSlug && !posSessionLoading && !closedReport),
    initialData: prefetched,
    staleTime: prefetched ? POS_STALE_SALES : 0,
    queryFn: async () => {
      const current = await getCurrentPosSession(tenantSlug!);
      const sessionId = current?.id ?? posSessionId;
      if (!sessionId) {
        throw new Error("No open shift. Sign in again from the register.");
      }
      const raw = await getZReport(tenantSlug!, sessionId);
      const normalized = normalizeZReportPayload(raw);
      if (!normalized) {
        throw new Error("Invalid Z-Report response from server.");
      }
      return normalized;
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!tenantSlug) throw new Error("Missing tenant.");
      const raw = await closeShiftViaZReport(tenantSlug, sessionId);
      const normalized = normalizeZReportPayload(raw);
      if (!normalized) {
        throw new Error("Invalid Z-Report response after close.");
      }
      return normalized;
    },
    onSuccess: (report) => {
      setClosedReport(report);
      applyPosSessionFromLogin(null);
      setConfirmOpen(false);
      posToast.success("Shift closed", "Z-Report generated. Printing…");
      window.setTimeout(() => {
        window.print();
        clearAuthToken();
        router.push("/");
        router.refresh();
      }, 300);
    },
    onError: (e) => {
      posToast.error(
        "Could not close shift",
        e instanceof Error ? e.message : "Try again.",
      );
    },
  });

  const data = closedReport ?? zReportQuery.data ?? null;
  const loading = zReportQuery.isFetching || closeMutation.isPending;

  const clientError =
    zReportQuery.error instanceof Error
      ? zReportQuery.error.message
      : zReportQuery.error
        ? "Could not load Z-Report."
        : null;

  const blockingError = !data
    ? (clientError ??
      (serverPrefetched && serverError?.trim() ? serverError.trim() : null) ??
      (!tenantSlug && !posSessionLoading
        ? "Missing tenant. Sign in again from the register."
        : null))
    : null;

  const showSkeleton =
    !data &&
    (posSessionLoading ||
      zReportQuery.isPending ||
      (zReportQuery.isFetching && !serverPrefetched));

  const handleCloseShift = () => {
    if (isOffline) {
      posToast.warning(
        "Offline",
        "Connect to the network to print Z-Report and close the shift.",
      );
      return;
    }
    const sessionId = posSessionId ?? data?.sessionId;
    if (!sessionId) {
      posToast.warning("No shift", "No active shift to close.");
      return;
    }
    setConfirmOpen(true);
  };

  const confirmClose = () => {
    const sessionId = posSessionId ?? data?.sessionId;
    if (!sessionId) return;
    closeMutation.mutate(sessionId);
  };

  if (showSkeleton) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="text-muted-foreground text-sm">Loading Z-Report…</p>
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
            onClick={() => void zReportQuery.refetch()}
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
  const shiftAlreadyClosed = Boolean(closedReport);

  return (
    <>
      <ShiftReportView
        kind="z"
        data={data}
        staffDisplay={staffDisplay}
        footer={
          <div className="flex flex-col gap-2">
            {!shiftAlreadyClosed ? (
              <Button
                type="button"
                className="w-full"
                variant="default"
                disabled={closeMutation.isPending || isOffline}
                onClick={handleCloseShift}
              >
                {closeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Print Z-Report &amp; Close Shift
              </Button>
            ) : null}
            <Button asChild className="w-full" variant="secondary">
              <Link href="/">Back to register</Link>
            </Button>
          </div>
        }
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close shift?</DialogTitle>
            <DialogDescription>
              This prints the official Z-Report, closes the shift, and logs you
              out. This can only be done once per shift.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={closeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={closeMutation.isPending}
              onClick={confirmClose}
            >
              {closeMutation.isPending ? "Closing…" : "Print Z & Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
