"use client";

import * as React from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpReportQuery } from "@/hooks/queries/use-erp-report-query";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import { validateReportDateRange } from "@/lib/report-date-validation";
import {
  getTaxReport,
  type TaxReportResult,
} from "@/lib/services/accounting";

export type TaxReportClientProps = {
  initialData: TaxReportResult | null;
  serverPrefetched: boolean;
  defaultFrom: string;
  defaultTo: string;
};

export default function TaxReportClient({
  initialData,
  serverPrefetched,
  defaultFrom,
  defaultTo,
}: TaxReportClientProps) {
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
    reportId: "tax",
    tenantSlug,
    params: { from, to, branchId, aggregateAll },
    queryFn: () => getTaxReport(tenantSlug, from, to, branchId, aggregateAll),
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
        ? "Failed to load tax report"
        : null);

  const total = data?.lines.reduce((s, l) => s + l.amount, 0) ?? 0;

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Tax report</CardTitle>
        <CardDescription>
          Expense accounts whose name or key suggests tax, from posted journals.
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tax-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="tax-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="tax-to"
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
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : null}
        {data ? (
          <div className="flex-1 overflow-auto p-4 pb-10">
            <p className="mb-3 text-sm text-muted-foreground">
              Total tax-related expense (net Dr − Cr):{" "}
              <span className="font-medium text-foreground tabular-nums">
                {money(total)}
              </span>
            </p>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Account key</TableHead>
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-right text-muted-foreground">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell
                      colSpan={3}
                      className="text-muted-foreground"
                    >
                      No matching lines in period.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.lines.map((l) => (
                    <TableRow key={l.accountKey} className="border-border">
                      <TableCell className="font-mono text-xs text-foreground">
                        {l.accountKey}
                      </TableCell>
                      <TableCell className="text-foreground">{l.name}</TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {money(l.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
