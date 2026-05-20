"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { TransferDetailView } from "@/components/features/stock-transfers/transfer-detail-view";
import {
  availabilityMapForBranch,
  branchesToMap,
  transferDtoToDetail,
  type TransferDetailBundle,
} from "@/components/features/stock-transfers/transfer-mappers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RouteLoading } from "@/components/loading/route-loading";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import { transferDetailQueryKey } from "@/lib/transfers-query-keys";
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

type TransitionKind =
  | "confirm"
  | "ship"
  | "receive"
  | "requestApproval"
  | "approve"
  | "reject"
  | "reverse";

function optimisticPatchDetail(
  d: TransferDetailBundle["detail"],
  kind: TransitionKind,
): TransferDetailBundle["detail"] {
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
  tenantSlug: tenantSlugProp,
  initialBranchFacet,
}: {
  transferId: string;
  receiverView: boolean;
  tenantSlug?: string;
  initialBranchFacet?: string;
}) {
  const queryClient = useQueryClient();
  const [tenantSlug, setTenantSlug] = useState(
    () => tenantSlugProp?.trim() || getResolvedStoredUser()?.tenantSlug?.trim() || "",
  );
  const [actorBranchId, setActorBranchId] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<string | null>(null);
  const [branchFacet, setBranchFacet] = useState(
    () => initialBranchFacet ?? (typeof window !== "undefined" ? getBranchQueryKeyFacet() : ""),
  );

  useEffect(() => {
    if (tenantSlugProp?.trim()) {
      setTenantSlug(tenantSlugProp.trim());
      return;
    }
    const u = getResolvedStoredUser();
    setTenantSlug(u?.tenantSlug?.trim() || "");
    setActorBranchId(getClientBranchId() ?? null);
    setActorRole(u?.role?.trim()?.toLowerCase() || null);
  }, [tenantSlugProp]);

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

  const detailQueryKey = transferDetailQueryKey(
    tenantSlug,
    transferId,
    branchFacet,
  );

  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    enabled: Boolean(tenantSlug && transferId && branchFacet),
    queryFn: async ({ signal }) => {
      const slug = tenantSlug;
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
      return { detail, events: ev } satisfies TransferDetailBundle;
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
      const prev = queryClient.getQueryData<TransferDetailBundle>(detailQueryKey);
      if (prev?.detail) {
        queryClient.setQueryData<TransferDetailBundle>(detailQueryKey, {
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
    <Suspense fallback={<RouteLoading variant="section" />}>
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
    </Suspense>
  );
}
