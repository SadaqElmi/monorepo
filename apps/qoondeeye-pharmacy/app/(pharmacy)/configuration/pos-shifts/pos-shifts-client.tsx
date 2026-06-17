"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ConfigurationModuleShell } from "@/components/configuration/configuration-module-shell";
import { ConfigurationErrorBanner } from "@/components/configuration/configuration-status-banner";
import { PosOpsQuickLinks } from "@/components/pos/pos-ops-quick-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpPosShifts } from "@/hooks/queries/use-erp-pos-shifts";
import { useErpPosTerminals } from "@/hooks/queries/use-erp-pos-terminals";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ROUTES, posStatementPath } from "@/lib/routes";
import {
  approvePosShiftVariance,
  type PosShiftListItem,
} from "@/lib/services/pos-sessions";
import { hasEffectivePermission } from "@/lib/permissions";

const PAGE_SIZE = 25;
const VARIANCE_APPROVAL_THRESHOLD = 0.01;

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "open") return "default";
  if (status === "paused") return "secondary";
  return "outline";
}

export default function PosShiftsClient() {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const storedUser = React.useMemo(() => getStoredUser(), []);
  const tenantSlug = storedUser?.tenantSlug ?? "";
  const permissions = storedUser?.permissions ?? [];
  const role = storedUser?.role?.toLowerCase();
  const canManage =
    role === "admin" ||
    role === "manager" ||
    hasEffectivePermission(permissions, "manage_pos_terminals") ||
    hasEffectivePermission(permissions, "pos_approve_variance");

  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "open" | "paused" | "closed"
  >("all");
  const [deviceFilter, setDeviceFilter] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");

  const terminalsQuery = useErpPosTerminals(tenantSlug, {
    page: 1,
    limit: 200,
  });
  const terminals = terminalsQuery.data?.items ?? [];

  const fromIso = fromDate ? `${fromDate}T00:00:00.000Z` : undefined;
  const toIso = toDate ? `${toDate}T23:59:59.999Z` : undefined;

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, deviceFilter, fromDate, toDate]);

  const shiftsQuery = useErpPosShifts(tenantSlug, {
    page,
    limit: PAGE_SIZE,
    status: statusFilter === "all" ? undefined : statusFilter,
    deviceId: deviceFilter || undefined,
    from: fromIso,
    to: toIso,
  });

  const approveMutation = useMutation({
    mutationFn: (sessionId: string) =>
      approvePosShiftVariance(tenantSlug, sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: erpKeys.posShifts(tenantSlug, branchFacet),
      });
      toast.success("Variance approved");
    },
    onError: (e: Error) => {
      toast.error("Approval failed", { description: e.message });
    },
  });

  const data = shiftsQuery.data;
  const error =
    shiftsQuery.error instanceof Error
      ? shiftsQuery.error.message
      : shiftsQuery.error
        ? "Failed to load POS shifts."
        : null;

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <ConfigurationModuleShell
      title="POS shifts"
      description="Terminal shift history, cash variances, and manager approval."
      stat={{
        icon: Clock,
        value: `${data?.total ?? 0} shifts`,
      }}
      headerEnd={
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.configuration.posCenter}>Operations center</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.configuration.posAudit}>POS audit log</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={ROUTES.accounting.posStatement}>POS statement</Link>
          </Button>
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <PosOpsQuickLinks />

        {error ? <ConfigurationErrorBanner message={error} /> : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as typeof statusFilter)
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Terminal</Label>
            <Select
              value={deviceFilter || "all"}
              onValueChange={(v) => setDeviceFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All terminals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All terminals</SelectItem>
                {terminals.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.displayName ?? t.terminalUsername ?? t.deviceCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>From</Label>
            <Input
              type="date"
              className="w-[160px]"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>To</Label>
            <Input
              type="date"
              className="w-[160px]"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

      {shiftsQuery.isPending ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>Terminal</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Statement</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No shifts match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.items ?? []).map((shift) => (
                  <ShiftRow
                    key={shift.id}
                    shift={shift}
                    canManage={canManage}
                    approving={
                      approveMutation.isPending &&
                      approveMutation.variables === shift.id
                    }
                    onApprove={() => approveMutation.mutate(shift.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.total > PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} ({data.total} shifts)
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
      </div>
    </ConfigurationModuleShell>
  );
}

function ShiftRow({
  shift,
  canManage,
  approving,
  onApprove,
}: {
  shift: PosShiftListItem;
  canManage: boolean;
  approving: boolean;
  onApprove: () => void;
}) {
  const needsApproval =
    shift.totalVariance > VARIANCE_APPROVAL_THRESHOLD &&
    !shift.varianceApproved &&
    shift.statementStatus === "posted";

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-sm">
        {formatWhen(shift.openedAt)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {formatWhen(shift.closedAt)}
      </TableCell>
      <TableCell>{shift.deviceName ?? shift.deviceId?.slice(0, 8) ?? "—"}</TableCell>
      <TableCell>{shift.branchName ?? "—"}</TableCell>
      <TableCell>{shift.staffName ?? "—"}</TableCell>
      <TableCell>
        <Badge variant={statusVariant(shift.status)}>{shift.status}</Badge>
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {shift.openingCash.toFixed(2)}
      </TableCell>
      <TableCell
        className={`text-right font-mono text-sm ${
          shift.totalVariance > VARIANCE_APPROVAL_THRESHOLD
            ? "text-amber-700"
            : "text-emerald-700"
        }`}
      >
        {shift.totalVariance.toFixed(2)}
      </TableCell>
      <TableCell className="uppercase text-xs text-muted-foreground">
        {shift.statementStatus ?? "—"}
      </TableCell>
      <TableCell className="text-right space-x-2">
        {(shift.status === "open" || shift.status === "paused") && (
          <Button asChild type="button" size="sm" variant="ghost">
            <Link
              href={posStatementPath({
                sessionId: shift.id,
                branchId: shift.branchId,
              })}
            >
              Close shift
            </Link>
          </Button>
        )}
        {needsApproval && canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={approving}
            onClick={onApprove}
          >
            {approving ? "Approving…" : "Approve variance"}
          </Button>
        ) : shift.varianceApproved ? (
          <span className="text-xs text-emerald-700">Approved</span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
