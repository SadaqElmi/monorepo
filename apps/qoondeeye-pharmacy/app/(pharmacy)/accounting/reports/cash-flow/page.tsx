"use client";

import * as React from "react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { AlertCircle, Loader2 } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Separator } from "@repo/ui/separator";
import { Skeleton } from "@repo/ui/skeleton";
import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import { ReportCertificationBadge } from "@/components/accounting/report-certification-badge";
import { ReportExportButtons } from "@/components/accounting/report-export-buttons";
import { ReportVariancePanel } from "@/components/accounting/report-variance-panel";
import { Checkbox } from "@repo/ui/checkbox";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import {
  getCashFlowStatement,
  type CashFlowLine,
  type CashFlowStatementResult,
  type ReportEnvelope,
} from "@/lib/services/accounting";
import { cn } from "@/lib/utils";

function Amount({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        value < 0 ? "text-red-400" : "text-emerald-400",
      )}
    >
      {money(value)}
    </span>
  );
}

function Section({
  title,
  total,
  lines,
}: {
  title: string;
  total: number;
  lines: CashFlowLine[];
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between bg-muted px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <span>{title}</span>
        <Amount value={total} />
      </div>
      {lines.length ? (
        lines.map((ln, idx) => (
          <div
            key={`${ln.accountKey}-${ln.sourceType}-${idx}`}
            className="flex min-h-10 items-center justify-between gap-4 border-b border-border/80 px-4 py-2 text-sm"
          >
            <div className="flex flex-col">
              <span className="text-foreground">{ln.name}</span>
              <span className="text-xs text-muted-foreground">{ln.sourceType}</span>
            </div>
            <Amount value={ln.netMovement} />
          </div>
        ))
      ) : (
        <div className="border-b border-border/80 px-4 py-2 text-sm text-muted-foreground">
          No cash movements in this section.
        </div>
      )}
    </div>
  );
}

export default function CashFlowReportPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const now = new Date();
  const [from, setFrom] = React.useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = React.useState(format(now, "yyyy-MM-dd"));
  const [compareFrom, setCompareFrom] = React.useState("");
  const [compareTo, setCompareTo] = React.useState("");
  const [compareSnapshot, setCompareSnapshot] = React.useState(false);
  const [data, setData] = React.useState<
    ReportEnvelope<CashFlowStatementResult> | null
  >(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await getCashFlowStatement(
        tenantSlug,
        from,
        to,
        branchId,
        aggregateAll,
        {
          compareFrom: compareFrom || undefined,
          compareTo: compareTo || undefined,
          compareSnapshot: compareSnapshot || undefined,
        },
      );
      setData(res);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load cash flow");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    tenantSlug,
    from,
    to,
    branchId,
    aggregateAll,
    compareFrom,
    compareTo,
    compareSnapshot,
  ]);

  const applyThisMonthVsLast = React.useCallback(() => {
    const cur = new Date();
    const prev = subMonths(cur, 1);
    setFrom(format(startOfMonth(cur), "yyyy-MM-dd"));
    setTo(format(endOfMonth(cur), "yyyy-MM-dd"));
    setCompareFrom(format(startOfMonth(prev), "yyyy-MM-dd"));
    setCompareTo(format(endOfMonth(prev), "yyyy-MM-dd"));
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Cash Flow Statement</CardTitle>
        <CardDescription>
          Direct-method cash movement classified into operating, investing, and financing activities.
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
            {data.performance?.isSlow ? (
              <span className="text-amber-400">
                Slow ({data.performance.elapsedMs}ms)
              </span>
            ) : null}
          </div>
        ) : null}
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cf-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="cf-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="cf-to"
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
              variant="outline"
              className="h-8"
              disabled={loading}
              onClick={applyThisMonthVsLast}
            >
              This month vs last
            </Button>
            <ReportExportButtons
              tenantSlug={tenantSlug}
              reportType="cash_flow"
              branchId={branchId}
              aggregateAll={aggregateAll}
              from={from}
              to={to}
              disabled={loading || (!branchId && !aggregateAll)}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="cf-compare-from"
                className="text-xs text-muted-foreground"
              >
                Compare from
              </Label>
              <Input
                id="cf-compare-from"
                type="date"
                value={compareFrom}
                onChange={(e) => setCompareFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="cf-compare-to"
                className="text-xs text-muted-foreground"
              >
                Compare to
              </Label>
              <Input
                id="cf-compare-to"
                type="date"
                value={compareTo}
                onChange={(e) => setCompareTo(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cf-compare-snapshot"
                  checked={compareSnapshot}
                  onCheckedChange={(v) => setCompareSnapshot(v === true)}
                />
                <label
                  htmlFor="cf-compare-snapshot"
                  className="max-w-[200px] text-xs text-muted-foreground"
                >
                  Prior saved snapshot (previous day)
                </label>
              </div>
            </div>
          </div>
        </CardAction>
      </CardHeader>

      <Separator />

      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0 pt-0">
        {err ? (
          <Alert
            variant="destructive"
            className="mx-4 mt-4"
          >
            <AlertCircle />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        {data?.warnings?.length ? (
          <Alert
            variant={data.isValid ? "default" : "destructive"}
            className="mx-4 mt-4 border-amber-200 bg-amber-50 text-amber-950"
          >
            <AlertCircle />
            <AlertTitle>
              {data.isValid ? "Validation warnings" : "Critical validation warnings"}
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
          <div className="flex-1 overflow-auto px-3 pb-10">
            {data.comparison ? (
              <div className="mt-3 grid grid-cols-1 gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-foreground md:grid-cols-2">
                <div>
                  Compare period net cash:{" "}
                  <span className="font-medium">
                    <Amount value={data.comparison.netCashMovement} />
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Op / Inv / Fin:{" "}
                  <span className="font-medium text-foreground">
                    <Amount value={data.comparison.sectionTotals.operating} />
                  </span>{" "}
                  /{" "}
                  <span className="font-medium text-foreground">
                    <Amount value={data.comparison.sectionTotals.investing} />
                  </span>{" "}
                  /{" "}
                  <span className="font-medium text-foreground">
                    <Amount value={data.comparison.sectionTotals.financing} />
                  </span>
                </div>
              </div>
            ) : null}
            {data.snapshotComparison ? (
              <div className="mt-2 rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Prior snapshot</span>{" "}
                {data.snapshotComparison.baselineSnapshotDate} (v
                {data.snapshotComparison.baselineVersion}) — Net cash{" "}
                <Amount value={data.snapshotComparison.baseline.netCashMovement} />
              </div>
            ) : null}
            <ReportVariancePanel
              mode="cf"
              variance={data.variance}
              snapshotDate={data.snapshotComparison?.baselineSnapshotDate}
            />
            <div className="mt-3 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
              Net cash movement: <Amount value={data.netCashMovement} />
            </div>
            <Section
              title="Operating Activities"
              total={data.sectionTotals.operating}
              lines={data.sections.operating}
            />
            <Section
              title="Investing Activities"
              total={data.sectionTotals.investing}
              lines={data.sections.investing}
            />
            <Section
              title="Financing Activities"
              total={data.sectionTotals.financing}
              lines={data.sections.financing}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
