"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { getStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import {
  getInventoryValuation,
  type InventoryValuationResult,
} from "@/lib/api";

export default function InventoryValuationPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();

  const [data, setData] = React.useState<InventoryValuationResult | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!branchId && !aggregateAll) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void getInventoryValuation(tenantSlug, branchId, aggregateAll)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setErr(
            e instanceof Error ? e.message : "Failed to load inventory value",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, branchId, aggregateAll]);

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Inventory valuation</CardTitle>
          <CardDescription>
            {aggregateAll
              ? "Stock value aggregated across branches you can access."
              : branchId
                ? "Stock value at weighted-average batch cost for the selected branch."
                : "Select a branch or all branches (admin/owner) to view valuation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : null}
          {!loading && !data ? (
            <p className="text-sm text-muted-foreground">
              No valuation data for the current branch selection.
            </p>
          ) : null}
          {data && !loading ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    <TableHead className="text-right">Line value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lines.map((line) => (
                    <TableRow key={line.productId}>
                      <TableCell>{line.productName ?? line.productId}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.qty}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(line.unitCost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(line.lineValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-4 text-right text-sm font-medium">
                Total: {money(data.totalValue)}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
