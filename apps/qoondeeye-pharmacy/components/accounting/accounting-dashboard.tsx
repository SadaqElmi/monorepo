"use client";

import * as React from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileDown,
  FileUp,
  Landmark,
  Loader2,
  Plus,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  getAuditTrail,
  getBalanceSheet,
  getExecutiveSummary,
  getJournalEntries,
  type AuditLogRow,
  type BalanceSheetResult,
  type ExecutiveSummaryResult,
  type JournalEntryRow,
} from "@/lib/services/accounting";

function balanceForKey(bs: BalanceSheetResult | null, key: string): number {
  if (!bs) return 0;
  const line = bs.lines.find((l) => l.accountKey === key);
  return line?.balance ?? 0;
}

function journalSourceLabel(sourceType: string): string {
  const map: Record<string, string> = {
    sale: "POS / Sale",
    customer_invoice: "Customer invoice",
    purchase: "Vendor bill",
    purchase_reversal: "Purchase void",
    purchase_refund: "Vendor refund",
    sale_return: "Credit note",
    expense: "Expense",
    manual: "Manual entry",
    ap_payment: "Supplier payment",
    ar_payment: "Customer payment",
  };
  return map[sourceType] ?? sourceType.replace(/_/g, " ");
}

function entryAmount(entry: JournalEntryRow): number {
  let d = 0;
  for (const ln of entry.lines) {
    d += Number(ln.debit);
  }
  return d;
}

function entryPartner(entry: JournalEntryRow): string {
  const line = entry.lines.find((l) => l.partner_id);
  if (!line?.partner_id) return "—";
  return (
    (line.partner_kind === "customer" ? "Customer " : "Supplier ") +
    line.partner_id.slice(0, 8) +
    "…"
  );
}

export type AccountingDashboardProps = {
  tenantSlug?: string;
  serverScope?: { branchId?: string; aggregateAll?: boolean };
  initialBalanceSheet?: BalanceSheetResult | null;
  initialJournals?: JournalEntryRow[];
  initialExecutive?: ExecutiveSummaryResult | null;
  initialAudit?: AuditLogRow[];
  serverPrefetched?: boolean;
};

export function AccountingDashboard({
  tenantSlug: tenantSlugProp,
  serverScope,
  initialBalanceSheet = null,
  initialJournals = [],
  initialExecutive = null,
  initialAudit = [],
  serverPrefetched = false,
}: AccountingDashboardProps) {
  const { branchId: hookBranchId, aggregateAll: hookAggregateAll } =
    useReportBranchQuery();
  const effectiveBranchId = hookBranchId ?? serverScope?.branchId;
  const effectiveAggregateAll =
    hookAggregateAll ||
    (!hookBranchId && Boolean(serverScope?.aggregateAll));

  const [tenantSlug] = React.useState(
    () => tenantSlugProp?.trim() || getStoredUser()?.tenantSlug || "pharmacy1",
  );

  const skipPrefetchOnce = React.useRef(serverPrefetched);

  const [loading, setLoading] = React.useState(() => !serverPrefetched);
  const [error, setError] = React.useState<string | null>(null);
  const [balanceSheet, setBalanceSheet] = React.useState<BalanceSheetResult | null>(
    initialBalanceSheet,
  );
  const [journals, setJournals] = React.useState<JournalEntryRow[]>(
    initialJournals,
  );
  const [executive, setExecutive] = React.useState<ExecutiveSummaryResult | null>(
    initialExecutive,
  );
  const [audit, setAudit] = React.useState<AuditLogRow[]>(initialAudit);

  const asOf = React.useMemo(
    () => format(new Date(), "yyyy-MM-dd"),
    [],
  );
  const periodLabel = React.useMemo(() => {
    const start = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "MMM d");
    const end = format(new Date(), "MMM d, yyyy");
    return `${start} – ${end}`;
  }, []);

  React.useEffect(() => {
    if (skipPrefetchOnce.current) {
      skipPrefetchOnce.current = false;
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const from = format(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        "yyyy-MM-dd",
      );
      const to = asOf;
      try {
        const [bs, je, ex] = await Promise.all([
          getBalanceSheet(tenantSlug, asOf, effectiveBranchId, effectiveAggregateAll),
          effectiveBranchId
            ? getJournalEntries(tenantSlug, effectiveBranchId, 8)
            : Promise.resolve([] as JournalEntryRow[]),
          getExecutiveSummary(
            tenantSlug,
            from,
            to,
            effectiveBranchId,
            effectiveAggregateAll,
          ),
        ]);
        let trail: AuditLogRow[] = [];
        if (effectiveBranchId) {
          try {
            trail = await getAuditTrail(tenantSlug, effectiveBranchId, 6);
          } catch {
            trail = [];
          }
        }
        if (!cancelled) {
          setBalanceSheet(bs);
          setJournals(je);
          setExecutive(ex);
          setAudit(trail);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not load accounting data.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, asOf, effectiveBranchId, effectiveAggregateAll]);

  const bankBal = balanceForKey(balanceSheet, "bank");
  const cashBal = balanceForKey(balanceSheet, "cash");
  const arBal = balanceForKey(balanceSheet, "accounts_receivable");
  const apBal = balanceForKey(balanceSheet, "accounts_payable");

  const projected =
    bankBal +
    cashBal +
    (executive?.outstandingReceivables ?? 0) -
    (executive?.outstandingPayables ?? 0);

  return (
    <div className="min-h-0 min-w-0 bg-[#f6f8f8] dark:bg-background">
      <main className="min-w-0 px-4 py-6 pb-16 md:px-8 md:py-8 md:pb-12">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Accounting Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Real-time financial overview and journal activity
              </p>
              <div className="mt-2">
                <ReportScopeBadge />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2 shadow-sm" type="button">
                <CalendarDays className="size-4" />
                {periodLabel}
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-teal-600 text-white hover:bg-teal-600/90"
                asChild
              >
                <Link href="/accounting/journals">
                  <Plus className="size-4" />
                  New journal
                </Link>
              </Button>
            </div>
          </div>

          {!effectiveBranchId ? (
            <p className="mb-6 text-sm text-amber-700 dark:text-amber-400">
              Select a branch in the header to load balances and journals for that location.
            </p>
          ) : null}

          {error ? (
            <p className="mb-6 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Loading dashboard…
            </div>
          ) : (
            <>
              <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="rounded-2xl border-teal-500/10 shadow-sm transition-colors hover:border-teal-500/20">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="rounded-lg bg-teal-500/10 p-2 text-teal-600">
                      <Landmark className="size-5" />
                    </div>
                    <Badge className="bg-emerald-100 text-[10px] font-bold uppercase tracking-wider text-emerald-800 hover:bg-emerald-100">
                      <TrendingUp className="mr-1 size-3" />
                      Live
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Bank account
                    </p>
                    <p className="text-2xl font-bold tabular-nums">{money(bankBal)}</p>
                    <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="size-3.5 text-teal-600" />
                      From balance sheet
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-teal-500/10 shadow-sm transition-colors hover:border-teal-500/20">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="rounded-lg bg-teal-500/10 p-2 text-teal-600">
                      <CreditCard className="size-5" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Petty cash
                    </p>
                    <p className="text-2xl font-bold tabular-nums">{money(cashBal)}</p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-teal-500 transition-all"
                        style={{
                          width: `${Math.min(100, cashBal > 0 && bankBal + cashBal > 0 ? (cashBal / (bankBal + cashBal)) * 100 : 0)}%`,
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-teal-500/10 shadow-sm transition-colors hover:border-teal-500/20">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="rounded-lg bg-teal-500/10 p-2 text-teal-600">
                      <FileDown className="size-5" />
                    </div>
                    <Badge className="bg-amber-100 text-[10px] font-bold uppercase tracking-wider text-amber-900 hover:bg-amber-100">
                      AR
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Receivables
                    </p>
                    <p className="text-2xl font-bold tabular-nums">{money(arBal)}</p>
                    <div className="mt-3 flex justify-between text-xs font-medium">
                      <span className="text-muted-foreground">GL balance</span>
                      <Link
                        href="/accounting/reports/aged-receivable"
                        className="text-teal-600 hover:underline"
                      >
                        Aged AR
                      </Link>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-teal-500/10 shadow-sm transition-colors hover:border-teal-500/20">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="rounded-lg bg-teal-500/10 p-2 text-teal-600">
                      <FileUp className="size-5" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Payables
                    </p>
                    <p className="text-2xl font-bold tabular-nums">{money(apBal)}</p>
                    <div className="mt-3 flex justify-between text-xs font-medium">
                      <span className="text-muted-foreground">GL balance</span>
                      <Link
                        href="/accounting/reports/aged-payable"
                        className="text-teal-600 hover:underline"
                      >
                        Aged AP
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-8">
                <Card className="overflow-hidden rounded-2xl border-teal-500/10 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-border py-4">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest">
                      Recent journal entries
                    </CardTitle>
                    <Button variant="link" className="h-auto p-0 text-xs font-bold text-teal-600" asChild>
                      <Link href="/accounting/journals">View all</Link>
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 text-[11px] uppercase tracking-wider hover:bg-muted/50">
                          <TableHead>Date</TableHead>
                          <TableHead>Journal</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Partner</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {journals.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No journal entries yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          journals.map((row) => (
                            <TableRow
                              key={row.id}
                              className="hover:bg-teal-500/6"
                            >
                              <TableCell className="whitespace-nowrap text-muted-foreground">
                                {row.entry_date}
                              </TableCell>
                              <TableCell className="font-semibold">
                                {journalSourceLabel(row.source_type)}
                              </TableCell>
                              <TableCell className="max-w-[140px] truncate font-mono text-xs">
                                {row.description ?? row.source_id?.slice(0, 8) ?? "—"}
                              </TableCell>
                              <TableCell className="max-w-[120px] truncate text-sm">
                                {entryPartner(row)}
                              </TableCell>
                              <TableCell className="text-right font-bold tabular-nums">
                                {money(entryAmount(row))}
                              </TableCell>
                              <TableCell>
                                <Badge className="bg-emerald-100 text-[10px] font-bold uppercase tracking-widest text-emerald-800 hover:bg-emerald-100">
                                  Posted
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <Card className="rounded-2xl border-teal-500/10 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold uppercase tracking-widest">
                        Period snapshot
                      </CardTitle>
                      <CardDescription>From executive summary (this month)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Revenue</span>
                        <span className="font-bold text-emerald-600 tabular-nums">
                          {money(executive?.revenue ?? 0)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-emerald-500"
                          style={{
                            width: executive?.revenue
                              ? `${Math.min(100, (Math.max(0, executive.netIncome) / executive.revenue) * 100 + 50)}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <div className="flex justify-between pt-2 text-xs">
                        <span className="text-muted-foreground">Net income</span>
                        <span
                          className={cn(
                            "font-bold tabular-nums",
                            (executive?.netIncome ?? 0) >= 0
                              ? "text-emerald-600"
                              : "text-destructive",
                          )}
                        >
                          {money(executive?.netIncome ?? 0)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-red-500/80"
                          style={{
                            width: executive?.revenue
                              ? `${Math.min(100, (Math.abs(Math.min(0, executive.netIncome)) / (executive.revenue || 1)) * 40 + 20)}%`
                              : "15%",
                          }}
                        />
                      </div>
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <p className="text-[10px] font-bold uppercase text-muted-foreground">
                              Rough liquidity view
                            </p>
                            <p className="text-lg font-bold tabular-nums">
                              {money(projected)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-teal-50 p-2 text-teal-600 dark:bg-teal-950/50">
                            <TrendingUp className="size-5" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-teal-500/10 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-sm font-bold uppercase tracking-widest">
                        Audit trail
                      </CardTitle>
                      <CardDescription>Recent changes (this branch)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {audit.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No audit events yet, or trail is empty for this branch.
                        </p>
                      ) : (
                        audit.map((log) => (
                          <div key={log.id} className="flex gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                              <CheckCircle2 className="size-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-xs text-foreground">
                                <span className="font-semibold">{log.action}</span>{" "}
                                <span className="text-muted-foreground">
                                  {log.table_name}
                                </span>
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(log.created_at), {
                                  addSuffix: true,
                                })}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
      </main>

      <div className="fixed bottom-8 right-8 z-30 md:right-10">
        <Button
          size="icon"
          className="size-14 rounded-full bg-teal-700 text-white shadow-xl hover:bg-teal-700/90 [&_svg]:size-7"
          asChild
        >
          <Link href="/accounting/journals" aria-label="New journal entry">
            <Plus className="size-7" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
