"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpBranches } from "@/hooks/queries/use-erp-branches";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import {
  getTransferMonitoringOverview,
} from "@/lib/services/transfers";
import { ROUTES } from "@/lib/routes";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function stageLabel(stage: string): string {
  const normalized = stage.trim().toLowerCase();
  if (normalized === "ship_journal") return "Ship";
  if (normalized === "receive_journal") return "Receive";
  if (normalized === "reverse_journal") return "Reverse";
  if (normalized === "nightly_journal_verify") return "Nightly Journal";
  return stage.replaceAll("_", " ");
}

export default function TransferMonitoringPage() {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = useState(() => {
    const user = getStoredUser();
    return user?.tenantSlug?.trim() || null;
  });

  const overviewQuery = useQuery({
    queryKey: erpKeys.transferMonitoring(tenantSlug ?? "", branchFacet),
    queryFn: () => getTransferMonitoringOverview(tenantSlug!),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_LIST,
  });
  const branchesQuery = useErpBranches(tenantSlug, {
    enabled: Boolean(tenantSlug && branchFacet),
  });

  const overview = overviewQuery.data ?? null;
  const loading = overviewQuery.isPending;
  const loadError = overviewQuery.error;
  const displayError =
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load monitoring data"
        : null);

  const branchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branchesQuery.data ?? []) {
      if (b.id) map.set(b.id, b.name?.trim() || b.id);
    }
    return map;
  }, [branchesQuery.data]);

  const maxTrend = useMemo(() => {
    const points = overview?.trend_hours ?? [];
    return (
      points.reduce(
        (max, p) => Math.max(max, Number(p.shipped ?? 0), Number(p.received ?? 0)),
        0,
      ) || 1
    );
  }, [overview?.trend_hours]);

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["erp", "transfer-monitoring"],
    });
    void queryClient.invalidateQueries({ queryKey: ["erp", "branches"] });
  };

  if (!tenantSlug) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Sign in and select a tenant to access monitoring.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Integrity & Transfer Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Internal ERP monitoring dashboard for transfer flow stability.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Today</Badge>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {displayError ? (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{displayError}</CardContent>
        </Card>
      ) : null}

      {loading || !overview ? (
        <Card>
          <CardContent className="p-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-primary" />
                  Transfers Today
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-bold">{overview.transfers_today}</p>
                <p className="text-xs text-muted-foreground">
                  {overview.shipped_today} shipped, {overview.received_today} received
                </p>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Operational Failures
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-bold text-destructive">
                  {overview.failed_today}
                </p>
                <p className="text-xs text-muted-foreground">
                  ship / receive / reverse / approve errors today
                </p>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  Integrity Errors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-bold text-destructive">
                  {overview.integrity_errors_today}
                </p>
                <p className="text-xs text-muted-foreground">
                  nightly journal verification anomalies
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  Idempotency Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-bold">
                  {overview.idempotency_replays_today}
                </p>
                <p className="text-xs text-muted-foreground">
                  {overview.idempotency_conflicts_today} conflicts
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Transfer Trend (last 12 hours)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-12 gap-2 h-52 items-end">
                  {overview.trend_hours.map((point) => {
                    const shippedHeight = Math.max(
                      6,
                      Math.round((point.shipped / maxTrend) * 100),
                    );
                    const receivedHeight = Math.max(
                      6,
                      Math.round((point.received / maxTrend) * 100),
                    );
                    return (
                      <div key={point.hour} className="flex flex-col items-center gap-1">
                        <div className="w-full h-36 flex items-end justify-center gap-1">
                          <div
                            className="w-2 rounded-sm bg-primary/35"
                            style={{ height: `${shippedHeight}%` }}
                            title={`Shipped: ${point.shipped}`}
                          />
                          <div
                            className="w-2 rounded-sm bg-slate-400/60"
                            style={{ height: `${receivedHeight}%` }}
                            title={`Received: ${point.received}`}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">{point.hour}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Failure Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {overview.failure_distribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No failures logged today.
                  </p>
                ) : (
                  overview.failure_distribution.map((row) => (
                    <div key={row.stage} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{stageLabel(row.stage)}</span>
                        <span className="text-destructive font-semibold">{row.count}</span>
                      </div>
                      <div className="h-2 rounded bg-muted overflow-hidden">
                        <div
                          className="h-2 rounded bg-destructive/80"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(8, row.count * 20),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent Transfers</CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link href={ROUTES.inventory.transfers}>Open transfers</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.recent_transfers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No transfers yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      overview.recent_transfers.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">
                            {(row.transfer_number || row.id).slice(0, 12)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {(branchMap.get(row.from_branch_id) || row.from_branch_id).slice(
                              0,
                              12,
                            )}{" "}
                            →{" "}
                            {(branchMap.get(row.to_branch_id) || row.to_branch_id).slice(
                              0,
                              12,
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="uppercase text-[10px]">
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(row.timestamp)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-destructive/30">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Recent System Errors</CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/accounting/journal-audit">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Audit page
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.recent_errors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No error logs found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      overview.recent_errors.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">
                            {(row.transfer_id || row.id).slice(0, 10)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive" className="text-[10px] uppercase">
                              {stageLabel(row.stage)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[250px] truncate">
                            {row.error_message}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(row.created_at)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
