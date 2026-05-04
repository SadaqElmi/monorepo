"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";

import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { hasGlobalBranchAccess } from "@/lib/branch-access";
import { getResolvedStoredUser, getStoredUser } from "@/lib/auth-client";
import {
  getInterbranchMismatches,
  type InterbranchMismatchItem,
} from "@/lib/services/accounting";
import { repairTransferJournalLinks } from "@/lib/services/transfer-repair";
import { runAutoRepair } from "@/lib/services/transfer-repair";
import { inventoryTransferDetailPath } from "@/lib/routes";
import { toast } from "sonner";

function kindLabel(kind: InterbranchMismatchItem["kind"]): string {
  switch (kind) {
    case "in_transit":
      return "In transit";
    case "posted_amount_mismatch":
      return "Posted amount mismatch";
    case "transfer_gl_mismatch":
      return "GL mismatch";
    default:
      return kind;
  }
}

export default function InterbranchMismatchesPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const resolvedUser = getResolvedStoredUser();

  const [rows, setRows] = React.useState<InterbranchMismatchItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [fixingTransferId, setFixingTransferId] = React.useState<string | null>(null);
  const [confirmRepairRow, setConfirmRepairRow] =
    React.useState<InterbranchMismatchItem | null>(null);
  const [autoRepairOpen, setAutoRepairOpen] = React.useState(false);
  const [autoRepairRunning, setAutoRepairRunning] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!hasGlobalBranchAccess(resolvedUser?.role) || !aggregateAll) {
      setRows(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await getInterbranchMismatches(
        tenantSlug,
        branchId,
        aggregateAll,
      );
      setRows(res.items ?? []);
    } catch (e: unknown) {
      setErr(
        e instanceof Error ? e.message : "Failed to load inter-branch mismatches",
      );
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, branchId, aggregateAll, resolvedUser?.role]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const runFix = React.useCallback(
    async (row: InterbranchMismatchItem) => {
      if (row.fixSuggestionCode !== "repair_transfer_journal") return;
      setFixingTransferId(row.transferId);
      try {
        await repairTransferJournalLinks(tenantSlug, row.transferId);
        toast.success("Repair request applied", {
          description: "Transfer journal links were repaired where possible.",
        });
        await load();
      } catch (e) {
        toast.error("Repair failed", {
          description:
            e instanceof Error ? e.message : "Could not repair transfer journals.",
        });
      } finally {
        setFixingTransferId(null);
      }
    },
    [tenantSlug, load],
  );

  const runAutoRepairNow = React.useCallback(async () => {
    setAutoRepairRunning(true);
    try {
      const result = await runAutoRepair(tenantSlug);
      toast.success(result.applied ? "Auto-repair completed" : "Auto-repair dry run", {
        description: result.applied
          ? `${result.actions.filter((a) => a.applied).length} issue(s) fixed and audit logged.`
          : "AUTO_REPAIR_ENABLED is off. No changes were made.",
      });
      setAutoRepairOpen(false);
      await load();
    } catch (e) {
      toast.error("Auto-repair failed", {
        description:
          e instanceof Error ? e.message : "Could not run controlled auto-repair.",
      });
    } finally {
      setAutoRepairRunning(false);
    }
  }, [load, tenantSlug]);

  if (!hasGlobalBranchAccess(resolvedUser?.role)) {
    return (
      <Card className="mx-4 mb-4 mt-4">
        <CardHeader>
          <CardTitle className="text-lg">Inter-branch mismatches</CardTitle>
          <CardDescription>
            This report is available to admin and owner roles only.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!aggregateAll) {
    return (
      <Card className="mx-4 mb-4 mt-4">
        <CardHeader>
          <CardTitle className="text-lg">Inter-branch mismatches</CardTitle>
          <CardDescription>
            Select <strong>All branches</strong> in the location switcher. The report
            compares stock transfers and journals across branches in your read scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/accounting/reports/consolidated">Consolidated reports</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Inter-branch mismatches</CardTitle>
        <CardDescription>
          In-transit transfers, posted journal parity issues, or per-transfer due
          from / due to differences. Read-only; use transfer workflows and
          reconciliation to resolve.
        </CardDescription>
        <ReportScopeBadge />
        <div className="pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={autoRepairRunning}
              onClick={() => setAutoRepairOpen(true)}
            >
              Controlled auto-repair
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-0 pb-6 pt-0">
        {err ? (
          <Alert variant="destructive" className="mx-4 mt-4">
            <AlertCircle />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        {loading && !rows ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : null}

        {rows && !loading ? (
          <>
            <div className="px-4 pt-4 text-sm text-muted-foreground">
              {rows.length === 0
                ? "No issues found for the current scope."
                : `${rows.length} row(s).`}
            </div>
            <Separator className="my-3" />
            {rows.length ? (
              <div className="min-h-0 flex-1 overflow-auto px-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Kind</TableHead>
                      <TableHead className="text-xs">Reason code</TableHead>
                      <TableHead className="text-xs">Transfer</TableHead>
                      <TableHead className="text-xs">Route</TableHead>
                      <TableHead className="text-right text-xs">Ship / recv</TableHead>
                      <TableHead className="text-xs">Notes</TableHead>
                      <TableHead className="text-right text-xs">Fix now</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={`${r.kind}-${r.transferId}`}>
                        <TableCell className="align-top text-xs">
                          {kindLabel(r.kind)}
                        </TableCell>
                        <TableCell className="align-top font-mono text-[11px] text-muted-foreground">
                          {r.reasonCode ?? "—"}
                        </TableCell>
                        <TableCell className="align-top text-xs">
                          <Button asChild variant="link" className="h-auto p-0 text-xs">
                            <Link href={inventoryTransferDetailPath(r.transferId)}>
                              Open transfer
                            </Link>
                          </Button>
                        </TableCell>
                        <TableCell className="align-top text-xs text-muted-foreground">
                          {r.fromBranchName} → {r.toBranchName}
                        </TableCell>
                        <TableCell className="align-top text-right text-xs tabular-nums">
                          {r.shipAmount != null || r.receiveAmount != null ? (
                            <>
                              {money(r.shipAmount ?? 0)} / {money(r.receiveAmount ?? 0)}
                              {r.difference != null ? (
                                <div className="font-medium text-foreground">
                                  Δ {money(r.difference)}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="max-w-md align-top text-xs text-muted-foreground">
                          {r.message}
                        </TableCell>
                        <TableCell className="align-top text-right text-xs">
                          {r.fixSuggestionCode === "repair_transfer_journal" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                loading ||
                                fixingTransferId === r.transferId
                              }
                              onClick={() => setConfirmRepairRow(r)}
                            >
                              {fixingTransferId === r.transferId ? (
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              Repair journals
                            </Button>
                          ) : r.fixSuggestionCode === "complete_receive" ? (
                            <Button asChild variant="ghost" size="sm" className="h-auto p-0">
                              <Link href={inventoryTransferDetailPath(r.transferId, { receiver: true })}>
                                Complete receive
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">Inspect mapping</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="px-4 pt-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/accounting/reports/consolidated">Back to consolidated reports</Link>
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={Boolean(confirmRepairRow)}
        onOpenChange={(open) => {
          if (!open) setConfirmRepairRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm repair journals</DialogTitle>
            <DialogDescription>
              This action links missing transfer journals only. No inventory quantities are
              changed, and all actions are audit-logged.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded border bg-muted/30 p-3 text-xs">
            {confirmRepairRow ? confirmRepairRow.message : ""}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!confirmRepairRow) return;
                void runFix(confirmRepairRow);
                setConfirmRepairRow(null);
              }}
              disabled={!confirmRepairRow || fixingTransferId !== null}
            >
              {fixingTransferId ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Confirm repair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={autoRepairOpen} onOpenChange={setAutoRepairOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run controlled auto-repair</DialogTitle>
            <DialogDescription>
              This will apply only safe repair actions when enabled. If disabled, the
              endpoint returns a dry-run suggestion list.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>Before run:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Fixes transfer journal-link inconsistencies only.</li>
              <li>Does not delete records or alter stock balances.</li>
              <li>Writes audit events for all applied actions.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => void runAutoRepairNow()}
              disabled={autoRepairRunning}
            >
              {autoRepairRunning ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Confirm run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
