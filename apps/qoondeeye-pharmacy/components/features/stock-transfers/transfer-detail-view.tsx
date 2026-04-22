"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Lock,
  Package,
  Pencil,
  Shield,
  Truck,
  Undo2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import type { TransferEventDto } from "@/lib/services/transfers";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { TransferActivityTimeline } from "./transfer-activity-timeline";
import type { StockTransferDetail } from "./types";
import {
  canApproveOrReject,
  canConfirm,
  canReceive,
  canReverse,
  canRequestApproval,
  canShip,
  isTransferLocked,
  phaseLabelForStatus,
  transferStatusIndex,
  TRANSFER_STATUS_ORDER,
} from "./transfer-rules";
import { TransferStatusBadge } from "./transfer-status-badge";

function formatAuditDateTime(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function LifecycleRail({ status }: { status: StockTransferDetail["status"] }) {
  const idx = transferStatusIndex(status);
  const labels: Record<StockTransferDetail["status"], string> = {
    draft: "Draft — no stock move",
    confirmed: "Order — still no stock move",
    shipped: "Ship — stock OUT @ source",
    received: "Receive — stock IN @ dest",
    closed: "Closed — lifecycle complete",
  };

  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {TRANSFER_STATUS_ORDER.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div
            key={s}
            className={cn(
              "flex items-start gap-2 rounded-xl border p-3 text-left text-xs",
              done && "border-primary/20 bg-primary/5",
              active && "border-primary bg-primary/10 ring-1 ring-primary/20",
              !done &&
                !active &&
                "border-border/60 bg-muted/20 text-muted-foreground",
            )}
          >
            {done ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : active ? (
              <Circle className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 opacity-40" />
            )}
            <div>
              <p className="font-bold capitalize">{s}</p>
              <p className="mt-0.5 text-[10px] leading-snug opacity-90">
                {labels[s]}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TransferDetailView({
  detail,
  receiverView = false,
  actorBranchId,
  actorRole,
  events = [],
  eventsLoading = false,
  isMutating = false,
  onConfirm,
  onShip,
  onReceive,
  onRequestApproval,
  onApprove,
  onReject,
  onReverse,
}: {
  detail: StockTransferDetail;
  receiverView?: boolean;
  /** Current branch scope (localStorage branchId) for receive eligibility */
  actorBranchId?: string | null;
  actorRole?: string | null;
  events?: TransferEventDto[];
  eventsLoading?: boolean;
  isMutating?: boolean;
  onConfirm?: () => void | Promise<void>;
  onShip?: () => void | Promise<void>;
  onReceive?: () => void | Promise<void>;
  onRequestApproval?: () => void | Promise<void>;
  onApprove?: () => void | Promise<void>;
  onReject?: () => void | Promise<void>;
  onReverse?: () => void | Promise<void>;
}) {
  const locked = isTransferLocked(detail.status);
  const processingLocked = Boolean(detail.processingLockUntil);
  const actionDisabled = isMutating || processingLocked;
  const phase = phaseLabelForStatus(detail.status);
  const approval = detail.approvalState;

  const listHref = receiverView
    ? ROUTES.inventory.transfersIncoming
    : ROUTES.inventory.transfers;

  const showSenderActions = !receiverView;
  const canRecv =
    receiverView &&
    canReceive(detail.status, detail.isReversed) &&
    Boolean(actorBranchId) &&
    Boolean(detail.toBranchId) &&
    detail.toBranchId === actorBranchId;

  const wrongReceiveBranch =
    receiverView &&
    detail.status === "shipped" &&
    !detail.isReversed &&
    Boolean(actorBranchId) &&
    Boolean(detail.toBranchId) &&
    detail.toBranchId !== actorBranchId;

  const editHref = `${ROUTES.inventory.transfersNew}?edit=${encodeURIComponent(detail.id)}`;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="text-[10px] font-bold uppercase"
            >
              {phase}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {detail.displayId}
            </span>
            {approval && approval !== "none" ? (
              <Badge variant="outline" className="text-[10px] uppercase">
                Approval: {approval}
              </Badge>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Transfer details
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.fromBranch} → {detail.toBranch}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild disabled={actionDisabled}>
            <Link href={listHref}>
              {receiverView ? "Back to incoming" : "Back to list"}
            </Link>
          </Button>

          {canRecv && onReceive ? (
            <Button
              className="gap-2 shadow-md shadow-primary/15"
              disabled={actionDisabled}
              onClick={() => void onReceive()}
            >
              <CheckCircle2 className="size-4" />
              Accept / Receive
            </Button>
          ) : null}

          {showSenderActions && canConfirm(detail.status) && onConfirm ? (
            <>
              <Button
                variant="outline"
                className="gap-2"
                asChild
                disabled={actionDisabled}
              >
                <Link href={editHref}>
                  <Pencil className="size-4" />
                  Edit (full)
                </Link>
              </Button>
              <Button
                className="gap-2 shadow-md shadow-primary/15"
                disabled={actionDisabled}
                onClick={() => void onConfirm()}
              >
                <CheckCircle2 className="size-4" />
                Confirm order
              </Button>
            </>
          ) : null}

          {showSenderActions &&
          canRequestApproval(detail.status, approval) &&
          onRequestApproval ? (
            <Button
              variant="secondary"
              className="gap-2"
              disabled={actionDisabled}
              onClick={() => void onRequestApproval()}
            >
              <Shield className="size-4" />
              Request approval
            </Button>
          ) : null}

          {showSenderActions &&
          canApproveOrReject(approval, actorRole) &&
          onApprove &&
          onReject ? (
            <>
              <Button
                variant="outline"
                className="gap-2"
                disabled={actionDisabled}
                onClick={() => void onApprove()}
              >
                Approve
              </Button>
              <Button
                variant="destructive"
                className="gap-2"
                disabled={actionDisabled}
                onClick={() => void onReject()}
              >
                Reject
              </Button>
            </>
          ) : null}

          {showSenderActions && detail.status === "confirmed" ? (
            <>
              <Button
                variant="outline"
                className="gap-2"
                asChild
                disabled={actionDisabled}
              >
                <Link href={editHref}>
                  <Pencil className="size-4" />
                  Limited edit
                </Link>
              </Button>
              {canShip(detail.status, approval) && onShip ? (
                <Button
                  className="gap-2 shadow-md shadow-primary/15"
                  disabled={actionDisabled}
                  onClick={() => void onShip()}
                >
                  <Truck className="size-4" />
                  Ship transfer
                </Button>
              ) : null}
            </>
          ) : null}

          {showSenderActions && detail.status === "shipped" ? (
            <Button variant="outline" className="gap-2" asChild>
              <Link href={ROUTES.inventory.transfersIncoming}>
                Open incoming @ {detail.toBranch}
              </Link>
            </Button>
          ) : null}

          {showSenderActions && canReverse(detail.status, detail.isReversed) && onReverse ? (
            <Button
              variant="outline"
              className="gap-2"
              disabled={actionDisabled}
              onClick={() => void onReverse()}
            >
              <Undo2 className="size-4" />
              Reverse transfer
            </Button>
          ) : null}
        </div>
      </div>

      {detail.status === "shipped" && !detail.isReversed ? (
        <Alert className="rounded-xl border-blue-500/30 bg-blue-500/5">
          <Truck className="size-4 text-blue-600" />
          <AlertTitle className="text-sm">In transit</AlertTitle>
          <AlertDescription>
            Stock has been <strong>deducted from the source</strong> branch.
            Goods are in transit until the destination posts receipt.
          </AlertDescription>
        </Alert>
      ) : null}

      {detail.status === "received" ? (
        <Alert className="rounded-xl border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 className="size-4 text-emerald-600" />
          <AlertTitle className="text-sm">Completed</AlertTitle>
          <AlertDescription>
            Transfer is final. Stock has been{" "}
            <strong>added at the destination</strong>. No further edits or
            duplicate receipts.
          </AlertDescription>
        </Alert>
      ) : null}

      {detail.status === "closed" ? (
        <Alert className="rounded-xl border-slate-400/40 bg-slate-200/30 dark:bg-slate-800/40">
          <CheckCircle2 className="size-4 text-slate-700 dark:text-slate-200" />
          <AlertTitle className="text-sm">Lifecycle closed</AlertTitle>
          <AlertDescription>
            Transfer is fully complete and explicitly closed. Inventory and
            accounting postings are finalized for this flow.
          </AlertDescription>
        </Alert>
      ) : null}

      {receiverView ? (
        <Alert className="rounded-xl border-blue-500/30 bg-blue-500/5">
          <AlertTitle className="text-sm">Receiving branch view</AlertTitle>
          <AlertDescription>
            {actorBranchId
              ? `Scoped to branch id ${actorBranchId}. You can receive only when this matches the transfer destination.`
              : "Set a branch in the app branch selector (localStorage branchId) to receive incoming stock."}
          </AlertDescription>
        </Alert>
      ) : null}

      {wrongReceiveBranch ? (
        <Alert variant="destructive" className="rounded-xl">
          <AlertTitle className="text-sm">Not your branch</AlertTitle>
          <AlertDescription>
            This shipment is addressed to <strong>{detail.toBranch}</strong>.
            Switch branch context to receive it.
          </AlertDescription>
        </Alert>
      ) : null}

      {locked ? (
        <Alert className="rounded-xl">
          <Lock className="size-4" />
          <AlertTitle className="text-sm">Transfer locked</AlertTitle>
          <AlertDescription>
            {detail.status === "shipped"
              ? "Shipped transfers cannot be edited. Goods are in transit until receipt."
              : detail.status === "received"
                ? "Received is final — no edits, no second receipt."
                : "Closed transfers are immutable and kept for audit history."}
          </AlertDescription>
        </Alert>
      ) : null}

      {processingLocked ? (
        <Alert className="rounded-xl border-amber-500/30 bg-amber-500/5">
          <Lock className="size-4 text-amber-700" />
          <AlertTitle className="text-sm">Processing lock active</AlertTitle>
          <AlertDescription>
            Actions are disabled while stage{" "}
            <strong>{detail.processingStage ?? "processing"}</strong> is running.
          </AlertDescription>
        </Alert>
      ) : null}

      {detail.isReversed ? (
        <Alert className="rounded-xl border-orange-500/30 bg-orange-500/5">
          <AlertTitle className="text-sm">Reversed</AlertTitle>
          <AlertDescription>
            This transfer has been reversed. Original operational effects were
            counter-posted in inventory and accounting.
          </AlertDescription>
        </Alert>
      ) : null}

      {showSenderActions &&
      detail.status === "confirmed" &&
      !canShip(detail.status, approval) ? (
        <Alert className="rounded-xl border-amber-500/30 bg-amber-500/5">
          <AlertTitle className="text-sm">Cannot ship yet</AlertTitle>
          <AlertDescription>
            {approval?.toLowerCase() === "pending"
              ? "Awaiting manager approval before stock can leave the source branch."
              : approval?.toLowerCase() === "rejected"
                ? "Approval was rejected — revise the transfer or request approval again."
                : "Confirm the transfer and complete approval rules before shipping."}
          </AlertDescription>
        </Alert>
      ) : null}

      {showSenderActions &&
      detail.status === "confirmed" &&
      canShip(detail.status, approval) ? (
        <Alert className="rounded-xl border-violet-500/30 bg-violet-500/5">
          <AlertTitle className="text-sm">Ready to ship</AlertTitle>
          <AlertDescription>
            Shipping posts <strong>stock OUT</strong> at the source,
            transfer_out movement, and locks the document for editing.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Next step</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {receiverView ? (
            detail.isReversed ? (
              "The source branch reversed this shipment before you received. Stock was returned there; do not receive — there is nothing to post in."
            ) : canRecv ? (
              "Receive this transfer to post stock IN and complete destination accounting."
            ) : (
              "Wait for source branch shipment or switch to the destination branch context."
            )
          ) : detail.status === "draft" ? (
            "Confirm the transfer to lock quantities and trigger approval workflow."
          ) : detail.status === "confirmed" &&
            approval?.toLowerCase() !== "approved" ? (
            "Approve the transfer (manager/admin) before shipping is allowed."
          ) : detail.status === "confirmed" ? (
            "Ship transfer to post stock OUT and create shipment journal."
          ) : detail.status === "shipped" && detail.isReversed ? (
            "This shipment was reversed at the source. No receipt is possible or needed."
          ) : detail.status === "shipped" ? (
            "Destination branch should receive transfer to post stock IN and close the flow."
          ) : (
            "Transfer lifecycle is closed. No further operational actions are allowed."
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Lifecycle</CardTitle>
          <CardDescription>
            Draft → confirmed → approved → shipped → received → closed.
            Inventory moves on ship (out) and receive (in).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LifecycleRail status={detail.status} />
        </CardContent>
      </Card>

      <TransferActivityTimeline events={events} loading={eventsLoading} />

      {detail.inTransitQuantity != null && detail.inTransitQuantity > 0 ? (
        <Card className="rounded-2xl border-blue-500/20 bg-blue-500/5 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">In transit (units)</CardTitle>
            <CardDescription>
              Optional in_transit_quantity — not yet at destination.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">
            {detail.inTransitQuantity.toLocaleString()} units
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 rounded-2xl border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="size-5 text-primary" />
              Line items
            </CardTitle>
            <CardDescription>
              Products on this transfer.
              {detail.lines.some((l) => l.receivedQty != null) ? (
                <span className="block text-xs">
                  Partial receive fields (received / remaining) shown when API
                  provides them.
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-6">Product</TableHead>
                  <TableHead className="px-6 text-right">Qty</TableHead>
                  <TableHead className="px-6">Unit</TableHead>
                  {detail.lines.some((l) => l.receivedQty != null) ? (
                    <>
                      <TableHead className="px-6 text-right">
                        Received
                      </TableHead>
                      <TableHead className="px-6 text-right">
                        Remaining
                      </TableHead>
                    </>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.lines.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={
                        detail.lines.some((l) => l.receivedQty != null) ? 5 : 3
                      }
                      className="px-6 py-8 text-center text-sm text-muted-foreground"
                    >
                      No line items on this transfer.
                    </TableCell>
                  </TableRow>
                ) : (
                  detail.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="px-6">
                        <div className="font-semibold">{line.productName}</div>
                        <div className="text-xs text-muted-foreground">
                          {line.sku}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 text-right font-medium tabular-nums">
                        {line.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="px-6 text-sm text-muted-foreground">
                        {line.unit}
                      </TableCell>
                      {detail.lines.some((l) => l.receivedQty != null) ? (
                        <>
                          <TableCell className="px-6 text-right tabular-nums">
                            {line.receivedQty?.toLocaleString() ?? "—"}
                          </TableCell>
                          <TableCell className="px-6 text-right tabular-nums">
                            {line.remainingQty?.toLocaleString() ?? "—"}
                          </TableCell>
                        </>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <TransferStatusBadge status={detail.status} />
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    (detail.shipAccountingState ?? "pending") === "posted"
                      ? "secondary"
                      : (detail.shipAccountingState ?? "pending") === "failed"
                        ? "destructive"
                        : "outline"
                  }
                  className="text-[10px] uppercase"
                  title="Shipment accounting posting state"
                >
                  Ship accounting: {detail.shipAccountingState ?? "pending"}
                </Badge>
                <Badge
                  variant={
                    (detail.receiveAccountingState ?? "pending") === "posted"
                      ? "secondary"
                      : (detail.receiveAccountingState ?? "pending") === "failed"
                        ? "destructive"
                        : "outline"
                  }
                  className="text-[10px] uppercase"
                  title="Receipt accounting posting state"
                >
                  Receive accounting: {detail.receiveAccountingState ?? "pending"}
                </Badge>
              </div>
              {detail.lastAccountingError ? (
                <p className="text-xs text-destructive">{detail.lastAccountingError}</p>
              ) : null}
              {detail.shippedJournalEntryId || detail.receiveJournalEntryId ? (
                <div className="space-y-1 text-xs">
                  {detail.shippedJournalEntryId ? (
                    <Link
                      href={`${ROUTES.accounting.root}?journal=${encodeURIComponent(detail.shippedJournalEntryId)}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Open ship journal
                    </Link>
                  ) : null}
                  {detail.receiveJournalEntryId ? (
                    <Link
                      href={`${ROUTES.accounting.root}?journal=${encodeURIComponent(detail.receiveJournalEntryId)}`}
                      className="block text-primary underline-offset-2 hover:underline"
                    >
                      Open receive journal
                    </Link>
                  ) : null}
                </div>
              ) : null}
              <Separator />
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">From</span>
                  <span className="max-w-[60%] text-right font-medium">
                    {detail.fromBranch}
                  </span>
                </div>
                <div className="flex justify-center">
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">To</span>
                  <span className="max-w-[60%] text-right font-medium">
                    {detail.toBranch}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Created by</span>
                <span className="font-medium">{detail.createdByName}</span>
              </div>
              {detail.authorizedBy ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Authorized by</span>
                  <span className="font-medium">{detail.authorizedBy}</span>
                </div>
              ) : null}
              {detail.approvedBy ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Approved by</span>
                  <span className="font-medium">{detail.approvedBy}</span>
                </div>
              ) : null}
              {detail.approvedAt ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Approved at</span>
                  <span className="font-medium">
                    {formatAuditDateTime(detail.approvedAt)}
                  </span>
                </div>
              ) : null}
              {detail.reversedAt ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Reversed at</span>
                  <span className="font-medium">
                    {formatAuditDateTime(detail.reversedAt)}
                  </span>
                </div>
              ) : null}
              {detail.reversalReason ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Reversal reason</span>
                  <span className="font-medium">{detail.reversalReason}</span>
                </div>
              ) : null}
              {detail.expectedDate ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Expected</span>
                  <span className="font-medium">{detail.expectedDate}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Total units</span>
                <span className="font-medium tabular-nums">
                  {detail.totalUnits.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 bg-slate-900 text-slate-50 shadow-lg dark:bg-slate-950">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-primary opacity-90">
                Journal snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-[11px] text-slate-400">
                Postings split: <strong className="text-slate-200">ship</strong>{" "}
                (source inventory / transfer_out) and{" "}
                <strong className="text-slate-200">receive</strong> (destination
                inventory / transfer_in).
              </p>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">
                  Debit
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {detail.journalDebitAmount}
                </p>
                <p className="text-xs text-slate-400">
                  {detail.journalDebitLabel}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">
                  Credit
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {detail.journalCreditAmount}
                </p>
                <p className="text-xs text-slate-400">
                  {detail.journalCreditLabel}
                </p>
              </div>
              <Separator className="bg-white/10" />
              <div className="flex justify-between text-xs text-slate-400">
                <span>Est. tax</span>
                <span className="font-medium text-slate-200">
                  {detail.estTax}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
