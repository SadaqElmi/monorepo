export type ZReportPayload = {
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

export function zReportNum(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Accept camelCase or snake_case from the API; coerce nested numbers. */
export function normalizeZReportPayload(res: unknown): ZReportPayload | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  const rawTotals = r.totals as Record<string, unknown> | undefined;
  if (!rawTotals || typeof rawTotals !== "object") return null;

  const t = (a: string, b: string) => zReportNum(rawTotals[a] ?? rawTotals[b], 0);

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
        grossSales: zReportNum(rawStats.grossSales ?? rawStats.gross_sales, 0),
        discountTotal: zReportNum(
          rawStats.discountTotal ?? rawStats.discount_total,
          0,
        ),
        discountTransactionCount: zReportNum(
          rawStats.discountTransactionCount ??
            rawStats.discount_transaction_count,
          0,
        ),
        rounding: zReportNum(rawStats.rounding, 0),
        itemsSoldQuantity: zReportNum(
          rawStats.itemsSoldQuantity ?? rawStats.items_sold_quantity,
          0,
        ),
        refundCount: zReportNum(rawStats.refundCount ?? rawStats.refund_count, 0),
        suspendedCount: zReportNum(
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
        amount: zReportNum(x.amount, 0),
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
        amount: zReportNum(x.amount, 0),
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
            expectedAmount: zReportNum(x.expectedAmount ?? x.expected_amount, 0),
            actualAmount: zReportNum(x.actualAmount ?? x.actual_amount, 0),
            difference: zReportNum(x.difference, 0),
          };
        })
      : [];
    statementOut = {
      id: String(stmt.id ?? ""),
      lines,
    };
  }

  const paymentsTotalRaw = zReportNum(
    r.paymentsTotal ?? r.payments_total,
    Number.NaN,
  );

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
