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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import {
  getInvoiceAnalysis,
  type InvoiceAnalysisResult,
} from "@/lib/services/accounting";
import { validateReportDateRange } from "@/lib/report-date-validation";

export default function InvoiceAnalysisReportPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const now = new Date();
  const [from, setFrom] = React.useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = React.useState(format(now, "yyyy-MM-dd"));
  const [data, setData] = React.useState<InvoiceAnalysisResult | null>(null);
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
      const res = await getInvoiceAnalysis(
        tenantSlug,
        from,
        to,
        branchId,
        aggregateAll,
      );
      setData(res);
    } catch (e: unknown) {
      setErr(
        e instanceof Error ? e.message : "Failed to load invoice analysis",
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
        <CardTitle className="text-lg">Invoice analysis</CardTitle>
        <CardDescription>
          POS vs on-account revenue from journal source types in the period.
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ia-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="ia-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ia-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="ia-to"
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
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : null}
        {data ? (
          <div className="flex-1 overflow-auto p-4 pb-10">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Source type</TableHead>
                  <TableHead className="text-right text-muted-foreground">Entries</TableHead>
                  <TableHead className="text-right text-muted-foreground">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No data in period.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.lines.map((l) => (
                    <TableRow key={l.sourceType} className="border-border">
                      <TableCell className="font-mono text-xs text-foreground">
                        {l.sourceType}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {l.entryCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {money(l.revenue)}
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
