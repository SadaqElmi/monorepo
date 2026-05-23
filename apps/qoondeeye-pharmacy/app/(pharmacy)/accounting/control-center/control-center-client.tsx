"use client";

import Link from "next/link";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getReportBranchSnapshot,
  useReportBranchQuery,
} from "@/hooks/use-branch-for-reports";
import { useErpAccountingAlerts } from "@/hooks/queries/use-erp-accounting-alerts";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_REPORT } from "@/lib/erp-query-options";
import { ROUTES, inventoryTransferDetailPath } from "@/lib/routes";
import {
  getAuditExportUrl,
  getAuditVerify,
  getCloseReadiness,
  getIntegrityHealthSnapshots,
  getInterbranchMismatches,
  getInventoryGlSync,
  getReportExplain,
  getVarianceAnalysis,
  type AlertItem,
} from "@/lib/services/accounting";
import { runAutoRepair, type AutoFixResult } from "@/lib/services/transfer-repair";
import { toast } from "sonner";

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityVariant(
  severity: "critical" | "warning" | "info",
): "destructive" | "secondary" {
  return severity === "critical" ? "destructive" : "secondary";
}

function statusSummary(params: {
  alerts: AlertItem[];
  mismatchCount: number;
  inventoryCritical: number;
  readinessStatus: "CLEAN" | "WARNING" | "CRITICAL";
}) {
  const criticalAlerts = params.alerts.filter((a) => a.severity === "critical").length;
  const warningAlerts = params.alerts.filter((a) => a.severity === "warning").length;
  const criticalSignals =
    criticalAlerts +
    params.inventoryCritical +
    (params.readinessStatus === "CRITICAL" ? 1 : 0) +
    (params.mismatchCount > 0 ? 1 : 0);
  if (criticalSignals > 0) {
    return {
      title: "Critical",
      icon: AlertTriangle,
      className: "text-destructive",
      detail: `${criticalAlerts} critical alerts, ${warningAlerts} warnings`,
    };
  }
  if (warningAlerts > 0 || params.readinessStatus === "WARNING") {
    return {
      title: "Warning",
      icon: AlertTriangle,
      className: "text-amber-600",
      detail: `${warningAlerts} warnings detected`,
    };
  }
  return {
    title: "Healthy",
    icon: CheckCircle2,
    className: "text-emerald-600",
    detail: "No active control issues",
  };
}

export default function ControlCenterPage() {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [tenantSlug] = React.useState(() => getStoredUser()?.tenantSlug ?? "pharmacy1");

  const defaultTo = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultFrom = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const [varianceAccount, setVarianceAccount] = React.useState("inventory");
  const [explainAccount, setExplainAccount] = React.useState("inventory");

  const controlParams = React.useMemo(
    () => ({
      branchId,
      aggregateAll,
      defaultFrom,
      defaultTo,
      varianceAccount,
      explainAccount,
    }),
    [
      aggregateAll,
      branchId,
      defaultFrom,
      defaultTo,
      explainAccount,
      varianceAccount,
    ],
  );

  const { query: alertsQuery } = useErpAccountingAlerts();

  const controlQuery = useQuery({
    queryKey: erpKeys.controlCenter(tenantSlug, branchFacet, controlParams),
    queryFn: async () => {
      const { branchId: bid, aggregateAll: agg } = getReportBranchSnapshot();
      const [
        mismatchRes,
        invRes,
        readinessRes,
        auditRes,
        varianceRes,
        explainRes,
        healthRes,
      ] = await Promise.all([
        getInterbranchMismatches(tenantSlug, bid, agg),
        getInventoryGlSync(tenantSlug, undefined, bid, agg),
        getCloseReadiness(tenantSlug, bid, agg),
        getAuditVerify(tenantSlug, { branchId: bid, aggregateAll: agg, limit: 10000 }),
        getVarianceAnalysis(
          tenantSlug,
          defaultFrom,
          defaultTo,
          varianceAccount,
          bid,
          agg,
        ),
        getReportExplain(tenantSlug, explainAccount, defaultTo, bid, agg),
        getIntegrityHealthSnapshots(tenantSlug, { limit: 10 }),
      ]);
      return {
        mismatches: mismatchRes.items ?? [],
        inventorySync: invRes.rows ?? [],
        readinessStatus: readinessRes.status as "CLEAN" | "WARNING" | "CRITICAL",
        audit: {
          valid: auditRes.valid,
          checkedRows: auditRes.checkedRows,
          lastHash: auditRes.lastHash,
          issues: auditRes.issues.length,
        },
        variance: varianceRes.rows?.[0] ?? null,
        explain: explainRes,
        healthRows: (healthRes.items ?? []).map((row) => ({
          snapshotHour: row.snapshotHour,
          checkKey: row.checkKey,
          status: row.status,
        })),
      };
    },
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_REPORT,
  });

  const alerts = alertsQuery.data?.items ?? [];
  const mismatches = controlQuery.data?.mismatches ?? [];
  const inventorySync = controlQuery.data?.inventorySync ?? [];
  const readinessStatus = controlQuery.data?.readinessStatus ?? "CLEAN";
  const audit = controlQuery.data?.audit ?? null;
  const variance = controlQuery.data?.variance ?? null;
  const explain = controlQuery.data?.explain ?? null;
  const healthRows = controlQuery.data?.healthRows ?? [];
  const loading = controlQuery.isPending;
  const loadError = controlQuery.error;
  const displayError =
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load control center"
        : null);
  const [autoRepairOpen, setAutoRepairOpen] = React.useState(false);
  const [autoRepairLoading, setAutoRepairLoading] = React.useState(false);
  const [autoRepairResult, setAutoRepairResult] = React.useState<AutoFixResult | null>(
    null,
  );

  const refreshControlCenter = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["erp", "control-center"] });
  }, [queryClient]);

  const runAutoRepairNow = React.useCallback(async () => {
    setAutoRepairLoading(true);
    try {
      const result = await runAutoRepair(tenantSlug);
      setAutoRepairResult(result);
      if (result.applied) {
        toast.success("Auto-repair completed", {
          description: `${result.actions.filter((a) => a.applied).length} action(s) applied.`,
        });
      } else {
        toast.info("Auto-repair dry-run", {
          description: "AUTO_REPAIR_ENABLED is off. Review suggested actions.",
        });
      }
      await refreshControlCenter();
    } catch (err) {
      toast.error("Auto-repair failed", {
        description: err instanceof Error ? err.message : "Unexpected failure",
      });
    } finally {
      setAutoRepairLoading(false);
    }
  }, [refreshControlCenter, tenantSlug]);

  const inventoryCritical = inventorySync.filter((row) => row.severity === "critical").length;
  const summary = statusSummary({
    alerts,
    mismatchCount: mismatches.length,
    inventoryCritical,
    readinessStatus,
  });
  const SummaryIcon = summary.icon;
  const maxVar = Math.max(
    1,
    ...(variance?.drivers?.map((row) => Math.abs(row.impact)) ?? [1]),
  );
  const maxExplain = Math.max(
    1,
    ...(explain?.breakdown?.map((row) => Math.abs(row.amount)) ?? [1]),
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance Control Center</h1>
          <p className="text-sm text-muted-foreground">
            Daily control dashboard for alerts, close-readiness, inventory sync, and audit proof.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshControlCenter} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <ReportScopeBadge />

      {displayError ? (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{displayError}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">System status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className={`flex items-center gap-2 text-xl font-semibold ${summary.className}`}>
              <SummaryIcon className="h-5 w-5" />
              {summary.title}
            </div>
            <p className="text-xs text-muted-foreground">{summary.detail}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold">{alerts.length}</p>
            <p className="text-xs text-muted-foreground">
              {alerts.filter((a) => a.severity === "critical").length} critical,{" "}
              {alerts.filter((a) => a.severity === "warning").length} warning
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Close readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold">{readinessStatus}</p>
            <p className="text-xs text-muted-foreground">
              {mismatches.length} mismatch row(s), {inventoryCritical} critical inventory variance
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Audit chain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className={`h-4 w-4 ${
                  audit?.valid ? "text-emerald-600" : "text-destructive"
                }`}
              />
              <p className="text-lg font-semibold">{audit?.valid ? "Valid" : "Issues"}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Checked {audit?.checkedRows ?? 0} row(s)
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Action center</CardTitle>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={ROUTES.accounting.monitoring}>View details</Link>
              </Button>
              <Dialog open={autoRepairOpen} onOpenChange={setAutoRepairOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Wrench className="mr-2 h-4 w-4" />
                    Run auto-repair
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Run controlled auto-repair</DialogTitle>
                    <DialogDescription>
                      This action runs safe transfer repair flows only. With current settings, the
                      system either applies safe fixes or returns a dry-run plan.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 rounded border bg-muted/30 p-3 text-sm">
                    <p>Expected behavior:</p>
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      <li>Fix transfer journal linkage issues where safe.</li>
                      <li>No destructive deletes or inventory rollback.</li>
                      <li>Audit logs are recorded for every applied action.</li>
                    </ul>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      onClick={() => void runAutoRepairNow()}
                      disabled={autoRepairLoading}
                    >
                      {autoRepairLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Confirm run
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {autoRepairResult ? (
              <div className="rounded border bg-muted/30 p-3">
                <p className="font-medium">
                  {autoRepairResult.applied
                    ? "Repair successful"
                    : "Dry-run complete (no mutation)"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {autoRepairResult.actions.filter((a) => a.applied).length} action(s) applied,{" "}
                  {autoRepairResult.actions.length} action(s) proposed.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              {alerts.slice(0, 4).map((alert, idx) => (
                <div key={`${alert.code}-${idx}`} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.message}</p>
                  </div>
                  <Badge variant={severityVariant(alert.severity)}>{alert.severity}</Badge>
                </div>
              ))}
              {!alerts.length ? (
                <p className="text-xs text-muted-foreground">No current alerts.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Audit proof</CardTitle>
            <Button asChild size="sm" variant="outline">
              <a
                href={getAuditExportUrl({ branchId, aggregateAll })}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="mr-2 h-4 w-4" />
                Export chain
              </a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Verification status:{" "}
              <span className={audit?.valid ? "text-emerald-600 font-medium" : "text-destructive font-medium"}>
                {audit?.valid ? "valid" : "invalid"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">Checked rows: {audit?.checkedRows ?? 0}</p>
            <p className="truncate text-xs text-muted-foreground">
              Last hash: {audit?.lastHash ?? "n/a"}
            </p>
            <p className="text-xs text-muted-foreground">Issues: {audit?.issues ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory vs GL sync</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Inventory</TableHead>
                  <TableHead className="text-right">GL</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventorySync.map((row) => (
                  <TableRow key={row.branchId}>
                    <TableCell className="font-mono text-xs">{row.branchId.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{money(row.inventoryValue)}</TableCell>
                    <TableCell className="text-right">{money(row.glValue)}</TableCell>
                    <TableCell className="text-right">{money(row.difference)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.severity === "critical"
                            ? "destructive"
                            : row.severity === "warning"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {row.severity}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!inventorySync.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No rows in selected scope.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Inter-branch mismatches</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/accounting/reports/interbranch-mismatches">Fix now</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {mismatches.slice(0, 6).map((row) => (
              <div key={`${row.kind}-${row.transferId}`} className="rounded border p-2 text-sm">
                <p className="font-medium">
                  {row.fromBranchName} → {row.toBranchName}
                </p>
                <p className="text-xs text-muted-foreground">{row.message}</p>
                <Button asChild variant="link" className="h-auto p-0 text-xs">
                  <Link href={inventoryTransferDetailPath(row.transferId)}>Open transfer</Link>
                </Button>
              </div>
            ))}
            {!mismatches.length ? (
              <p className="text-xs text-muted-foreground">No mismatches currently detected.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Variance drivers ({varianceAccount})</CardTitle>
            <input
              value={varianceAccount}
              onChange={(e) => setVarianceAccount(e.target.value.trim() || "inventory")}
              className="h-8 w-36 rounded border bg-background px-2 text-xs"
            />
          </CardHeader>
          <CardContent className="space-y-2">
            {(variance?.drivers ?? []).map((driver) => {
              const width = Math.round((Math.abs(driver.impact) / maxVar) * 100);
              return (
                <div key={driver.type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{driver.type}</span>
                    <span className="font-medium">{money(driver.impact)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div
                      className="h-2 rounded bg-primary/70"
                      style={{ width: `${Math.max(4, width)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {!variance?.drivers?.length ? (
              <p className="text-xs text-muted-foreground">
                No variance drivers for current filters.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Explain this number ({explainAccount})</CardTitle>
            <input
              value={explainAccount}
              onChange={(e) => setExplainAccount(e.target.value.trim() || "inventory")}
              className="h-8 w-36 rounded border bg-background px-2 text-xs"
            />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              Current value: <span className="font-semibold">{money(explain?.value ?? 0)}</span>
            </p>
            {(explain?.breakdown ?? []).map((item) => {
              const width = Math.round((Math.abs(item.amount) / maxExplain) * 100);
              return (
                <div key={item.type} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{item.type}</span>
                    <span className="font-medium">{money(item.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div
                      className="h-2 rounded bg-slate-500/70"
                      style={{ width: `${Math.max(4, width)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {!explain?.breakdown?.length ? (
              <p className="text-xs text-muted-foreground">No explain breakdown available.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrity trend snapshots</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Snapshot hour</TableHead>
                <TableHead>Check</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {healthRows.map((row) => (
                <TableRow key={`${row.snapshotHour}-${row.checkKey}`}>
                  <TableCell className="text-xs">{formatShortDate(row.snapshotHour)}</TableCell>
                  <TableCell className="text-xs">{row.checkKey}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === "critical"
                          ? "destructive"
                          : row.status === "warning"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!healthRows.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No hourly snapshots available yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
