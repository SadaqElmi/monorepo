"use client";

import * as React from "react";
import { Suspense } from "react";
import { endOfMonth, format, parseISO, subMonths } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  DollarSign,
  FileText,
  Loader2,
  MoreHorizontal,
  Percent,
  Settings,
} from "lucide-react";
import Link from "next/link";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RouteLoading } from "@/components/loading/route-loading";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import { ReportCertificationBadge } from "@/components/accounting/report-certification-badge";
import { ReportExportButtons } from "@/components/accounting/report-export-buttons";
import { ReportVariancePanel } from "@/components/accounting/report-variance-panel";
import { useErpReportQuery } from "@/hooks/queries/use-erp-report-query";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import {
  buildBalanceSheetAccountTree,
  buildBalanceSheetTree,
  enrichBalanceSheetLines,
  type BalanceSheetAccountItem,
} from "@/lib/balance-sheet-tree";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import { validateReportAsOf } from "@/lib/report-date-validation";
import {
  getBalanceSheet,
  getChartOfAccounts,
  type BalanceSheetResult,
  type ReportEnvelope,
} from "@/lib/services/accounting";
import { cn } from "@/lib/utils";

export type BalanceSheetReportClientProps = {
  initialData: ReportEnvelope<BalanceSheetResult> | null;
  serverPrefetched: boolean;
  defaultAsOf: string;
  defaultCompareAsOf?: string;
};

const INDENT_CLASS: Record<BalanceSheetAccountItem["level"], string> = {
  0: "pl-0",
  1: "pl-4",
  2: "pl-8",
  3: "pl-12",
};

function BalanceAmount({ balance }: { balance: number }) {
  const neg = balance < 0;
  return (
    <span
      className={cn(
        "min-w-[120px] text-right font-mono text-sm font-semibold tabular-nums",
        neg ? "text-destructive" : "text-foreground",
      )}
    >
      {money(balance)}
    </span>
  );
}

function AccountRow({
  item,
  expanded,
  onToggle,
}: {
  item: BalanceSheetAccountItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isExpandable = !!(item.children && item.children.length > 0);

  const labelClass = cn(
    item.isSection && "text-xs font-bold uppercase tracking-wide text-foreground",
    item.isTotal && "font-semibold text-foreground",
    !item.isSection &&
      !item.isTotal &&
      (item.balance < 0
        ? "text-destructive"
        : item.isHighlight
          ? "text-emerald-600"
          : "text-muted-foreground"),
  );

  const rowClass = cn(
    "flex items-center justify-between border-b border-border px-3 py-2",
    item.isSection && "bg-muted font-bold",
    item.isTotal && "bg-muted/50",
  );

  const primaryHref = item.coaPath ?? item.drilldownPath;
  const labelContent = primaryHref ? (
    <Link
      href={primaryHref}
      className="text-primary underline-offset-2 hover:underline"
    >
      {item.label}
    </Link>
  ) : (
    item.label
  );

  return (
    <div className={rowClass}>
      <div
        className={cn(
          "flex flex-1 items-center gap-2",
          INDENT_CLASS[item.level],
        )}
      >
        {item.isAccount && (item.coaPath || item.drilldownPath) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Actions for ${item.label}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {item.coaPath ? (
                <DropdownMenuItem asChild>
                  <Link href={item.coaPath}>Chart of accounts</Link>
                </DropdownMenuItem>
              ) : null}
              {item.drilldownPath ? (
                <DropdownMenuItem asChild>
                  <Link href={item.drilldownPath}>View journal lines</Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : item.isAccount ? (
          <div className="w-7 shrink-0" />
        ) : isExpandable ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-4 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={expanded}
            aria-label={`Toggle ${item.label}`}
          >
            <ChevronDown
              size={16}
              className={cn(
                "transition-transform",
                expanded ? "rotate-0" : "-rotate-90",
              )}
            />
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}
        <span className={cn("min-w-0 truncate text-sm", labelClass)}>
          {labelContent}
        </span>
      </div>
      {!item.isSection && <BalanceAmount balance={item.balance} />}
      {item.isSection ? <span className="min-w-[120px]" /> : null}
    </div>
  );
}

function ExpandableAccountRow({
  item,
  defaultExpanded = true,
}: {
  item: BalanceSheetAccountItem;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const isExpandable = !!(item.children && item.children.length > 0);

  return (
    <>
      <AccountRow
        item={item}
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
      />
      {isExpandable && expanded
        ? item.children!.map((child) => (
            <ExpandableAccountRow key={child.id} item={child} />
          ))
        : null}
    </>
  );
}

function BalanceSheetTreeView({ sections }: { sections: BalanceSheetAccountItem[] }) {
  const [expandedSections, setExpandedSections] = React.useState({
    assets: true,
    liabilities: true,
    equity: true,
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId as keyof typeof prev],
    }));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      {sections.map((section) => {
        const isOpen =
          expandedSections[section.id as keyof typeof expandedSections] ?? true;

        return (
          <div key={section.id}>
            <AccountRow
              item={section}
              expanded={isOpen}
              onToggle={() => toggleSection(section.id)}
            />
            {isOpen && section.children
              ? section.children.map((child) => (
                  <ExpandableAccountRow key={child.id} item={child} />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}

export default function BalanceSheetReportClient({
  initialData,
  serverPrefetched,
  defaultAsOf,
  defaultCompareAsOf = "",
}: BalanceSheetReportClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [asOf, setAsOf] = React.useState(defaultAsOf);
  const [compareAsOf, setCompareAsOf] = React.useState(defaultCompareAsOf);
  const [compareSnapshot, setCompareSnapshot] = React.useState(false);
  const [validationErr, setValidationErr] = React.useState<string | null>(null);

  const asOfCheck = React.useMemo(() => validateReportAsOf(asOf), [asOf]);

  const reportQuery = useErpReportQuery({
    reportId: "balance-sheet",
    tenantSlug,
    params: {
      asOf,
      compareAsOf,
      compareSnapshot,
      branchId,
      aggregateAll,
    },
    queryFn: (scope) =>
      getBalanceSheet(tenantSlug, asOf, scope.branchId, scope.aggregateAll, {
        compareAsOf: compareAsOf || undefined,
        compareSnapshot: compareSnapshot || undefined,
      }),
    initialData:
      serverPrefetched && initialData != null ? initialData : undefined,
    enabled: asOfCheck.ok,
  });

  React.useEffect(() => {
    setValidationErr(asOfCheck.ok ? null : asOfCheck.message);
  }, [asOfCheck]);

  const data = reportQuery.data ?? null;
  const loading = reportQuery.isFetching;
  const err =
    validationErr ??
    (reportQuery.error instanceof Error
      ? reportQuery.error.message
      : reportQuery.error
        ? "Failed to load balance sheet"
        : null);

  const applyMonthEndVsPrior = React.useCallback(() => {
    const cur = new Date();
    const prev = subMonths(cur, 1);
    setAsOf(format(endOfMonth(cur), "yyyy-MM-dd"));
    setCompareAsOf(format(endOfMonth(prev), "yyyy-MM-dd"));
  }, []);

  const coaQuery = useQuery({
    queryKey: ["erp", "chart-of-accounts", tenantSlug, branchId, aggregateAll],
    queryFn: () => getChartOfAccounts(tenantSlug, branchId),
    enabled: Boolean(data),
    staleTime: 60_000,
  });

  const coaByKey = React.useMemo(() => {
    const map = new Map<string, { id: string; code: string | null }>();
    for (const row of coaQuery.data ?? []) {
      if (!row.account_key) continue;
      map.set(row.account_key, { id: row.id, code: row.code });
    }
    return map;
  }, [coaQuery.data]);

  const enrichedData = React.useMemo(
    () => (data ? enrichBalanceSheetLines(data, coaByKey) : null),
    [data, coaByKey],
  );

  const tree = enrichedData ? buildBalanceSheetTree(enrichedData) : null;
  const accountTree = tree ? buildBalanceSheetAccountTree(tree) : null;

  let displayAsOf = asOf;
  try {
    displayAsOf = format(parseISO(asOf), "MM/dd/yyyy");
  } catch {
    /* keep raw */
  }

  let displayCompareAsOf = compareAsOf;
  if (compareAsOf) {
    try {
      displayCompareAsOf = format(parseISO(compareAsOf), "MM/dd/yyyy");
    } catch {
      /* keep raw */
    }
  }

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden border-border bg-background py-0 shadow-sm">
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => void reportQuery.refetch()}
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
              disabled={loading}
              onClick={applyMonthEndVsPrior}
            >
              Month-end vs prior
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
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4 px-6 pt-6">
        <div className="flex flex-wrap gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar size={16} />
                  <span>As of {displayAsOf}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto space-y-3" align="start">
                <div className="space-y-1.5">
                  <Label htmlFor="bs-asof" className="text-xs text-muted-foreground">
                    As of date
                  </Label>
                  <Input
                    id="bs-asof"
                    type="date"
                    value={asOf}
                    onChange={(e) => setAsOf(e.target.value)}
                    className="h-8"
                  />
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("gap-2", compareAsOf && "border-primary/50")}
                >
                  <Percent size={16} />
                  <span>
                    {compareAsOf ? `% vs ${displayCompareAsOf}` : "% Comparison"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto space-y-3" align="start">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="bs-compare-asof"
                    className="text-xs text-muted-foreground"
                  >
                    Compare as of
                  </Label>
                  <Input
                    id="bs-compare-asof"
                    type="date"
                    value={compareAsOf}
                    onChange={(e) => setCompareAsOf(e.target.value)}
                    className="h-8"
                  />
                </div>
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
                    Compare to prior saved snapshot
                  </label>
                </div>
              </PopoverContent>
            </Popover>

            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href="/accounting/journals">
                <FileText size={16} />
                <span>All Journals</span>
              </Link>
            </Button>

            <Button variant="outline" size="sm" className="gap-2" disabled>
              <Settings size={16} />
              <span>Posted Entries, Accrual Basis</span>
            </Button>

            <Button variant="outline" size="sm" className="gap-2" disabled>
              <DollarSign size={16} />
              <span>In USD</span>
            </Button>
          </div>

          {err ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          ) : null}

          {data?.warnings?.length ? (
            <Alert
              variant={data.isValid ? "default" : "destructive"}
              className="border-amber-200 bg-amber-50 text-amber-950"
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
            <div className="space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : null}

          {accountTree ? (
            <Suspense fallback={<RouteLoading variant="section" />}>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <span>Reconciliation check</span>
                  <Badge
                    variant={
                      Math.abs(
                        (data?.totals.assets ?? 0) -
                          (data?.totals.liabilitiesAndEquity ?? 0),
                      ) < 0.01
                        ? "default"
                        : "destructive"
                    }
                  >
                    Difference:{" "}
                    {money(
                      (data?.totals.assets ?? 0) -
                        (data?.totals.liabilitiesAndEquity ?? 0),
                    )}
                  </Badge>
                </div>

                {data?.drilldownCheck ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Drill-down consistency:{" "}
                    <Badge
                      variant={
                        data.drilldownCheck.isConsistent ? "default" : "destructive"
                      }
                    >
                      {data.drilldownCheck.isConsistent
                        ? "Consistent"
                        : `${data.drilldownCheck.mismatches} mismatches`}
                    </Badge>
                  </div>
                ) : null}

                {data?.comparison ? (
                  <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-foreground md:grid-cols-3">
                    <div>
                      Compare Assets:{" "}
                      <span className="font-medium">
                        {money(data.comparison.totals.assets)}
                      </span>
                    </div>
                    <div>
                      Compare Liabilities:{" "}
                      <span className="font-medium">
                        {money(data.comparison.totals.liabilities)}
                      </span>
                    </div>
                    <div>
                      Compare Equity:{" "}
                      <span className="font-medium">
                        {money(data.comparison.totals.totalEquity)}
                      </span>
                    </div>
                  </div>
                ) : null}

                {data?.snapshotComparison ? (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
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

                <BalanceSheetTreeView sections={accountTree} />
              </div>
            </Suspense>
          ) : null}
      </CardContent>
    </Card>
  );
}
