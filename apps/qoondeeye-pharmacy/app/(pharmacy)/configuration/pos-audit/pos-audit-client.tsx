"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { FileSearch, Loader2 } from "lucide-react";

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
import { useErpPosGlobalAudit } from "@/hooks/queries/use-erp-pos-global-audit";
import { useErpPosTerminals } from "@/hooks/queries/use-erp-pos-terminals";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { formatPosTerminalDate } from "@/lib/pos-terminals/format-date";
import { ROUTES, posTerminalActivityPath } from "@/lib/routes";

const PAGE_SIZE = 50;

function formatPayload(payload: Record<string, unknown> | null): string {
  if (!payload || !Object.keys(payload).length) return "—";
  const parts: string[] = [];
  if (payload.staffId) parts.push(`Staff ${String(payload.staffId)}`);
  if (payload.terminalUsername) parts.push(`@${String(payload.terminalUsername)}`);
  if (payload.outcome) parts.push(String(payload.outcome));
  if (payload.displayName) parts.push(String(payload.displayName));
  if (payload.bindingStatus) parts.push(String(payload.bindingStatus));
  if (!parts.length) {
    const keys = Object.keys(payload).slice(0, 3);
    return keys.map((k) => `${k}: ${String(payload[k])}`).join(", ");
  }
  return parts.join(" · ");
}

export default function PosAuditClient() {
  const queryClient = useQueryClient();
  const storedUser = React.useMemo(() => getStoredUser(), []);
  const tenantSlug = storedUser?.tenantSlug ?? "";

  const [page, setPage] = React.useState(1);
  const [deviceId, setDeviceId] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");

  const terminalsQuery = useErpPosTerminals(tenantSlug, {
    page: 1,
    limit: 200,
  });
  const terminals = terminalsQuery.data?.items ?? [];
  const terminalNameById = React.useMemo(
    () =>
      new Map(
        terminals.map((t) => [
          t.id,
          t.displayName ?? t.terminalUsername ?? t.deviceCode,
        ]),
      ),
    [terminals],
  );

  const fromIso = fromDate ? `${fromDate}T00:00:00.000Z` : undefined;
  const toIso = toDate ? `${toDate}T23:59:59.999Z` : undefined;

  React.useEffect(() => {
    setPage(1);
  }, [deviceId, actionFilter, fromDate, toDate]);

  const auditQuery = useErpPosGlobalAudit(tenantSlug, {
    page,
    limit: PAGE_SIZE,
    deviceId: deviceId || undefined,
    action: actionFilter.trim() || undefined,
    from: fromIso,
    to: toIso,
  });

  const data = auditQuery.data;
  const error =
    auditQuery.error instanceof Error
      ? auditQuery.error.message
      : auditQuery.error
        ? "Failed to load POS audit events."
        : null;

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <ConfigurationModuleShell
      title="POS audit log"
      description="Merged terminal lifecycle and auth events from control and tenant databases. Use this for rollout monitoring and security review."
      stat={{
        icon: FileSearch,
        value: `${data?.total ?? 0} events`,
      }}
      headerEnd={
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.accounting.auditTrail}>Branch audit trail</Link>
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <PosOpsQuickLinks />

        {error ? <ConfigurationErrorBanner message={error} /> : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label>Terminal</Label>
            <Select
              value={deviceId || "all"}
              onValueChange={(v) => setDeviceId(v === "all" ? "" : v)}
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
            <Label>Action contains</Label>
            <Input
              className="w-[180px]"
              placeholder="e.g. pos_staff_login"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
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
          <Button
            type="button"
            variant="secondary"
            disabled={auditQuery.isFetching}
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: erpKeys.posGlobalAudit(tenantSlug, "", {}),
              })
            }
          >
            {auditQuery.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Refresh
          </Button>
        </div>

        {auditQuery.isPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Terminal</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No POS audit events match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  (data?.items ?? []).map((row) => (
                    <TableRow key={`${row.source}-${row.id}`}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatPosTerminalDate(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {row.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.action}</TableCell>
                      <TableCell className="text-xs">
                        {row.deviceId ? (
                          <Link
                            href={posTerminalActivityPath(row.deviceId)}
                            className="hover:underline"
                          >
                            {terminalNameById.get(row.deviceId) ??
                              row.deviceId.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                        {formatPayload(row.payload)}
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {row.actorType?.replace(/_/g, " ") ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {data && data.total > PAGE_SIZE ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} ({data.total} events)
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
