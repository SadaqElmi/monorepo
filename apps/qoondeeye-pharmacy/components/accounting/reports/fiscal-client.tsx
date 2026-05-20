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
import { useErpReportQuery } from "@/hooks/queries/use-erp-report-query";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import {
  getFiscalReport,
  type FiscalReportResult,
} from "@/lib/services/accounting";
import { validateReportDateRange } from "@/lib/report-date-validation";

export type FiscalReportClientProps = {
  initialData: FiscalReportResult | null;
  serverPrefetched: boolean;
  defaultFrom: string;
  defaultTo: string;
};

export default function FiscalReportClient({
  initialData,
  serverPrefetched,
  defaultFrom,
  defaultTo,
}: FiscalReportClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [validationErr, setValidationErr] = React.useState<string | null>(null);

  const rangeCheck = React.useMemo(
    () => validateReportDateRange(from, to, { branchId }),
    [from, to, branchId],
  );

  const reportQuery = useErpReportQuery({
    reportId: "fiscal",
    tenantSlug,
    params: { from, to, branchId, aggregateAll },
    queryFn: () =>
      getFiscalReport(tenantSlug, from, to, branchId, aggregateAll),
    initialData:
      serverPrefetched && initialData != null ? initialData : undefined,
    enabled: rangeCheck.ok,
  });

  React.useEffect(() => {
    setValidationErr(rangeCheck.ok ? null : rangeCheck.message);
  }, [rangeCheck]);

  const data = reportQuery.data ?? null;
  const loading = reportQuery.isFetching;
  const err =
    validationErr ??
    (reportQuery.error instanceof Error
      ? reportQuery.error.message
      : reportQuery.error
        ? "Failed to load fiscal report"
        : null);

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
              onClick={() => void reportQuery.refetch()}
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
