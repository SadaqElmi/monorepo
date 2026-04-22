"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { TransferDetailView } from "@/components/features/stock-transfers/transfer-detail-view";
import {
  branchesToMap,
  transferDtoToDetail,
} from "@/components/features/stock-transfers/transfer-mappers";
import type { StockTransferDetail } from "@/components/features/stock-transfers/types";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { getStoredUser } from "@/lib/auth-client";
import { getBranches } from "@/lib/services/branches";
import { getClientBranchId } from "@/lib/services/http";
import { getInventory } from "@/lib/services/inventory";
import type { TransferEventDto } from "@/lib/services/transfers";
import {
  approveTransfer,
  confirmTransfer,
  getTransfer,
  getTransferEvents,
  receiveTransfer,
  rejectTransfer,
  reverseTransfer,
  requestTransferApproval,
  shipTransfer,
} from "@/lib/services/transfers";
import { toast } from "sonner";

function availabilityMapForBranch(
  branchId: string | undefined,
  inventory: { product_id: string | null; branch_id: string | null; quantity: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  if (!branchId) return m;
  for (const row of inventory) {
    if (row.branch_id === branchId && row.product_id) {
      m.set(row.product_id, row.quantity ?? 0);
    }
  }
  return m;
}

export function StockTransferDetailContainer({
  transferId,
  receiverView,
}: {
  transferId: string;
  receiverView: boolean;
}) {
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [actorBranchId, setActorBranchId] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<string | null>(null);
  const [detail, setDetail] = useState<StockTransferDetail | null>(null);
  const [events, setEvents] = useState<TransferEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    setTenantSlug(u?.tenantSlug?.trim() || null);
    setActorBranchId(getClientBranchId() ?? null);
    setActorRole(u?.role?.trim()?.toLowerCase() || null);
  }, []);

  const refresh = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);
    try {
      const [branches, tr, inv] = await Promise.all([
        getBranches(tenantSlug),
        getTransfer(tenantSlug, transferId),
        getInventory(tenantSlug),
      ]);
      let ev: TransferEventDto[] = [];
      try {
        ev = await getTransferEvents(tenantSlug, transferId);
      } catch {
        ev = [];
      }
      const bm = branchesToMap(branches);
      const fromId = tr.from_branch_id;
      const avail = availabilityMapForBranch(fromId, inv);
      setDetail(transferDtoToDetail(tr, bm, avail));
      setEvents(ev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transfer");
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, transferId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runMutation = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      if (!tenantSlug) return;
      setMutating(true);
      try {
        await fn();
        toast.success(label);
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Request failed");
      } finally {
        setMutating(false);
      }
    },
    [tenantSlug, refresh],
  );

  if (!tenantSlug) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Sign in and select a tenant to view transfers.
        </CardContent>
      </Card>
    );
  }

  if (loading && !detail) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm">Loading transfer…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <Card className="mx-auto max-w-lg border-destructive/40">
        <CardContent className="space-y-4 p-8 text-center">
          <p className="text-sm text-destructive">{error ?? "Transfer not found"}</p>
          <Button type="button" variant="outline" onClick={() => void refresh()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <TransferDetailView
      detail={detail}
      receiverView={receiverView}
      actorBranchId={actorBranchId}
      actorRole={actorRole}
      events={events}
      eventsLoading={loading}
      isMutating={mutating}
      onConfirm={() =>
        runMutation("Order confirmed", () => confirmTransfer(tenantSlug, transferId))
      }
      onShip={() => runMutation("Shipped", () => shipTransfer(tenantSlug, transferId))}
      onReceive={() =>
        runMutation("Received", () => receiveTransfer(tenantSlug, transferId))
      }
      onRequestApproval={() =>
        runMutation("Approval requested", () =>
          requestTransferApproval(tenantSlug, transferId),
        )
      }
      onApprove={() =>
        runMutation("Approved", () => approveTransfer(tenantSlug, transferId))
      }
      onReject={() =>
        runMutation("Rejected", () => rejectTransfer(tenantSlug, transferId))
      }
      onReverse={() =>
        runMutation("Transfer reversed", () =>
          reverseTransfer(tenantSlug, transferId, "ERP reversal"),
        )
      }
    />
  );
}
