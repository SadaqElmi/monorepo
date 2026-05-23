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
import {
  getTrialBalance,
  type TrialBalanceLine,
} from "@/lib/services/accounting";
import { validateReportAsOf } from "@/lib/report-date-validation";

export type TrialBalanceReportClientProps = {
  initialRows: TrialBalanceLine[] | null;
  serverPrefetched: boolean;
  defaultAsOf: string;
};

export default function TrialBalanceReportClient({
  initialRows,
  serverPrefetched,
  defaultAsOf,
}: TrialBalanceReportClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [asOf, setAsOf] = React.useState(defaultAsOf);
  const [validationErr, setValidationErr] = React.useState<string | null>(
    null,
  );

  const asOfCheck = React.useMemo(() => validateReportAsOf(asOf), [asOf]);

  const reportQuery = useErpReportQuery({
    reportId: "trial-balance",
    tenantSlug,
    params: { asOf, branchId, aggregateAll },
    queryFn: (scope) =>
      getTrialBalance(tenantSlug, asOf, scope.branchId, scope.aggregateAll),
    initialData:
      serverPrefetched && initialRows != null ? initialRows : undefined,
    enabled: asOfCheck.ok,
  });

  React.useEffect(() => {
    if (!asOfCheck.ok) {
      setValidationErr(asOfCheck.message);
    } else {
      setValidationErr(null);
    }
  }, [asOfCheck]);

  const rows = reportQuery.data ?? null;
  const loading = reportQuery.isFetching;
  const err =
    validationErr ??
    (reportQuery.error instanceof Error
      ? reportQuery.error.message
      : reportQuery.error
        ? "Failed to load trial balance"
        : null);

  const totalDebit = rows?.reduce((s, r) => s + r.debit, 0) ?? 0;
  const totalCredit = rows?.reduce((s, r) => s + r.credit, 0) ?? 0;

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Trial Balance</CardTitle>
        <CardDescription>
          {aggregateAll
            ? "Debits and credits aggregated across all branches you can access."
            : branchId
              ? "Debits and credits by account for the selected branch."
              : "Pick a branch or select all branches (admin/owner) to run this report."}
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tb-asof" className="text-xs text-muted-foreground">
                As of
              </Label>
              <Input
                id="tb-asof"
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
          <Alert variant="destructive" className="mx-4 mt-4">
            <AlertCircle />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        {loading && !rows ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : null}

        {rows ? (
          <div className="flex-1 overflow-auto p-4 pb-10">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Account</TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    Debit
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    Credit
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={`${r.accountKey}-${r.name}`}
                    className="border-border text-foreground hover:bg-muted/40"
                  >
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {r.accountKey}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.debit ? money(r.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.credit ? money(r.credit) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-border font-semibold text-foreground hover:bg-muted/60">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(totalDebit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(totalCredit)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
