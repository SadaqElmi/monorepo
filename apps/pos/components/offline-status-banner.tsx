"use client";

import * as React from "react";
import { CloudOff, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { usePos } from "@/components/pos-context";
import { PendingApprovalDialog } from "@/components/pending-approval-dialog";

export function OfflineStatusBanner() {
  const { currentUser } = usePos();
  const {
    isOffline,
    pendingCount,
    pendingApprovalCount,
    pendingCashCount,
    syncing,
    syncNow,
    refreshPendingCount,
  } = useOfflineSync(currentUser?.tenantSlug);
  const [approvalOpen, setApprovalOpen] = React.useState(false);

  if (!isOffline && pendingCount === 0) return null;

  const syncableCount = pendingCount - pendingApprovalCount;

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-950 dark:text-amber-100">
        <div className="flex flex-wrap items-center gap-2">
          <CloudOff className="size-3.5 shrink-0" />
          <span>
            {isOffline
              ? "Offline mode — sales queue locally"
              : "Pending sync"}
            {pendingCount > 0 ? ` (${pendingCount})` : ""}
          </span>
          {pendingApprovalCount > 0 ? (
            <span className="flex items-center gap-1 font-semibold text-amber-900">
              <ShieldAlert className="size-3" />
              {pendingApprovalCount} awaiting supervisor approval
            </span>
          ) : null}
          {pendingCashCount > 0 ? (
            <span className="text-muted-foreground">
              {pendingCashCount} cash movement{pendingCashCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {pendingApprovalCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setApprovalOpen(true)}
            >
              Approve sales
            </Button>
          ) : null}
          {!isOffline && syncableCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={syncing}
              onClick={() => void syncNow()}
            >
              <RefreshCw
                className={`mr-1 size-3 ${syncing ? "animate-spin" : ""}`}
              />
              Sync now
            </Button>
          ) : null}
        </div>
      </div>
      {currentUser?.tenantSlug ? (
        <PendingApprovalDialog
          open={approvalOpen}
          onOpenChange={setApprovalOpen}
          tenantSlug={currentUser.tenantSlug}
          onApproved={() => void refreshPendingCount()}
        />
      ) : null}
    </>
  );
}
