"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ErpWorkbenchShell } from "@/components/erp/erp-workbench-shell";
import { PosOpsQuickLinks } from "@/components/pos/pos-ops-quick-links";
import { ConfigurationErrorBanner } from "@/components/configuration/configuration-status-banner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStoredUser } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import { listCashMovements } from "@/lib/services/pos-cash-drawer";

function movementLabel(type: string): string {
  return type.replaceAll("_", " ");
}

export function CashMovementsClient() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const query = useQuery({
    queryKey: ["erp", "cash-movements", tenantSlug, from, to],
    enabled: Boolean(tenantSlug),
    queryFn: () =>
      listCashMovements(tenantSlug, {
        from: from || undefined,
        to: to || undefined,
        limit: 100,
      }),
  });

  const error =
    query.error instanceof Error ? query.error.message : null;

  return (
    <ErpWorkbenchShell
      breadcrumbs={[
        { label: "Accounting", href: ROUTES.accounting.root },
        { label: "Cash movements" },
      ]}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cash movements</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Paid-in, paid-out, safe drops, and petty cash recorded from POS
              supervisor mode.
            </p>
          </div>
          <PosOpsQuickLinks />
        </div>

        {error ? <ConfigurationErrorBanner message={error} /> : null}

        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cash-from">From</Label>
            <Input
              id="cash-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cash-to">To</Label>
            <Input
              id="cash-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[180px]"
            />
          </div>
        </div>

        {query.isPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Session</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No cash movements in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  (query.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {movementLabel(row.movementType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {row.amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                        {row.note ?? row.reasonCode ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.sessionId.slice(0, 8)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </ErpWorkbenchShell>
  );
}
