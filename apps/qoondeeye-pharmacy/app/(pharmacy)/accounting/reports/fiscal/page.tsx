"use client";

import * as React from "react";
import { format, startOfMonth } from "date-fns";
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
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import {
  getFiscalReport,
  type FiscalReportResult,
} from "@/lib/services/accounting";

export default function FiscalReportPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const now = new Date();
  const [from, setFrom] = React.useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = React.useState(format(now, "yyyy-MM-dd"));
  const [data, setData] = React.useState<FiscalReportResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await getFiscalReport(
        tenantSlug,
        from,
        to,
        branchId,
        aggregateAll,
      );
      setData(res);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load fiscal report");
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
        <CardTitle className="text-lg">Fiscal report</CardTitle>
        <CardDescription>
          Period net income plus balance sheet totals as of the period end date.
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fiscal-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="fiscal-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fiscal-to" className="text-xs text-muted-foreground">
                To (balance sheet as of)
              </Label>
              <Input
                id="fiscal-to"
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
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : null}
        {data ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {(
              [
                ["Net income (period)", data.netIncome],
                ["Total assets (as of end)", data.totalAssets],
                ["Total liabilities", data.totalLiabilities],
                ["Total equity", data.totalEquity],
              ] as const
            ).map(([label, n]) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-muted/50 p-4"
              >
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {money(n)}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
