"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

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
  getPatientLoans,
  type PatientLoan,
} from "@/lib/services/patient-loans";

function loanAmount(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type LoansAnalysisReportClientProps = {
  initialLoans: PatientLoan[] | null;
  serverPrefetched: boolean;
};

export default function LoansAnalysisReportClient({
  initialLoans,
  serverPrefetched,
}: LoansAnalysisReportClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();

  const reportQuery = useErpReportQuery({
    reportId: "loans-analysis",
    tenantSlug,
    params: { branchId, aggregateAll },
    queryFn: (_scope) => getPatientLoans(tenantSlug),
    initialData:
      serverPrefetched && initialLoans != null ? initialLoans : undefined,
  });

  const rows = reportQuery.data ?? null;
  const loading = reportQuery.isFetching;
  const err =
    reportQuery.error instanceof Error
      ? reportQuery.error.message
      : reportQuery.error
        ? "Failed to load loans"
        : null;

  const displayRows =
    branchId && rows
      ? rows.filter((l) => l.branch_id === branchId)
      : (rows ?? []);

  const totals = displayRows.reduce(
    (acc, l) => {
      const total = loanAmount(l.total_amount);
      const paid = loanAmount(l.amount_paid);
      acc.totalPrincipal += total;
      acc.totalPaid += paid;
      acc.count += 1;
      const st = (l.status ?? "unknown").toLowerCase();
      acc.byStatus[st] = (acc.byStatus[st] ?? 0) + 1;
      return acc;
    },
    {
      count: 0,
      totalPrincipal: 0,
      totalPaid: 0,
      byStatus: {} as Record<string, number>,
    },
  );

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Loans analysis</CardTitle>
        <CardDescription>
          Patient loans for the selected branch (or all loans if no branch in
          header). Manage loans in{" "}
          <Link href="/customers/patient-loans" className="text-primary underline">
            Patient loans
          </Link>
          .
        </CardDescription>
        <CardAction>
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
          <div className="space-y-4 p-4 pb-10">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Loans</div>
                <div className="text-xl font-semibold text-foreground">
                  {totals.count}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Total principal</div>
                <div className="text-xl font-semibold tabular-nums text-foreground">
                  {money(totals.totalPrincipal)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Outstanding (approx.)</div>
                <div className="text-xl font-semibold tabular-nums text-foreground">
                  {money(totals.totalPrincipal - totals.totalPaid)}
                </div>
              </div>
            </div>
            {Object.keys(totals.byStatus).length > 0 ? (
              <p className="text-xs text-muted-foreground">
                By status:{" "}
                {Object.entries(totals.byStatus)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </p>
            ) : null}
            <div className="overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Customer</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-right text-muted-foreground">Total</TableHead>
                    <TableHead className="text-right text-muted-foreground">Paid</TableHead>
                    <TableHead className="text-right text-muted-foreground">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No loans for this filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayRows.map((l) => {
                      const total = loanAmount(l.total_amount);
                      const paid = loanAmount(l.amount_paid);
                      return (
                        <TableRow key={l.id} className="border-border">
                          <TableCell className="text-foreground">
                            {l.customer_name ?? l.customer_id?.slice(0, 8) ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {l.status ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">
                            {money(total)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">
                            {money(paid)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-foreground">
                            {money(total - paid)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
