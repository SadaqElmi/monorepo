"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAgedReceivable } from "@/lib/services/accounting";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import Link from "next/link";

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function AgedReceivableReportClient() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const [asOf, setAsOf] = React.useState(
    () => new Date().toISOString().slice(0, 10),
  );

  const reportQuery = useQuery({
    queryKey: erpKeys.report("aged-receivable", tenantSlug, "all", { asOf }),
    queryFn: () => getAgedReceivable(tenantSlug, asOf),
    enabled: Boolean(tenantSlug && asOf),
  });

  const lines = reportQuery.data?.lines ?? [];
  const total = lines.reduce((s, l) => s + Number(l.balance ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Aged Receivable
          </h1>
          <p className="text-sm text-muted-foreground">
            Customer AR balances as of the selected date.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-[160px]"
          />
          <Button
            variant="outline"
            onClick={() => void reportQuery.refetch()}
            disabled={reportQuery.isFetching}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Total outstanding: {money(total)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    No receivable balances for this date.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line) => (
                  <TableRow key={line.customerId}>
                    <TableCell>
                      <Link
                        href={`/customers/${line.customerId}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {line.customerName ?? line.customerId.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(line.balance)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
