"use client";

import * as React from "react";
import Link from "next/link";
import { getPosDeviceBinding } from "@/lib/device-client";
import { usePos } from "@/components/pos-context";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatShiftTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ShiftBanner() {
  const {
    posSessionId,
    posSessionStatus,
    posSessionOpenedAt,
    posSessionLoading,
    posSessionPaused,
    posSessionConflict,
    currentUser,
    pausePosShift,
    resumePosShift,
  } = usePos();
  const { isOffline, pendingCount } = useOfflineSync(currentUser?.tenantSlug);
  const terminalLabel =
    getPosDeviceBinding()?.displayName?.trim() ||
    getPosDeviceBinding()?.terminalId?.slice(0, 8) ||
    "Terminal";

  if (posSessionConflict) {
    return (
      <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-900">
        {posSessionConflict}
      </div>
    );
  }

  if (posSessionLoading || !posSessionId) return null;

  const staffLabel =
    currentUser?.staffId?.trim() ||
    currentUser?.name?.trim() ||
    currentUser?.id?.slice(0, 8) ||
    "Staff";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs",
        posSessionPaused
          ? "border-amber-500/40 bg-amber-500/10 text-amber-950"
          : "border-emerald-500/30 bg-emerald-500/5 text-slate-800",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-bold uppercase tracking-wide">
          {posSessionPaused ? "Shift locked" : "Shift open"}
        </span>
        <span>
          <span className="text-muted-foreground">Cashier:</span> {staffLabel}
        </span>
        <span>
          <span className="text-muted-foreground">Terminal:</span>{" "}
          {terminalLabel}
        </span>
        <span>
          <span className="text-muted-foreground">Opened:</span>{" "}
          {formatShiftTime(posSessionOpenedAt)}
        </span>
        {isOffline ? (
          <span className="font-semibold text-amber-800">Offline</span>
        ) : null}
        {pendingCount > 0 ? (
          <span className="text-muted-foreground">
            {pendingCount} sale{pendingCount === 1 ? "" : "s"} pending sync
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {posSessionPaused ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 rounded-sm text-xs"
            onClick={() => void resumePosShift()}
          >
            Resume
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 rounded-sm text-xs"
            onClick={() => void pausePosShift()}
          >
            Lock
          </Button>
        )}
        <Button
          asChild
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 rounded-sm text-xs"
        >
          <Link href="/x-report">X-Report</Link>
        </Button>
      </div>
    </div>
  );
}
