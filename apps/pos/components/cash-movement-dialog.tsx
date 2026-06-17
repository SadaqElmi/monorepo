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
import type { CashMovementType } from "@/lib/services/pos-cash-drawer";
import { createCashMovement } from "@/lib/services/pos-cash-drawer";
import { enqueueCashMovement } from "@/lib/offline/cash-movement-outbox";
import { posToast } from "@/lib/pos-toast";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string;
  sessionId: string;
  branchId: string;
};

export function CashMovementDialog({
  open,
  onOpenChange,
  tenantSlug,
  sessionId,
  branchId,
}: Props) {
  const { isOffline } = useNetworkStatus();
  const { refreshPendingCount } = useOfflineSync(tenantSlug);
  const [movementType, setMovementType] =
    React.useState<CashMovementType>("cash_in");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      posToast.warning("Invalid amount", "Enter a positive amount.");
      return;
    }
    setLoading(true);
    const clientRef = crypto.randomUUID();
    try {
      if (isOffline) {
        await enqueueCashMovement({
          clientRef,
          tenantSlug,
          branchId,
          sessionId,
          movementType,
          amount: n,
          note: note.trim() || undefined,
        });
        await refreshPendingCount();
        posToast.success(
          "Cash movement queued",
          "Will sync when back online.",
        );
      } else {
        await createCashMovement(tenantSlug, sessionId, {
          movementType,
          amount: n,
          note: note.trim() || undefined,
          clientRef,
        });
        posToast.success("Cash movement recorded");
      }
      onOpenChange(false);
      setAmount("");
      setNote("");
    } catch (err) {
      posToast.error(
        "Could not record movement",
        err instanceof Error ? err.message : "Request failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Cash drawer movement</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select
                value={movementType}
                onValueChange={(v) => setMovementType(v as CashMovementType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_in">Cash in</SelectItem>
                  <SelectItem value="cash_out">Cash out</SelectItem>
                  <SelectItem value="safe_drop">Safe drop</SelectItem>
                  <SelectItem value="petty_cash">Petty cash</SelectItem>
                  <SelectItem value="replenishment">Replenishment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cash-amount">Amount</Label>
              <Input
                id="cash-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cash-note">Note</Label>
              <Input
                id="cash-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {isOffline ? "Queue" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
