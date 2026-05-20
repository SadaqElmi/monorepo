"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

export type BillsIntroAndStatsProps = {
  totalPurchasesCount: number;
};

export function BillsIntroAndStats({
  totalPurchasesCount,
}: BillsIntroAndStatsProps) {
  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchases</h1>
          <p className="mt-1 max-w-xl text-base text-muted-foreground">
            Record supplier invoices and goods received.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Total Purchases
            </p>
            <p className="text-2xl font-bold mt-1 text-primary">
              {totalPurchasesCount.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              All purchase records
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Active Orders
            </p>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              0
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Not tracked yet
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Pending Deliveries
            </p>
            <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
              0
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Not tracked yet
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
