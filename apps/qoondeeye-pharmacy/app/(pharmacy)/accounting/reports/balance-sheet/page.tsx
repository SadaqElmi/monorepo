"use client";

import * as React from "react";
import { endOfMonth, format, parseISO, subMonths } from "date-fns";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import { ReportCertificationBadge } from "@/components/accounting/report-certification-badge";
import { ReportExportButtons } from "@/components/accounting/report-export-buttons";
import { ReportVariancePanel } from "@/components/accounting/report-variance-panel";
import { Checkbox } from "@/components/ui/checkbox";
import { buildBalanceSheetTree } from "@/lib/balance-sheet-tree";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import {
  getBalanceSheet,
  type BalanceSheetResult,
  type ReportEnvelope,
} from "@/lib/services/accounting";
import type { BsLine } from "@/lib/balance-sheet-tree";
import { validateReportAsOf } from "@/lib/report-date-validation";
import { cn } from "@/lib/utils";

function Bal({ n }: { n: number }) {
  const neg = n < 0;
  return (
    <span
      className={cn(
        "tabular-nums tracking-tight",
        neg ? "font-medium text-red-500" : "text-foreground",
      )}
    >
      {money(n)}
    </span>
  );
}

function RowLine({
  label,
  balance,
  indent = 0,
  bold,
  dim,
  linkHref,
  actionMenu,
}: {
  label: React.ReactNode;
  balance: React.ReactNode;
  indent?: number;
  bold?: boolean;
  dim?: boolean;
  linkHref?: string;
  actionMenu?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-10 items-center justify-between gap-4 border-b border-border/80 px-3 py-2",
        dim && "text-muted-foreground",
        bold && "font-semibold text-foreground",
      )}
      style={{ paddingLeft: 12 + indent * 16 }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {actionMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Row actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <Link href="/accounting/journals">View journals</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/accounting/chart-of-accounts">Chart of accounts</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <div className="min-w-0 truncate text-sm">
          {linkHref ? (
            <Link
              href={linkHref}
              className="text-primary underline-offset-2 hover:underline"
            >
              {label}
            </Link>
          ) : (
            label
          )}
        </div>
      </div>
      <div className="shrink-0 text-right text-sm">{balance}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function CollapsibleBlock({
  title,
  balance,
  defaultOpen,
  indent,
  children,
}: {
  title: string;
  balance: React.ReactNode;
  defaultOpen?: boolean;
  indent?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex min-h-10 w-full items-center justify-between gap-4 border-b border-border/80 py-2 text-left text-sm text-foreground hover:bg-muted/50",
        )}
        style={{ paddingLeft: 12 + (indent ?? 0) * 16, paddingRight: 12 }}
      >
        <span className="flex items-center gap-1">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          {title}
        </span>
        <span className="shrink-0 text-sm">{balance}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function AccountRows({
  lines,
  baseIndent,
}: {
  lines: BsLine[];
  baseIndent: number;
}) {
  return (
    <>
      {lines.map((ln) => (
        <RowLine
          key={`${ln.accountKey}-${ln.name}`}
          label={<span>{ln.name}</span>}
          balance={<Bal n={ln.balance} />}
          indent={baseIndent + 1}
          linkHref={ln.drilldownPath}
          actionMenu
        />
      ))}
    </>
  );
}

export default function BalanceSheetReportPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const now = new Date();
  const [asOf, setAsOf] = React.useState(format(now, "yyyy-MM-dd"));
  const [compareAsOf, setCompareAsOf] = React.useState("");
  const [compareSnapshot, setCompareSnapshot] = React.useState(false);
  const [data, setData] = React.useState<
    ReportEnvelope<BalanceSheetResult> | null
  >(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const rangeCheck = validateReportAsOf(asOf);
    if (!rangeCheck.ok) {
      setErr(rangeCheck.message);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await getBalanceSheet(tenantSlug, asOf, branchId, aggregateAll, {
        compareAsOf: compareAsOf || undefined,
        compareSnapshot: compareSnapshot || undefined,
      });
      setData(res);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load balance sheet");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, asOf, compareAsOf, compareSnapshot, branchId, aggregateAll]);

  const applyMonthEndVsPrior = React.useCallback(() => {
    const cur = new Date();
    const prev = subMonths(cur, 1);
    setAsOf(format(endOfMonth(cur), "yyyy-MM-dd"));
    setCompareAsOf(format(endOfMonth(prev), "yyyy-MM-dd"));
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const tree = data ? buildBalanceSheetTree(data) : null;

  const equityLines = data?.lines.filter((l) => l.accountType === "equity") ?? [];
  const cyRetained = equityLines.find((l) => l.accountKey === "current_year_profit");
  const pyRetained = equityLines.find((l) => l.accountKey === "equity_retained");
  const cyBal = cyRetained?.balance ?? 0;
  const pyBal = pyRetained?.balance ?? 0;
  const previousUnallocated =
    tree?.equity.equityExcludingImplicit != null
      ? tree.equity.equityExcludingImplicit - cyBal - pyBal
      : 0;
  const totalUnallocated =
    tree != null ? tree.equity.implicit + previousUnallocated : 0;
  const totalRetainedSub = cyBal + pyBal;

  let displayAsOf = asOf;
  try {
    displayAsOf = format(parseISO(asOf), "dd/MM/yyyy");
  } catch {
    /* keep raw */
  }

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Balance Sheet</CardTitle>
        <CardDescription>
          {aggregateAll
            ? "Posted journals aggregated across all branches you can access."
            : branchId
              ? "Posted journals for the selected branch."
              : "Pick a branch or select all branches (admin/owner) to run this report."}
        </CardDescription>
        <ReportScopeBadge />
        {data ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ReportCertificationBadge reportStatus={data.reportStatus} />
            <span>{data.finalization?.isFinal ? "FINAL" : "Draft period"}</span>
            {data.finalization?.lockDate ? (
              <span>Lock date: {data.finalization.lockDate}</span>
            ) : null}
            {data.snapshot ? (
              <span>Snapshot v{data.snapshot.version}</span>
            ) : null}
          </div>
        ) : null}
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bs-asof" className="text-xs text-muted-foreground">
                As of
              </Label>
              <Input
                id="bs-asof"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={loading}
              onClick={applyMonthEndVsPrior}
            >
              Month-end vs prior month-end
            </Button>
            <ReportExportButtons
              tenantSlug={tenantSlug}
              reportType="balance_sheet"
              branchId={branchId}
              aggregateAll={aggregateAll}
              asOf={asOf}
              disabled={loading || (!branchId && !aggregateAll)}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="bs-compare-snapshot"
                checked={compareSnapshot}
                onCheckedChange={(v) => setCompareSnapshot(v === true)}
              />
              <label
                htmlFor="bs-compare-snapshot"
                className="text-xs text-muted-foreground"
              >
                Compare to prior saved snapshot (previous day)
              </label>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bs-compare-asof" className="text-xs text-muted-foreground">
                Compare as of
              </Label>
              <Input
                id="bs-compare-asof"
                type="date"
                value={compareAsOf}
                onChange={(e) => setCompareAsOf(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
          </div>
        </CardAction>
      </CardHeader>

      <div className="flex justify-end gap-8 px-4 py-2 text-sm text-muted-foreground">
        <span className="tabular-nums">As of {displayAsOf}</span>
        <span className="w-28 text-right font-medium text-foreground">Balance</span>
      </div>

      <Separator />

      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0 pt-0">
        {err ? (
          <Alert variant="destructive" className="mx-4 mt-4">
            <AlertCircle />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}

        {data?.warnings?.length ? (
          <Alert
            variant={data.isValid ? "default" : "destructive"}
            className="mx-4 mt-4 border-amber-200 bg-amber-50 text-amber-950"
          >
            <AlertCircle />
            <AlertTitle>
              {data.isValid
                ? "Validation warnings"
                : "Critical validation warnings"}
            </AlertTitle>
            <AlertDescription>
              <div className="space-y-1 text-xs">
                {data.warnings.slice(0, 5).map((w, idx) => (
                  <p key={`${w.code}-${idx}`}>
                    {w.severity.toUpperCase()}: {w.message}
                  </p>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-9 w-full"
              />
            ))}
          </div>
        ) : null}

        {tree ? (
          <div className="flex-1 overflow-auto pb-10">
          <div className="mx-3 my-2 flex items-center justify-between rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span>Reconciliation check</span>
            <span className={cn(
              "font-medium",
              Math.abs((data?.totals.assets ?? 0) - (data?.totals.liabilitiesAndEquity ?? 0)) < 0.01
                ? "text-emerald-400"
                : "text-amber-400",
            )}>
              Difference: {money((data?.totals.assets ?? 0) - (data?.totals.liabilitiesAndEquity ?? 0))}
            </span>
          </div>
          {data?.drilldownCheck ? (
            <div className="mx-3 mb-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Drill-down consistency:{" "}
              <span className={cn("font-medium", data.drilldownCheck.isConsistent ? "text-emerald-400" : "text-amber-400")}>
                {data.drilldownCheck.isConsistent
                  ? "Consistent"
                  : `${data.drilldownCheck.mismatches} mismatches`}
              </span>
            </div>
          ) : null}
          {data?.comparison ? (
            <div className="mx-3 mb-2 grid grid-cols-1 gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-foreground md:grid-cols-3">
              <div>
                Compare Assets: <span className="font-medium">{money(data.comparison.totals.assets)}</span>
              </div>
              <div>
                Compare Liabilities: <span className="font-medium">{money(data.comparison.totals.liabilities)}</span>
              </div>
              <div>
                Compare Equity: <span className="font-medium">{money(data.comparison.totals.totalEquity)}</span>
              </div>
            </div>
          ) : null}
          {data?.snapshotComparison ? (
            <div className="mx-3 mb-2 rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Prior snapshot</span>{" "}
              {data.snapshotComparison.baselineSnapshotDate} (v
              {data.snapshotComparison.baselineVersion}) — Assets{" "}
              {money(data.snapshotComparison.baseline.assets)}, Liabilities{" "}
              {money(data.snapshotComparison.baseline.liabilities)}, Equity{" "}
              {money(data.snapshotComparison.baseline.totalEquity)}
            </div>
          ) : null}
          <ReportVariancePanel
            mode="bs"
            variance={data?.variance}
            snapshotDate={data?.snapshotComparison?.baselineSnapshotDate}
          />
          <SectionTitle>ASSETS</SectionTitle>
          <p className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Current Assets
          </p>

          <CollapsibleBlock
            title="Bank and Cash Accounts"
            balance={<Bal n={tree.assets.totalBankCash} />}
            defaultOpen
            indent={0}
          >
            <AccountRows lines={tree.assets.bankCash} baseIndent={1} />
            <RowLine
              label="Total Bank and Cash Accounts"
              balance={<Bal n={tree.assets.totalBankCash} />}
              indent={1}
              bold
            />
          </CollapsibleBlock>

          <CollapsibleBlock
            title="Receivables"
            balance={<Bal n={tree.assets.totalReceivables} />}
            indent={0}
          >
            <AccountRows lines={tree.assets.receivables} baseIndent={1} />
          </CollapsibleBlock>

          <RowLine
            label="Inventory"
            balance={<Bal n={tree.assets.inventoryBal} />}
            indent={1}
          />
          <RowLine
            label="Prepayments"
            balance={<Bal n={tree.assets.prepayBal} />}
            indent={1}
          />
          {tree.assets.otherAssets.length ? (
            <AccountRows lines={tree.assets.otherAssets} baseIndent={1} />
          ) : null}

          <RowLine
            label="Total Current Assets"
            balance={<Bal n={tree.assets.totalCurrentAssets} />}
            indent={0}
            bold
          />
          <RowLine
            label="Plus Fixed Assets"
            balance={<Bal n={tree.assets.fixedBal} />}
            indent={0}
          />
          <RowLine
            label="Plus Non-current Assets"
            balance={<Bal n={tree.assets.nonCurrentBal} />}
            indent={0}
          />
          <RowLine
            label="Total ASSETS"
            balance={<Bal n={tree.assets.totalAssets} />}
            bold
          />

          <SectionTitle>LIABILITIES</SectionTitle>
          <p className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Current Liabilities
          </p>
          <RowLine
            label="Payables"
            balance={<Bal n={tree.liabilities.totalPayables} />}
            indent={1}
          />
          {tree.liabilities.otherCurrentLiab.length ? (
            <AccountRows
              lines={tree.liabilities.otherCurrentLiab}
              baseIndent={1}
            />
          ) : null}
          {tree.liabilities.otherLiabs.length ? (
            <AccountRows lines={tree.liabilities.otherLiabs} baseIndent={1} />
          ) : null}
          <RowLine
            label="Total Current Liabilities"
            balance={<Bal n={tree.liabilities.totalCurrentLiabilities} />}
            indent={0}
            bold
          />
          <RowLine
            label="Plus Non-current Liabilities"
            balance={<Bal n={tree.liabilities.totalNonCurrentLiab} />}
            indent={0}
          />
          <RowLine
            label="Total LIABILITIES"
            balance={<Bal n={tree.liabilities.totalLiabilities} />}
            bold
          />

          <SectionTitle>EQUITY</SectionTitle>
          <p className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Unallocated Earnings
          </p>
          <RowLine
            label="Current Year Unallocated Earnings"
            balance={<Bal n={tree.equity.implicit} />}
            indent={1}
            linkHref="/accounting/reports/profit-loss"
          />
          <RowLine
            label="Previous Years Unallocated Earnings"
            balance={<Bal n={previousUnallocated} />}
            indent={1}
          />
          <RowLine
            label="Total Unallocated Earnings"
            balance={<Bal n={totalUnallocated} />}
            indent={0}
            bold
          />

          <p className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Retained Earnings
          </p>
          <RowLine
            label="Current Year Retained Earnings"
            balance={<Bal n={cyBal} />}
            indent={1}
          />
          <RowLine
            label="Previous Years Retained Earnings"
            balance={<Bal n={pyBal} />}
            indent={1}
          />
          <RowLine
            label="Total Retained Earnings"
            balance={<Bal n={totalRetainedSub} />}
            indent={0}
            bold
          />
          <RowLine
            label="Total EQUITY"
            balance={<Bal n={tree.equity.totalEquity} />}
            bold
          />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
