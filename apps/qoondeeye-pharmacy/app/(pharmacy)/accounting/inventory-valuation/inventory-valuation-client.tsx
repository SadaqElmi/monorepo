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
import { useErpReportQuery } from "@/hooks/queries/use-erp-report-query";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { getStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import {
  getInventoryValuation,
  type InventoryValuationResult,
} from "@/lib/api";

export type InventoryValuationPageClientProps = {
  initialData?: InventoryValuationResult | null;
  serverPrefetched?: boolean;
};

export default function InventoryValuationPage({
  initialData = null,
  serverPrefetched = false,
}: InventoryValuationPageClientProps = {}) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();

  const valuationQuery = useErpReportQuery({
    reportId: "inventory-valuation",
    tenantSlug,
    params: { branchId, aggregateAll },
    queryFn: (scope) =>
      getInventoryValuation(tenantSlug, scope.branchId, scope.aggregateAll),
    initialData:
      serverPrefetched && initialData != null ? initialData : undefined,
    enabled: Boolean(branchId || aggregateAll),
  });
  const data = valuationQuery.data ?? null;
  const loading = valuationQuery.isPending;
  const loadError = valuationQuery.error;
  const displayError =
    loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load inventory value"
        : null;

  return (
    <div className="space-y-4">
      {displayError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {displayError}
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
