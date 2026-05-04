"use client";

import * as React from "react";
import Link from "next/link";
import { usePos } from "@/components/pos-context";
import { getZReport } from "@/lib/api";
import { accountingPosStatementHref } from "@/lib/erp-app-link";
import { getCurrentPosSession } from "@/lib/services/pos-sessions";
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

type ZReportPayload = {
  sessionId: string;
  openedAt: string;
  currentTime: string;
  totals: {
    transactionCount: number;
    totalSales: number;
    taxAmount: number;
    netSales: number;
    cashTotal: number;
    cardTotal: number;
    walletTotal: number;
    cogsEstimate: number;
  };
  paymentByMethod?: Array<{ method: string; amount: number }>;
  paymentsTotal?: number;
  categorySales?: Array<{ categoryName: string; amount: number }>;
  reportStats?: {
    grossSales: number;
    discountTotal: number;
    discountTransactionCount: number;
    rounding: number;
    itemsSoldQuantity: number;
    refundCount: number;
    suspendedCount: number;
  };
  statementPosted?: boolean;
  statement?: {
    id: string;
    lines: Array<{
      id?: string;
      paymentBucket: string;
      expectedAmount: number;
      actualAmount: number;
      difference: number;
    }>;
  } | null;
};

function num(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

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

/** Accept camelCase or snake_case from the API; coerce nested numbers. */
function normalizeZReportPayload(res: unknown): ZReportPayload | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  const rawTotals = r.totals as Record<string, unknown> | undefined;
  if (!rawTotals || typeof rawTotals !== "object") return null;

  const t = (a: string, b: string) => num(rawTotals[a] ?? rawTotals[b], 0);

  const totals: ZReportPayload["totals"] = {
    transactionCount: t("transactionCount", "transaction_count"),
    totalSales: t("totalSales", "total_sales"),
    taxAmount: t("taxAmount", "tax_amount"),
    netSales: t("netSales", "net_sales"),
    cashTotal: t("cashTotal", "cash_total"),
    cardTotal: t("cardTotal", "card_total"),
    walletTotal: t("walletTotal", "wallet_total"),
    cogsEstimate: t("cogsEstimate", "cogs_estimate"),
  };

  const rawStats = r.reportStats as Record<string, unknown> | undefined;
  const reportStats = rawStats
    ? {
        grossSales: num(rawStats.grossSales ?? rawStats.gross_sales, 0),
        discountTotal: num(
          rawStats.discountTotal ?? rawStats.discount_total,
          0,
        ),
        discountTransactionCount: num(
          rawStats.discountTransactionCount ??
            rawStats.discount_transaction_count,
          0,
        ),
        rounding: num(rawStats.rounding, 0),
        itemsSoldQuantity: num(
          rawStats.itemsSoldQuantity ?? rawStats.items_sold_quantity,
          0,
        ),
        refundCount: num(rawStats.refundCount ?? rawStats.refund_count, 0),
        suspendedCount: num(
          rawStats.suspendedCount ?? rawStats.suspended_count,
          0,
        ),
      }
    : undefined;

  const rawPay = r.paymentByMethod ?? r.payment_by_method;
  let paymentByMethod: ZReportPayload["paymentByMethod"];
  if (Array.isArray(rawPay)) {
    paymentByMethod = rawPay.map((row) => {
      const x = row as Record<string, unknown>;
      return {
        method: String(x.method ?? x.payment_method ?? "Unspecified"),
        amount: num(x.amount, 0),
      };
    });
  }

  const rawCat = r.categorySales ?? r.category_sales;
  let categorySales: ZReportPayload["categorySales"];
  if (Array.isArray(rawCat)) {
    categorySales = rawCat.map((row) => {
      const x = row as Record<string, unknown>;
      return {
        categoryName: String(
          x.categoryName ?? x.category_name ?? "Uncategorized",
        ),
        amount: num(x.amount, 0),
      };
    });
  }

  let statementOut: ZReportPayload["statement"] | null | undefined;
  const stmtRaw = r.statement;
  if (stmtRaw === null) {
    statementOut = null;
  } else if (stmtRaw && typeof stmtRaw === "object") {
    const stmt = stmtRaw as Record<string, unknown>;
    const linesRaw = stmt.lines;
    const lines = Array.isArray(linesRaw)
      ? linesRaw.map((ln, i) => {
          const x = ln as Record<string, unknown>;
          return {
            id: typeof x.id === "string" ? x.id : undefined,
            paymentBucket: String(
              x.paymentBucket ?? x.payment_bucket ?? `bucket-${i}`,
            ),
            expectedAmount: num(x.expectedAmount ?? x.expected_amount, 0),
            actualAmount: num(x.actualAmount ?? x.actual_amount, 0),
            difference: num(x.difference, 0),
          };
        })
      : [];
    statementOut = {
      id: String(stmt.id ?? ""),
      lines,
    };
  }

  const paymentsTotalRaw = num(r.paymentsTotal ?? r.payments_total, Number.NaN);

  return {
    sessionId: String(r.sessionId ?? r.session_id ?? ""),
    openedAt: String(r.openedAt ?? r.opened_at ?? ""),
    currentTime: String(
      r.currentTime ?? r.current_time ?? new Date().toISOString(),
    ),
    totals,
    paymentByMethod,
    paymentsTotal: Number.isFinite(paymentsTotalRaw)
      ? paymentsTotalRaw
      : undefined,
    categorySales,
    reportStats,
    statementPosted: Boolean(r.statementPosted ?? r.statement_posted),
    statement: statementOut,
  };
}

export function ZReport() {
  const { currentUser, posSessionId, posSessionLoading } = usePos();
  const tenantSlug = currentUser?.tenantSlug?.trim() ?? null;
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ZReportPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (posSessionLoading) return;
    if (!tenantSlug) {
      setError("Missing tenant. Sign in again from the register.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const current = await getCurrentPosSession(tenantSlug);
        if (cancelled) return;
        const sessionId = current?.id ?? posSessionId;
        if (!sessionId) {
          setError(
            "No open or selected session. Open a shift on the register first.",
          );
          return;
        }
        const raw = await getZReport(tenantSlug, sessionId);
        if (cancelled) return;
        const normalized = normalizeZReportPayload(raw);
        if (!normalized) {
          setError("Invalid Z-Report response from server.");
          return;
        }
        setData(normalized);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not load Z-Report. Check your connection and branch.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, posSessionId, posSessionLoading]);

  if (loading || posSessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="text-muted-foreground text-sm">Loading Z-Report…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <p className="max-w-md text-center text-sm text-red-600">
          {error?.trim() ||
            (!data ? "Could not load Z-Report data." : "Unknown error.")}
        </p>
        <Button asChild variant="outline">
          <Link href="/">Back to register</Link>
        </Button>
      </div>
    );
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
