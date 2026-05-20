"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { usePos } from "@/components/pos-context";
import { usePosBranchFacet } from "@/hooks/use-pos-branch-facet";
import { getZReport } from "@/lib/api";
import { getCurrentPosSession } from "@/lib/services/pos-sessions";
import { posKeys, POS_STALE_SALES } from "@/lib/pos-query-keys";
import { normalizeZReportPayload, zReportNum } from "@/lib/z-report-payload";
import type { ZReportPayload } from "@/lib/z-report-payload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ZReportProps = {
  initialData?: ZReportPayload | null;
  serverPrefetched?: boolean;
  serverError?: string | null;
};

function fmtMoney(n: number) {
  const x = num(n, 0);
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtUsd(n: number) {
  return `USD ${fmtMoney(n)}`;
}

function paymentRowsFromTotals(t: ZReportPayload["totals"]) {
  const rows: { method: string; amount: number }[] = [];
  if (t.cashTotal > 0.005) rows.push({ method: "Cash", amount: t.cashTotal });
  if (t.cardTotal > 0.005) rows.push({ method: "Card", amount: t.cardTotal });
  if (t.walletTotal > 0.005)
    rows.push({ method: "EVC / Wallet", amount: t.walletTotal });
  return rows.sort((a, b) => b.amount - a.amount);
}

function num(n: unknown, fallback = 0): number {
  return zReportNum(n, fallback);
}

export function ZReport({
  initialData = null,
  serverPrefetched = false,
  serverError = null,
}: ZReportProps) {
  const { currentUser, posSessionId, posSessionLoading } = usePos();
  const tenantSlug = currentUser?.tenantSlug?.trim() ?? null;
  const branchFacet = usePosBranchFacet(tenantSlug);
  const prefetched: ZReportPayload | undefined =
    serverPrefetched && initialData != null ? initialData : undefined;
  const sessionKey =
    (prefetched?.sessionId ?? posSessionId ?? "").trim() || "pending";

  const zReportQuery = useQuery({
    queryKey: posKeys.zReport(tenantSlug ?? "", branchFacet, sessionKey),
    enabled: Boolean(tenantSlug && !posSessionLoading),
    initialData: prefetched,
    staleTime: prefetched ? POS_STALE_SALES : 0,
    queryFn: async () => {
      const current = await getCurrentPosSession(tenantSlug!);
      const sessionId = current?.id ?? posSessionId;
      if (!sessionId) {
        throw new Error(
          "No open or selected session. Open a shift on the register first.",
        );
      }
      const raw = await getZReport(tenantSlug!, sessionId);
      const normalized = normalizeZReportPayload(raw);
      if (!normalized) {
        throw new Error("Invalid Z-Report response from server.");
      }
      return normalized;
    },
  });

  const data = zReportQuery.data ?? null;
  const loading = zReportQuery.isFetching;

  const clientError =
    zReportQuery.error instanceof Error
      ? zReportQuery.error.message
      : zReportQuery.error
        ? "Could not load Z-Report. Check your connection and branch."
        : null;

  const blockingError = !data
    ? (clientError ??
      (serverPrefetched && serverError?.trim() ? serverError.trim() : null) ??
      (!tenantSlug && !posSessionLoading
        ? "Missing tenant. Sign in again from the register."
        : null))
    : null;

  const showSkeleton =
    !data &&
    (posSessionLoading ||
      zReportQuery.isPending ||
      (zReportQuery.isFetching && !serverPrefetched));

  if (showSkeleton) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="text-muted-foreground text-sm">Loading Z-Report…</p>
      </div>
    );
  }

  if (blockingError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <p className="max-w-md text-center text-sm text-red-600">
          {blockingError}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => void zReportQuery.refetch()}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to register</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const t = {
    transactionCount: num(data.totals.transactionCount),
    totalSales: num(data.totals.totalSales),
    taxAmount: num(data.totals.taxAmount),
    netSales: num(data.totals.netSales),
    cashTotal: num(data.totals.cashTotal),
    cardTotal: num(data.totals.cardTotal),
    walletTotal: num(data.totals.walletTotal),
    cogsEstimate: num(data.totals.cogsEstimate),
  };
  const stats = data.reportStats;
  const stmtLines = data.statement?.lines ?? [];
  const declarationDone =
    data.statementPosted === true ||
    (data.statement != null && stmtLines.length > 0);

  const rawMethods =
    data.paymentByMethod && data.paymentByMethod.length > 0
      ? data.paymentByMethod.map((x) => ({
          method: x.method,
          amount: num(x.amount, 0),
        }))
      : paymentRowsFromTotals(t);
  const activeMethods = rawMethods.filter((x) => x.amount > 0.005);
  const sumFromMethods = activeMethods.reduce((s, x) => s + x.amount, 0);
  const paymentsSum = Number.isFinite(num(data.paymentsTotal, Number.NaN))
    ? num(data.paymentsTotal, 0)
    : sumFromMethods;

  const categoryRows =
    data.categorySales?.filter((c) => c.amount > 0.005) ?? [];
  const showCategories = categoryRows.length > 0;

  const staffDisplay =
    currentUser?.staffId?.trim() || currentUser?.id?.slice(0, 8) || "—";

  const opened = data.openedAt ? new Date(data.openedAt).toLocaleString() : "—";
  const endDisplay = data.currentTime
    ? new Date(data.currentTime).toLocaleString()
    : "—";

  const grossSales = num(stats?.grossSales, t.netSales);
  const discountTotal = num(stats?.discountTotal, 0);
  const discountTxCount = Math.max(
    0,
    Math.floor(num(stats?.discountTransactionCount, 0)),
  );
  const rounding = num(stats?.rounding, 0);
  const itemsSold = Math.max(0, Math.floor(num(stats?.itemsSoldQuantity, 0)));
  const refundCount = Math.max(0, Math.floor(num(stats?.refundCount, 0)));
  const suspendedCount = Math.max(0, Math.floor(num(stats?.suspendedCount, 0)));

  const totalExclVat = Math.max(0, t.netSales - t.taxAmount);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg border-slate-200 bg-white">
        <div className="space-y-2 p-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Staff ID:</span>
            <span className="font-mono font-semibold text-foreground">
              {staffDisplay}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Start Date:</span>
            <span className="font-mono font-semibold text-foreground">
              {opened}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">End Date:</span>
            <span className="font-mono font-semibold text-foreground">
              {endDisplay}
            </span>
          </div>
        </div>

        <div className="border-b border-slate-200 p-3 text-center">
          <h2 className="mb-2 text-lg font-bold text-foreground">
            Qoondeeye Pharmacy
          </h2>
          <p className="text-xs text-muted-foreground">
            Customer Care Tel: +252 61 333 3333
          </p>
          <p className="text-xs text-muted-foreground">
            Adeeg No Tel: +252 61 333 3333
          </p>
        </div>

        <div className="border-b border-slate-200 p-2 text-center">
          <div className="flex justify-center">
            <span className="text-muted-foreground">Z-Report</span>
          </div>
        </div>

        {/* Financial Breakdown — payment methods */}
        <div className="border-b border-slate-200 p-6">
          <Table className="text-xs">
            <TableBody>
              {activeMethods.length <= 1 ? (
                <TableRow className="border-none hover:bg-transparent">
                  <TableCell className="px-0 py-2 text-muted-foreground">
                    Total
                  </TableCell>
                  <TableCell className="px-0 py-2 text-right font-mono font-semibold text-foreground">
                    {fmtUsd(paymentsSum)}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {activeMethods.map((row, idx) => (
                    <TableRow
                      key={`${row.method}-${idx}`}
                      className="border-none hover:bg-transparent"
                    >
                      <TableCell className="px-0 py-2 text-muted-foreground">
                        {row.method}
                      </TableCell>
                      <TableCell className="px-0 py-2 text-right font-mono font-semibold text-foreground">
                        {fmtUsd(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-none hover:bg-transparent">
                    <TableCell className="px-0 py-2 font-medium text-foreground">
                      Total
                    </TableCell>
                    <TableCell className="px-0 py-2 text-right font-mono font-semibold text-foreground">
                      {fmtUsd(paymentsSum)}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>

          <Separator className="my-3 bg-slate-200" />
          <Table className="w-full table-fixed text-xs">
            <colgroup>
              <col className="w-[52%]" />
              <col className="w-[24%]" />
              <col className="w-[24%]" />
            </colgroup>
            <TableBody>
              <TableRow className="border-b border-slate-200 hover:bg-transparent">
                <TableCell className="px-0 py-2 text-muted-foreground">
                  Gross Sales
                </TableCell>
                <TableCell className="px-0 py-2" />
                <TableCell className="px-0 py-2 text-right font-mono font-semibold text-foreground">
                  {fmtMoney(grossSales)}
                </TableCell>
              </TableRow>
              <TableRow className="border-b border-slate-200 hover:bg-transparent">
                <TableCell className="px-0 py-2 text-muted-foreground">
                  Discounts
                </TableCell>
                <TableCell className="px-0 py-2 text-right font-mono font-semibold text-foreground tabular-nums">
                  {discountTxCount}
                </TableCell>
                <TableCell className="px-0 py-2 text-right font-mono font-semibold text-foreground tabular-nums">
                  {discountTotal > 0
                    ? `-${fmtMoney(discountTotal)}`
                    : fmtMoney(0)}
                </TableCell>
              </TableRow>
              <TableRow className="border-b border-slate-200 hover:bg-transparent">
                <TableCell className="px-0 py-2 text-muted-foreground">
                  Rounding
                </TableCell>
                <TableCell className="px-0 py-2" />
                <TableCell className="px-0 py-2 text-right font-mono font-semibold text-foreground">
                  {fmtMoney(rounding)}
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableCell className="px-0 py-4 font-semibold text-foreground">
                  Total Net Sales
                </TableCell>
                <TableCell className="px-0 py-2" />
                <TableCell className="px-0 py-2 text-right font-mono font-bold text-foreground">
                  {fmtMoney(t.netSales)}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2 border-slate-300 hover:bg-transparent">
                <TableCell className="px-0 py-2 text-foreground">
                  Total including VAT
                </TableCell>
                <TableCell className="px-0 py-2" />
                <TableCell className="px-0 py-2 text-right font-mono text-foreground">
                  {fmtMoney(t.netSales)}
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableCell className="px-0 py-2 text-xs text-muted-foreground">
                  VAT (total)
                </TableCell>
                <TableCell className="px-0 py-2" />
                <TableCell className="px-0 py-2 text-right font-mono text-xs text-muted-foreground">
                  {fmtMoney(t.taxAmount)}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2 border-slate-300 hover:bg-transparent">
                <TableCell className="px-0 py-2 text-foreground">
                  Total Excluding VAT
                </TableCell>
                <TableCell className="px-0 py-2" />
                <TableCell className="px-0 py-2 text-right font-mono text-foreground">
                  {fmtMoney(totalExclVat)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {declarationDone && stmtLines.length > 0 && (
          <div className="border-b border-slate-200 p-6">
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Declaration (posted)
            </h3>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-0">Bucket</TableHead>
                  <TableHead className="px-0 text-right">Expected</TableHead>
                  <TableHead className="px-0 text-right">Actual</TableHead>
                  <TableHead className="px-0 text-right">Diff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stmtLines.map((ln, li) => (
                  <TableRow key={ln.id ?? `${ln.paymentBucket}-${li}`}>
                    <TableCell className="px-0 capitalize">
                      {ln.paymentBucket}
                    </TableCell>
                    <TableCell className="px-0 text-right font-mono">
                      {fmtMoney(num(ln.expectedAmount, 0))}
                    </TableCell>
                    <TableCell className="px-0 text-right font-mono">
                      {fmtMoney(num(ln.actualAmount, 0))}
                    </TableCell>
                    <TableCell
                      className={`px-0 text-right font-mono ${
                        Math.abs(num(ln.difference, 0)) > 0.005
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {fmtMoney(num(ln.difference, 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {showCategories && (
          <div className="border-b border-slate-200 p-6">
            <Table className="text-xs">
              <TableBody>
                {categoryRows.map((category, index) => (
                  <TableRow
                    key={`${category.categoryName}-${index}`}
                    className={`border-b border-slate-200 hover:bg-transparent ${
                      index % 2 === 1 ? "bg-slate-50" : ""
                    }`}
                  >
                    <TableCell className="px-0 py-2 text-muted-foreground">
                      {String(category.categoryName ?? "")
                        .trim()
                        .toUpperCase() || "UNCATEGORIZED"}
                    </TableCell>
                    <TableCell className="px-0 py-2 text-right font-mono font-semibold text-foreground">
                      {fmtMoney(category.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="p-6">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            TRANSACTION STATISTICS
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-end gap-5 border-b border-slate-200 pb-2">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono font-semibold text-foreground">
                QTY
              </span>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="text-muted-foreground">
                No. of Paying Customers
              </span>
              <span className="font-mono font-semibold text-foreground">
                {t.transactionCount}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="text-muted-foreground">No. of Transactions</span>
              <span className="font-mono font-semibold text-foreground">
                {t.transactionCount}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="text-muted-foreground">Items Sold</span>
              <span className="font-mono font-semibold text-foreground">
                {itemsSold}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="text-muted-foreground">No. of Refunds</span>
              <span className="font-mono font-semibold text-foreground">
                {refundCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">No. of Suspended</span>
              <span className="font-mono font-semibold text-foreground">
                {suspendedCount}
              </span>
            </div>
          </div>

          <Separator className="my-4 bg-slate-200" />
          <p className="text-start text-xs text-muted-foreground">
            Z-Report ID : {data.sessionId}
          </p>
          <Separator className="my-4 bg-slate-200" />
          <Button asChild className="w-full" variant="secondary">
            <Link href="/">Back</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
