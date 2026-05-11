"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { TransferDetailView } from "@/components/features/stock-transfers/transfer-detail-view";
import {
  branchesToMap,
  transferDtoToDetail,
} from "@/components/features/stock-transfers/transfer-mappers";
import type { StockTransferDetail } from "@/components/features/stock-transfers/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getStoredUser } from "@/lib/auth-client";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
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

type DetailBundle = {
  detail: StockTransferDetail;
  events: TransferEventDto[];
};

type TransitionKind =
  | "confirm"
  | "ship"
  | "receive"
  | "requestApproval"
  | "approve"
  | "reject"
  | "reverse";

function optimisticPatchDetail(
  d: StockTransferDetail,
  kind: TransitionKind,
): StockTransferDetail {
  const now = new Date().toISOString();
  switch (kind) {
    case "confirm":
      return { ...d, status: "confirmed", confirmedAt: now };
    case "ship":
      return { ...d, status: "shipped", shippedAt: now };
    case "receive":
      return { ...d, status: "received", receivedAt: now };
    case "requestApproval":
      return { ...d, approvalState: "pending" };
    case "approve":
      return { ...d, approvalState: "approved", approvedAt: now };
    case "reject":
      return { ...d, approvalState: "rejected" };
    case "reverse":
      return { ...d, isReversed: true, reversedAt: now };
    default:
      return d;
  }
}

export function StockTransferDetailContainer({
  transferId,
  receiverView,
}: {
  transferId: string;
  receiverView: boolean;
}) {
  const queryClient = useQueryClient();
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [actorBranchId, setActorBranchId] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<string | null>(null);
  const [branchFacet, setBranchFacet] = useState(() =>
    typeof window !== "undefined" ? getBranchQueryKeyFacet() : "",
  );

  useEffect(() => {
    const u = getStoredUser();
    setTenantSlug(u?.tenantSlug?.trim() || null);
    setActorBranchId(getClientBranchId() ?? null);
    setActorRole(u?.role?.trim()?.toLowerCase() || null);
  }, []);

  useEffect(() => {
    const sync = () => setBranchFacet(getBranchQueryKeyFacet());
    window.addEventListener("storage", sync);
    window.addEventListener("activeBranchChanged", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(
        "activeBranchChanged",
        sync as EventListener,
      );
    };
  }, []);

  const detailQueryKey = [
    "erp",
    "transfers",
    "detail",
    tenantSlug,
    transferId,
    branchFacet,
  ] as const;

  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    enabled: Boolean(tenantSlug && transferId && branchFacet),
    queryFn: async ({ signal }) => {
      const slug = tenantSlug!;
      const [branches, tr, inv] = await Promise.all([
        getBranches(slug, { signal }),
        getTransfer(slug, transferId),
        getInventory(slug, { signal }),
      ]);
      let ev: TransferEventDto[] = [];
      try {
        ev = await getTransferEvents(slug, transferId);
      } catch {
        ev = [];
      }
      const bm = branchesToMap(branches);
      const fromId = tr.from_branch_id;
      const avail = availabilityMapForBranch(fromId, inv);
      const detail = transferDtoToDetail(tr, bm, avail);
      return { detail, events: ev } satisfies DetailBundle;
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async (input: {
      kind: TransitionKind;
      label: string;
      fn: () => Promise<unknown>;
    }) => {
      await input.fn();
      return input.label;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: [...detailQueryKey] });
      const prev = queryClient.getQueryData<DetailBundle>(detailQueryKey);
      if (prev?.detail) {
        queryClient.setQueryData<DetailBundle>(detailQueryKey, {
          ...prev,
          detail: optimisticPatchDetail(prev.detail, input.kind),
        });
      }
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(detailQueryKey, ctx.prev);
      }
      toast.error(err instanceof Error ? err.message : "Request failed");
    },
    onSuccess: (label) => {
      toast.success(label);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["erp", "transfers"] });
    },
  });

  const runTransition = useCallback(
    (kind: TransitionKind, label: string, fn: () => Promise<unknown>) => {
      if (!tenantSlug) return;
      transitionMutation.mutate({ kind, label, fn });
    },
    [tenantSlug, transitionMutation],
  );

  const detail = detailQuery.data?.detail ?? null;
  const events = detailQuery.data?.events ?? [];
  const loading = detailQuery.isPending || detailQuery.isFetching;
  const error = detailQuery.error
    ? detailQuery.error instanceof Error
      ? detailQuery.error.message
      : "Failed to load transfer"
    : null;

  const retry = useCallback(() => {
    void detailQuery.refetch();
  }, [detailQuery]);

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
          <Button type="button" variant="outline" onClick={() => void retry()}>
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
      isMutating={transitionMutation.isPending}
      onConfirm={() =>
        runTransition("confirm", "Order confirmed", () =>
          confirmTransfer(tenantSlug, transferId),
        )
      }
      onShip={() =>
        runTransition("ship", "Shipped", () => shipTransfer(tenantSlug, transferId))
      }
      onReceive={() =>
        runTransition("receive", "Received", () =>
          receiveTransfer(tenantSlug, transferId),
        )
      }
      onRequestApproval={() =>
        runTransition(
          "requestApproval",
          "Approval requested",
          () => requestTransferApproval(tenantSlug, transferId),
        )
      }
      onApprove={() =>
        runTransition("approve", "Approved", () =>
          approveTransfer(tenantSlug, transferId),
        )
      }
      onReject={() =>
        runTransition("reject", "Rejected", () =>
          rejectTransfer(tenantSlug, transferId),
        )
      }
      onReverse={() =>
        runTransition("reverse", "Transfer reversed", () =>
          reverseTransfer(tenantSlug, transferId, "ERP reversal"),
        )
      }
    />
  );
}
