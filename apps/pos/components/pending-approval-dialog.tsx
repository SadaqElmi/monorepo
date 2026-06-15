"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SupervisorPinDialog } from "@/features/approvals/ui/supervisor-pin-dialog";
import {
  listPendingApprovalOutbox,
  promoteOutboxWithApproval,
} from "@/lib/offline/outbox";
import { formatMoney } from "@/shared/lib";
import { posToast } from "@/lib/pos-toast";
import { useOfflineSync } from "@/hooks/use-offline-sync";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  onApproved?: () => void;
};

export function PendingApprovalDialog({
  open,
  onOpenChange,
  tenantSlug,
  onApproved,
}: Props) {
  const { syncNow } = useOfflineSync(tenantSlug);
  const [items, setItems] = React.useState<
    Awaited<ReturnType<typeof listPendingApprovalOutbox>>
  >([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedRef, setSelectedRef] = React.useState<string | null>(null);
  const [pinOpen, setPinOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    void listPendingApprovalOutbox()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [open]);

  const handleApproved = async (approvalId?: string) => {
    if (!selectedRef || !approvalId) return;
    const promoted = await promoteOutboxWithApproval(selectedRef, approvalId);
    if (!promoted) {
      posToast.error("Could not approve sale", "Sale may have already been processed.");
      return;
    }
    posToast.success("Sale approved for sync");
    setPinOpen(false);
    setSelectedRef(null);
    const next = await listPendingApprovalOutbox();
    setItems(next);
    onApproved?.();
    if (next.length === 0) onOpenChange(false);
    void syncNow();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Offline sales awaiting approval</DialogTitle>
          </DialogHeader>
          {loading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No sales waiting for supervisor approval.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.clientSaleRef}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-mono font-medium">
                      {item.localReceiptId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Total {formatMoney(item.body.totalAmount ?? 0)} · discount{" "}
                      {formatMoney(item.body.discount ?? 0)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setSelectedRef(item.clientSaleRef);
                      setPinOpen(true);
                    }}
                  >
                    Approve
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SupervisorPinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        tenantSlug={tenantSlug}
        title="Approve offline discount"
        approvalRequest={{
          actionType: "large_discount",
          payload: {
            clientSaleRef: selectedRef ?? undefined,
            offline: true,
          },
        }}
        onApproved={({ approvalId }) => void handleApproved(approvalId)}
      />
    </>
  );
}
