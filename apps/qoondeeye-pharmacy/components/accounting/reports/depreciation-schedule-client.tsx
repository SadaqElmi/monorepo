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
import { filterDepreciationTrialBalanceLines } from "@/lib/depreciation-trial-balance-filter";
import { getStoredUser } from "@/lib/auth-client";
import {
  getTrialBalance,
  type TrialBalanceLine,
} from "@/lib/services/accounting";
import { validateReportAsOf } from "@/lib/report-date-validation";

export type DepreciationScheduleReportClientProps = {
  initialRows: TrialBalanceLine[] | null;
  serverPrefetched: boolean;
  defaultAsOf: string;
};

export default function DepreciationScheduleReportClient({
  initialRows,
  serverPrefetched,
  defaultAsOf,
}: DepreciationScheduleReportClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [asOf, setAsOf] = React.useState(defaultAsOf);
  const [validationErr, setValidationErr] = React.useState<string | null>(null);

  const asOfCheck = React.useMemo(() => validateReportAsOf(asOf), [asOf]);

  const reportQuery = useErpReportQuery({
    reportId: "depreciation-schedule",
    tenantSlug,
    params: { asOf, branchId, aggregateAll },
    queryFn: async () => {
      const all = await getTrialBalance(tenantSlug, asOf, branchId, aggregateAll);
      return filterDepreciationTrialBalanceLines(all);
    },
    initialData:
      serverPrefetched && initialRows != null ? initialRows : undefined,
    enabled: asOfCheck.ok,
  });

  React.useEffect(() => {
    setValidationErr(asOfCheck.ok ? null : asOfCheck.message);
  }, [asOfCheck]);

  const rows = reportQuery.data ?? null;
  const loading = reportQuery.isFetching;
  const err =
    validationErr ??
    (reportQuery.error instanceof Error
      ? reportQuery.error.message
      : reportQuery.error
        ? "Failed to load depreciation snapshot"
        : null);

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">
          Depreciation schedule (GL snapshot)
        </CardTitle>
        <CardDescription>
          Trial balance lines for fixed-asset and depreciation-related accounts
          as of a date. Not a separate asset register.
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dep-asof" className="text-xs text-muted-foreground">
                As of
              </Label>
              <Input
                id="dep-asof"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
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
        {loading && rows === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : null}
        {rows ? (
          <div className="flex-1 overflow-auto p-4 pb-10">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Key</TableHead>
                  <TableHead className="text-muted-foreground">Account</TableHead>
                  <TableHead className="text-right text-muted-foreground">Debit</TableHead>
                  <TableHead className="text-right text-muted-foreground">Credit</TableHead>
                  <TableHead className="text-right text-muted-foreground">Net Dr − Cr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No depreciation-related accounts with balance.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((l) => {
                    const net = l.debit - l.credit;
                    return (
                      <TableRow key={l.accountKey} className="border-border">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {l.accountKey}
                        </TableCell>
                        <TableCell className="text-foreground">{l.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {money(l.debit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {money(l.credit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-foreground">
                          {money(net)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
