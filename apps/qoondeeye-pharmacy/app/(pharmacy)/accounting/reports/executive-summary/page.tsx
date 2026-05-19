"use client";

import * as React from "react";
import { format, startOfMonth } from "date-fns";
import { AlertCircle, Loader2 } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import {
  getExecutiveSummary,
  type ExecutiveSummaryResult,
} from "@/lib/services/accounting";
import { validateReportDateRange } from "@/lib/report-date-validation";

export default function ExecutiveSummaryReportPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const now = new Date();
  const [from, setFrom] = React.useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = React.useState(format(now, "yyyy-MM-dd"));
  const [data, setData] = React.useState<ExecutiveSummaryResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const rangeCheck = validateReportDateRange(from, to, { branchId });
    if (!rangeCheck.ok) {
      setErr(rangeCheck.message);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await getExecutiveSummary(
        tenantSlug,
        from,
        to,
        branchId,
        aggregateAll,
      );
      setData(res);
    } catch (e: unknown) {
      setErr(
        e instanceof Error ? e.message : "Failed to load executive summary",
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, from, to, branchId, aggregateAll]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Executive summary</CardTitle>
        <CardDescription>
          Revenue, margins, net income, and outstanding AR/AP through period end.
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="es-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="es-to"
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
        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : null}
        {data ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["Revenue", data.revenue],
                ["Gross profit", data.grossProfit],
                ["Net income", data.netIncome],
                ["Outstanding receivables (as of end)", data.outstandingReceivables],
                ["Outstanding payables (as of end)", data.outstandingPayables],
                ["Dashboard series points", data.dailyProfitPoints],
              ] as const
            ).map(([label, n]) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-muted/50 p-4"
              >
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {typeof n === "number" && label !== "Dashboard series points"
                    ? money(n)
                    : String(n)}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
