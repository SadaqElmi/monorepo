"use client";

import * as React from "react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import { ReportCertificationBadge } from "@/components/accounting/report-certification-badge";
import { ReportExportButtons } from "@/components/accounting/report-export-buttons";
import { ReportVariancePanel } from "@/components/accounting/report-variance-panel";
import { Checkbox } from "@/components/ui/checkbox";
import { useErpReportQuery } from "@/hooks/queries/use-erp-report-query";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import { validateReportDateRange } from "@/lib/report-date-validation";
import {
  getVarianceAnalysis,
  getIncomeStatement,
  type IncomeStatementResult,
  type ReportEnvelope,
  type VarianceAnalysisRow,
} from "@/lib/services/accounting";
import { cn } from "@/lib/utils";

type ProfitLossReportBundle = {
  data: ReportEnvelope<IncomeStatementResult>;
  varianceDrivers: VarianceAnalysisRow | null;
};

export type ProfitLossReportClientProps = {
  initialData: ReportEnvelope<IncomeStatementResult> | null;
  initialVarianceDrivers: VarianceAnalysisRow | null;
  serverPrefetched: boolean;
  defaultFrom: string;
  defaultTo: string;
};

function Bal({ n }: { n: number }) {
  const neg = n < 0;
  return (
    <span
      className={cn(
        "tabular-nums tracking-tight",
        neg ? "font-medium text-red-500" : "text-foreground",
      )}
    >
      {money(n)}
    </span>
  );
}

export default function ProfitLossReportClient({
  initialData,
  initialVarianceDrivers,
  serverPrefetched,
  defaultFrom,
  defaultTo,
}: ProfitLossReportClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [compareFrom, setCompareFrom] = React.useState("");
  const [compareTo, setCompareTo] = React.useState("");
  const [compareSnapshot, setCompareSnapshot] = React.useState(false);
  const [monthly, setMonthly] = React.useState(false);
  const [validationErr, setValidationErr] = React.useState<string | null>(null);

  const rangeCheck = React.useMemo(
    () =>
      validateReportDateRange(from, to, {
        compareFrom: compareFrom || undefined,
        compareTo: compareTo || undefined,
        branchId,
      }),
    [from, to, compareFrom, compareTo, branchId],
  );

  const initialBundle: ProfitLossReportBundle | undefined =
    serverPrefetched && initialData != null
      ? { data: initialData, varianceDrivers: initialVarianceDrivers }
      : undefined;

  const reportQuery = useErpReportQuery<ProfitLossReportBundle>({
    reportId: "profit-loss",
    tenantSlug,
    params: {
      from,
      to,
      branchId,
      aggregateAll,
      monthly,
      compareFrom,
      compareTo,
      compareSnapshot,
    },
    queryFn: async () => {
      const [res, driverRes] = await Promise.all([
        getIncomeStatement(tenantSlug, from, to, branchId, aggregateAll, {
          breakdown: monthly ? "monthly" : undefined,
          compareFrom: compareFrom || undefined,
          compareTo: compareTo || undefined,
          compareSnapshot: compareSnapshot || undefined,
        }),
        getVarianceAnalysis(
          tenantSlug,
          from,
          to,
          "inventory",
          branchId,
          aggregateAll,
        ),
      ]);
      return { data: res, varianceDrivers: driverRes.rows?.[0] ?? null };
    },
    initialData: initialBundle,
    enabled: rangeCheck.ok,
  });

  React.useEffect(() => {
    setValidationErr(rangeCheck.ok ? null : rangeCheck.message);
  }, [rangeCheck]);

  const data = reportQuery.data?.data ?? null;
  const varianceDrivers = reportQuery.data?.varianceDrivers ?? null;
  const loading = reportQuery.isFetching;
  const err =
    validationErr ??
    (reportQuery.error instanceof Error
      ? reportQuery.error.message
      : reportQuery.error
        ? "Failed to load profit and loss"
        : null);

  const applyThisMonthVsLast = React.useCallback(() => {
    const cur = new Date();
    const prev = subMonths(cur, 1);
    setFrom(format(startOfMonth(cur), "yyyy-MM-dd"));
    setTo(format(endOfMonth(cur), "yyyy-MM-dd"));
    setCompareFrom(format(startOfMonth(prev), "yyyy-MM-dd"));
    setCompareTo(format(endOfMonth(prev), "yyyy-MM-dd"));
  }, []);

  const revenueLines =
    data?.lines.filter((l) => l.accountType === "income") ?? [];
  const expenseLines =
    data?.lines.filter((l) => l.accountType === "expense") ?? [];

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Profit and Loss</CardTitle>
        <CardDescription>
          {aggregateAll
            ? "Revenue and expenses aggregated across all branches you can access."
            : branchId
              ? "Revenue and expenses for the selected branch."
              : "Pick a branch or select all branches (admin/owner) to run this report."}
        </CardDescription>
        <ReportScopeBadge />
        {data ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ReportCertificationBadge reportStatus={data.reportStatus} />
            <span>{data.finalization?.isFinal ? "FINAL" : "Draft period"}</span>
            {data.finalization?.lockDate ? (
              <span>Lock date: {data.finalization.lockDate}</span>
            ) : null}
            {data.snapshot ? (
              <span>Snapshot v{data.snapshot.version}</span>
            ) : null}
            {data.kpis ? (
              <span className="tabular-nums">
                GM {data.kpis.grossMarginPct != null ? `${data.kpis.grossMarginPct.toFixed(1)}%` : "—"}
                {" · "}
                NPM {data.kpis.netProfitMarginPct != null ? `${data.kpis.netProfitMarginPct.toFixed(1)}%` : "—"}
                {data.kpis.revenueGrowthPct != null ? (
                  <>
                    {" · "}
                    Rev Δ {data.kpis.revenueGrowthPct >= 0 ? "+" : ""}
                    {data.kpis.revenueGrowthPct.toFixed(1)}%
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}
        {data?.snapshot?.snapshotDiff &&
        typeof data.snapshot.snapshotDiff === "object" &&
        data.snapshot.snapshotDiff.basis !== "first_snapshot" ? (
          <p className="text-[10px] text-muted-foreground">
            Stored snapshot diff vs prior (
            {String(data.snapshot.snapshotDiff.basis ?? "prior")})
          </p>
        ) : null}
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pl-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="pl-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="pl-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={loading}
              onClick={() => void reportQuery.refetch()}
            >
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={loading}
              onClick={applyThisMonthVsLast}
            >
              This month vs last
            </Button>
            <ReportExportButtons
              tenantSlug={tenantSlug}
              reportType="profit_loss"
              branchId={branchId}
              aggregateAll={aggregateAll}
              from={from}
              to={to}
              disabled={loading || (!branchId && !aggregateAll)}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="pl-compare-snapshot"
                checked={compareSnapshot}
                onCheckedChange={(v) => setCompareSnapshot(v === true)}
              />
              <label
                htmlFor="pl-compare-snapshot"
                className="text-xs text-muted-foreground"
              >
                Compare to prior saved snapshot (previous day)
              </label>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="pl-compare-from"
                className="text-xs text-muted-foreground"
              >
                Compare from
              </Label>
              <Input
                id="pl-compare-from"
                type="date"
                value={compareFrom}
                onChange={(e) => setCompareFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-compare-to" className="text-xs text-muted-foreground">
                Compare to
              </Label>
              <Input
                id="pl-compare-to"
                type="date"
                value={compareTo}
                onChange={(e) => setCompareTo(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant={monthly ? "default" : "outline"}
              className="h-8"
              onClick={() => setMonthly((v) => !v)}
            >
              {monthly ? "Monthly breakdown on" : "Monthly breakdown off"}
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      <div className="flex justify-end px-4 py-2 text-sm text-muted-foreground">
        <span className="w-28 text-right font-medium text-foreground">
          Amount
        </span>
      </div>

      <Separator />

      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0 pt-0">
        {err ? (
          <Alert
            variant="destructive"
            className="mx-4 mt-4"
          >
            <AlertCircle />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {err}
            </AlertDescription>
          </Alert>
        ) : null}

        {data?.warnings?.length ? (
          <Alert
            variant={data.isValid ? "default" : "destructive"}
            className="mx-4 mt-4 border-amber-200 bg-amber-50 text-amber-950"
          >
            <AlertCircle />
            <AlertTitle>
              {data.isValid
                ? "Validation warnings"
                : "Critical validation warnings"}
            </AlertTitle>
            <AlertDescription>
              <div className="space-y-1 text-xs">
                {data.warnings.slice(0, 5).map((w, idx) => (
                  <p key={`${w.code}-${idx}`}>
                    {w.severity.toUpperCase()}: {w.message}
                  </p>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : null}

        {data ? (
          <div className="flex-1 overflow-auto pb-10">
            <div className="mx-3 my-2 flex items-center justify-between rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>P&L formula check</span>
              <span
                className={cn(
                  "font-medium",
                  Math.abs(
                    data.netIncome - (data.totalRevenue - data.totalExpenses),
                  ) < 0.01
                    ? "text-emerald-400"
                    : "text-amber-400",
                )}
              >
                Difference:{" "}
                {money(
                  data.netIncome - (data.totalRevenue - data.totalExpenses),
                )}
              </span>
            </div>
            {data.drilldownCheck ? (
              <div className="mx-3 mb-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Drill-down consistency:{" "}
                <span
                  className={cn(
                    "font-medium",
                    data.drilldownCheck.isConsistent
                      ? "text-emerald-400"
                      : "text-amber-400",
                  )}
                >
                  {data.drilldownCheck.isConsistent
                    ? "Consistent"
                    : `${data.drilldownCheck.mismatches} mismatches`}
                </span>
              </div>
            ) : null}
            {data.comparison ? (
              <div className="mx-3 mb-2 grid grid-cols-1 gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-foreground md:grid-cols-3">
                <div>
                  Comparison Revenue:{" "}
                  <span className="font-medium">
                    {money(data.comparison.totalRevenue)}
                  </span>
                </div>
                <div>
                  Comparison Expenses:{" "}
                  <span className="font-medium">
                    {money(data.comparison.totalExpenses)}
                  </span>
                </div>
                <div>
                  Comparison Net:{" "}
                  <span className="font-medium">
                    {money(data.comparison.netIncome)}
                  </span>
                </div>
              </div>
            ) : null}
            {data.snapshotComparison ? (
              <div className="mx-3 mb-2 rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Prior snapshot</span>{" "}
                {data.snapshotComparison.baselineSnapshotDate} (v
                {data.snapshotComparison.baselineVersion}) — Revenue{" "}
                {money(data.snapshotComparison.baseline.totalRevenue)}, Expenses{" "}
                {money(data.snapshotComparison.baseline.totalExpenses)}, Net{" "}
                {money(data.snapshotComparison.baseline.netIncome)}
              </div>
            ) : null}
            <ReportVariancePanel
              mode="pnl"
              variance={data.variance}
              snapshotDate={data.snapshotComparison?.baselineSnapshotDate}
              driverRows={varianceDrivers?.drivers ?? []}
            />
            <div className="bg-muted px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Revenue
            </div>
            {revenueLines.map((ln) => (
              <div
                key={`${ln.accountKey}-${ln.name}`}
                className="flex min-h-10 items-center justify-between gap-4 border-b border-border/80 px-6 py-2 text-sm"
              >
                {ln.drilldownPath ? (
                  <Link
                    className="text-primary hover:underline"
                    href={ln.drilldownPath}
                  >
                    {ln.name}
                  </Link>
                ) : (
                  <span className="text-foreground">{ln.name}</span>
                )}
                <Bal n={ln.amount} />
              </div>
            ))}
            <div className="flex min-h-10 items-center justify-between gap-4 border-b border-border/80 px-4 py-2 text-sm font-semibold text-foreground">
              <span>Total revenue</span>
              <Bal n={data.totalRevenue} />
            </div>

            <div className="mt-4 bg-muted px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Expenses
            </div>
            {expenseLines.map((ln) => (
              <div
                key={`${ln.accountKey}-${ln.name}`}
                className="flex min-h-10 items-center justify-between gap-4 border-b border-border/80 px-6 py-2 text-sm"
              >
                {ln.drilldownPath ? (
                  <Link
                    className="text-primary hover:underline"
                    href={ln.drilldownPath}
                  >
                    {ln.name}
                  </Link>
                ) : (
                  <span className="text-foreground">{ln.name}</span>
                )}
                <Bal n={ln.amount} />
              </div>
            ))}
            <div className="flex min-h-10 items-center justify-between gap-4 border-b border-border/80 px-4 py-2 text-sm font-semibold text-foreground">
              <span>Total expenses</span>
              <Bal n={data.totalExpenses} />
            </div>

            <div className="mt-4 space-y-2 px-4 py-4 text-sm text-muted-foreground">
              {data.monthlyBreakdown?.length ? (
                <div className="rounded border border-border p-3">
                  <p className="mb-2 text-xs uppercase text-muted-foreground">
                    Monthly breakdown
                  </p>
                  <div className="space-y-1 text-xs">
                    {data.monthlyBreakdown.map((m) => (
                      <div
                        key={m.month}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>{m.month}</span>
                        <span>{money(m.netIncome)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>Cost of goods sold</span>
                <Bal n={data.cogs} />
              </div>
              {data.intercompany ? (
                <>
                  <div className="flex justify-between">
                    <span>Intercompany revenue</span>
                    <Bal n={-Math.abs(data.intercompany.revenue)} />
                  </div>
                  <div className="flex justify-between">
                    <span>Net revenue (after intercompany)</span>
                    <Bal n={data.netRevenue ?? data.totalRevenue} />
                  </div>
                </>
              ) : null}
              <div className="flex justify-between">
                <span>Gross profit</span>
                <Bal n={data.grossProfit} />
              </div>
              <div className="flex justify-between">
                <span>Other expenses</span>
                <Bal n={data.otherExpenses} />
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
                <span>Net income</span>
                <Bal n={data.netIncome} />
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
