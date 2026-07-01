"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import { ROUTES, transactionRegisterDetailPath } from "@/lib/routes";
import { getTransactionRegisterDetail } from "@/lib/services/transaction-register";

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  registerId: string;
};

export default function TransactionRegisterDetailClient({ registerId }: Props) {
  const [tenantSlug] = useState(() => getStoredUser()?.tenantSlug?.trim() ?? null);
  const branchFacet = useErpBranchFacet();

  const detailQuery = useQuery({
    queryKey: erpKeys.transactionRegisterDetail(
      tenantSlug ?? "",
      branchFacet,
      registerId,
    ),
    enabled: Boolean(tenantSlug && branchFacet && registerId),
    staleTime: ERP_STALE_LIST,
    queryFn: ({ signal }) =>
      getTransactionRegisterDetail(tenantSlug!, registerId, { signal }),
  });

  const d = detailQuery.data;
  const loading = detailQuery.isLoading;
  const err = detailQuery.error;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading transaction…
      </div>
    );
  }

  if (err || !d) {
    return (
      <div className="flex flex-1 flex-col items-center gap-4 py-24">
        <p className="text-sm text-destructive">
          {err instanceof Error ? err.message : "Transaction not found"}
        </p>
        <Button variant="outline" asChild>
          <Link href={ROUTES.sales.transactionRegister}>
            <ArrowLeft className="mr-2 size-4" />
            Back to register
          </Link>
        </Button>
      </div>
    );
  }

  const dt = Date.parse(d.transaction_at);
  const dateStr = Number.isFinite(dt) ? format(new Date(dt), "yyyy-MM-dd") : "—";
  const timeStr = Number.isFinite(dt) ? format(new Date(dt), "HH:mm:ss") : "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.sales.transactionRegister}>
            <ArrowLeft className="mr-1 size-4" />
            Transaction Register
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">{d.transaction_no}</h1>
        <Badge variant={d.transaction_type === "refund" ? "destructive" : "secondary"}>
          {d.transaction_type === "refund" ? "Refund" : "Sale"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <span className="text-muted-foreground">Receipt</span>
            <p className="font-medium">{d.receipt_no ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Customer</span>
            <p className="font-medium">
              {d.customer_name ?? d.customer_no ?? "—"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Cashier</span>
            <p className="font-medium">
              {d.staff_code ?? d.staff_name ?? "—"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Manager</span>
            <p className="font-medium">{d.manager_override ?? d.manager_id ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Store</span>
            <p className="font-medium">{d.store_no ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Terminal</span>
            <p className="font-medium">{d.terminal_no ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Date</span>
            <p className="font-medium">{dateStr}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Time</span>
            <p className="font-medium">{timeStr}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Sales type</span>
            <p className="font-medium">{d.sales_type}</p>
          </div>
          {d.linked_sale_register_id ? (
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Original sale</span>
              <p>
                <Link
                  href={transactionRegisterDetailPath(d.linked_sale_register_id)}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  View original sale
                </Link>
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item No.</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.items.length ? (
                d.items.map((line, i) => (
                  <TableRow key={`${line.product_id ?? "line"}-${i}`}>
                    <TableCell>{line.item_no ?? "—"}</TableCell>
                    <TableCell>{line.product_name ?? "—"}</TableCell>
                    <TableCell className="text-right">{line.quantity}</TableCell>
                    <TableCell>
                      {line.uom_symbol ?? line.uom_code ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(line.unit_price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(line.discount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(line.net_amount)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No line items
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm font-medium">{d.payment_summary}</p>
            {d.payments.length ? (
              <ul className="space-y-2 text-sm">
                {d.payments.map((p, i) => (
                  <li key={`${p.method}-${i}`} className="flex justify-between">
                    <span>{p.method}</span>
                    <span>{formatMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No payment rows</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross</span>
              <span>{formatMoney(d.gross_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span>{formatMoney(d.discount_amount)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Net</span>
              <span>{formatMoney(d.net_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cost</span>
              <span>{formatMoney(d.cost_amount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-medium">
              <span>Profit</span>
              <span>{formatMoney(d.profit)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-muted-foreground">Created by</span>
            <p className="font-medium">
              {d.created_by?.staff_code ?? d.created_by?.name ?? "—"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Refunded by</span>
            <p className="font-medium">
              {d.refunded_by?.staff_code ?? d.refunded_by?.name ?? "—"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Open statement</span>
            <p className="font-medium truncate">{d.statement_no ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Posted statement</span>
            <p className="font-medium truncate">{d.posted_statement_no ?? "—"}</p>
            {!d.posted_statement_no ? (
              <p className="text-xs text-muted-foreground">
                Filled after shift close (Z-report).
              </p>
            ) : null}
          </div>
          {d.refund_status ? (
            <div>
              <span className="text-muted-foreground">Refund status</span>
              <p className="font-medium capitalize">{d.refund_status}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {d.linked_returns.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked refunds</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {d.linked_returns.map((r) => (
                <li key={r.register_id}>
                  <Link
                    href={transactionRegisterDetailPath(r.register_id)}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {r.transaction_no}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {formatMoney(r.net_amount)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
