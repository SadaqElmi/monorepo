"use client";

import * as React from "react";
import { zReportNum } from "@/lib/z-report-payload";
import type { ZReportPayload } from "@/lib/z-report-payload";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ShiftReportKind = "x" | "z";

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtUsd(n: number) {
  return `USD ${fmtMoney(n)}`;
}

function num(n: unknown, fallback = 0): number {
  return zReportNum(n, fallback);
}

function paymentRowsFromTotals(t: ZReportPayload["totals"]) {
  const rows: { method: string; amount: number }[] = [];
  if (t.cashTotal > 0.005) rows.push({ method: "Cash", amount: t.cashTotal });
  if (t.cardTotal > 0.005) rows.push({ method: "Card", amount: t.cardTotal });
  if (t.walletTotal > 0.005)
    rows.push({ method: "EVC / Wallet", amount: t.walletTotal });
  return rows.sort((a, b) => b.amount - a.amount);
}

export type ShiftReportViewProps = {
  kind: ShiftReportKind;
  data: ZReportPayload;
  staffDisplay: string;
  footer?: React.ReactNode;
  printTargetId?: string;
};

export const ShiftReportView = React.memo(function ShiftReportView({
  kind,
  data,
  staffDisplay,
  footer,
  printTargetId = "shift-report-print",
}: ShiftReportViewProps) {
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
    kind === "z" &&
    (data.statementPosted === true ||
      (data.statement != null && stmtLines.length > 0));

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
  const reportLabel = kind === "x" ? "X-Report" : "Z-Report";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 print:block print:min-h-0 print:p-0">
      <Card
        id={printTargetId}
        className="w-full max-w-lg border-slate-200 bg-white print:max-w-none print:border-0 print:shadow-none"
      >
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
          <span className="text-muted-foreground">{reportLabel}</span>
        </div>

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
            {reportLabel} ID : {data.sessionId}
          </p>
          {footer ? (
            <>
              <Separator className="my-4 bg-slate-200" />
              <div className="print:hidden">{footer}</div>
            </>
          ) : null}
        </div>
      </Card>
    </div>
  );
});
