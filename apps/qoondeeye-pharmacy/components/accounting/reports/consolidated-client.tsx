"use client";

import * as React from "react";
import {
  endOfMonth,
  format,
  formatDistanceToNow,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";

import { ReportExportButtons } from "@/components/accounting/report-export-buttons";
import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import { ReportCertificationBadge } from "@/components/accounting/report-certification-badge";
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
import { useErpReportQuery } from "@/hooks/queries/use-erp-report-query";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { hasGlobalBranchAccess } from "@/lib/branch-access";
import { money } from "@/lib/accounting-display";
import { buildBalanceSheetTree } from "@/lib/balance-sheet-tree";
import { getResolvedStoredUser, getStoredUser } from "@/lib/auth-client";
import {
  getBalanceSheet,
  getConsolidationPreview,
  getIncomeStatement,
  type BalanceSheetResult,
  type ConsolidationPreviewResult,
  type IncomeStatementResult,
  type ReportEnvelope,
} from "@/lib/services/accounting";
import type { BsLine } from "@/lib/balance-sheet-tree";
import { inventoryTransferDetailPath, ROUTES } from "@/lib/routes";
import { validateReportAsOf, validateReportDateRange } from "@/lib/report-date-validation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ConsolidatedMainBundle = {
  bs: ReportEnvelope<BalanceSheetResult>;
  pnl: ReportEnvelope<IncomeStatementResult>;
};

export type ConsolidatedReportsClientProps = {
  defaultAsOf: string;
  defaultFrom: string;
  defaultTo: string;
};

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

export default function ConsolidatedReportsClient({
  defaultAsOf,
  defaultFrom,
  defaultTo,
}: ConsolidatedReportsClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll, branchName } = useReportBranchQuery();
  const resolvedUser = getResolvedStoredUser();
  const canMultiBranch = hasGlobalBranchAccess(resolvedUser?.role) && aggregateAll;

  const [asOf, setAsOf] = React.useState(defaultAsOf);
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [validationErr, setValidationErr] = React.useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const consolidationMode: "preview" | "posted" = "posted";

  const asOfCheck = React.useMemo(() => validateReportAsOf(asOf), [asOf]);
  const rangeCheck = React.useMemo(
    () => validateReportDateRange(from, to, { branchId }),
    [from, to, branchId],
  );
  const filtersValid = asOfCheck.ok && rangeCheck.ok;
  const mainEnabled =
    submitted && canMultiBranch && filtersValid;

  const mainQuery = useErpReportQuery<ConsolidatedMainBundle>({
    reportId: "consolidated",
    tenantSlug,
    params: {
      asOf,
      from,
      to,
      branchId,
      aggregateAll,
      consolidationMode,
    },
    queryFn: async (scope) => {
      const [bsRes, pnlRes] = await Promise.all([
        getBalanceSheet(tenantSlug, asOf, scope.branchId, scope.aggregateAll, {
          consolidated: true,
          consolidationMode,
        }),
        getIncomeStatement(tenantSlug, from, to, scope.branchId, scope.aggregateAll, {
          consolidationMode,
        }),
      ]);
      return { bs: bsRes, pnl: pnlRes };
    },
    enabled: mainEnabled,
  });

  const previewQuery = useErpReportQuery({
    reportId: "consolidation-preview",
    tenantSlug,
    params: { asOf, branchId, aggregateAll },
    queryFn: (scope) =>
      getConsolidationPreview(tenantSlug, asOf, scope.branchId, scope.aggregateAll),
    enabled: submitted && canMultiBranch && asOfCheck.ok && previewOpen,
  });

  React.useEffect(() => {
    if (!asOfCheck.ok) {
      setValidationErr(asOfCheck.message);
    } else if (!rangeCheck.ok) {
      setValidationErr(rangeCheck.message);
    } else {
      setValidationErr(null);
    }
  }, [asOfCheck, rangeCheck]);

  const bs = mainEnabled ? (mainQuery.data?.bs ?? null) : null;
  const pnl = mainEnabled ? (mainQuery.data?.pnl ?? null) : null;
  const loading = mainQuery.isFetching;
  const err =
    validationErr ??
    (mainQuery.error instanceof Error
      ? mainQuery.error.message
      : mainQuery.error
        ? "Failed to load consolidated reports"
        : null);

  const preview = canMultiBranch ? (previewQuery.data ?? null) : null;
  const previewLoading = previewQuery.isFetching;
  const previewErr =
    previewQuery.error instanceof Error
      ? previewQuery.error.message
      : previewQuery.error
        ? "Failed to load consolidation preview"
        : null;

  const tree = bs ? buildBalanceSheetTree(bs) : null;

  const equityLines = bs?.lines.filter((l) => l.accountType === "equity") ?? [];
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

  const applyMonthEnd = React.useCallback(() => {
    const cur = new Date();
    const prev = subMonths(cur, 1);
    setAsOf(format(endOfMonth(cur), "yyyy-MM-dd"));
    setFrom(format(startOfMonth(cur), "yyyy-MM-dd"));
    setTo(format(endOfMonth(cur), "yyyy-MM-dd"));
  }, []);

  if (!hasGlobalBranchAccess(resolvedUser?.role)) {
    return (
      <Card className="mx-4 mb-4 mt-4">
        <CardHeader>
          <CardTitle className="text-lg">Consolidated reports</CardTitle>
          <CardDescription>
            Consolidated financial reporting is available to admin and owner roles
            only.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!aggregateAll) {
    return (
      <Card className="mx-4 mb-4 mt-4">
        <CardHeader>
          <CardTitle className="text-lg">Consolidated reports</CardTitle>
          <CardDescription>
            Select <strong>All branches</strong> in the location switcher to run a
            consolidated balance sheet (inter-branch due from / due to eliminated)
            and a group profit and loss.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/accounting/reports/balance-sheet">Standard balance sheet</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Consolidated reports</CardTitle>
        <CardDescription>
          Consolidated balance sheet removes inter-branch transfer balances (due from
          branch / due to branch) in <strong>reporting-only</strong> mode (no
          elimination journals posted). Group P&amp;L is an arithmetic sum of branch
          income statements; the product does not yet apply intercompany revenue or
          COGS elimination on the income statement.
        </CardDescription>
        <ReportScopeBadge />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Last updated:{" "}
            {bs?.generatedAt
              ? formatDistanceToNow(parseISO(bs.generatedAt), { addSuffix: true })
              : loading
                ? "…"
                : "—"}
          </span>
          <span>
            Data scope:{" "}
            {aggregateAll ? "All branches you can access" : branchName ?? "Single branch"}
          </span>
          <span>Mode: Reporting-only (no elimination journals posted)</span>
        </div>
        {bs?.consolidation ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="sr-only">
              Consolidation status {bs.consolidation.consolidationStatus}, residual{" "}
              {money(bs.consolidation.residual)}
            </span>
            <span className="text-xs text-muted-foreground">Consolidation</span>
            <Badge
              variant="secondary"
              className={cn(
                "font-normal",
                bs.consolidation.consolidationStatus === "clean" &&
                  "border-emerald-600/40 bg-emerald-50 text-emerald-950",
                bs.consolidation.consolidationStatus === "minor" &&
                  "border-amber-500/50 bg-amber-50 text-amber-950",
                bs.consolidation.consolidationStatus === "critical" &&
                  "border-destructive/60 bg-destructive/10 text-destructive",
              )}
            >
              {bs.consolidation.consolidationStatus === "clean"
                ? "Clean"
                : bs.consolidation.consolidationStatus === "minor"
                  ? "Minor residual"
                  : "Critical residual"}
            </Badge>
            {bs.consolidation.consolidationStatus !== "clean" ? (
              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link href="/accounting/reports/interbranch-mismatches">
                  Review unmatched transfers
                </Link>
              </Button>
            ) : (
              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link href="/accounting/reports/interbranch-mismatches">
                  Inter-branch diagnostics
                </Link>
              </Button>
            )}
          </div>
        ) : null}
        {bs ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <ReportCertificationBadge reportStatus={bs.reportStatus} />
            <span>{bs.finalization?.isFinal ? "FINAL" : "Draft period"}</span>
            {bs.finalization?.lockDate ? (
              <span>Lock date: {bs.finalization.lockDate}</span>
            ) : null}
          </div>
        ) : null}
        <CardAction>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cr-bs-asof" className="text-xs text-muted-foreground">
                Balance sheet as of
              </Label>
              <Input
                id="cr-bs-asof"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-pnl-from" className="text-xs text-muted-foreground">
                P&amp;L from
              </Label>
              <Input
                id="cr-pnl-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-pnl-to" className="text-xs text-muted-foreground">
                P&amp;L to
              </Label>
              <Input
                id="cr-pnl-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 w-[148px]"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!canMultiBranch || !filtersValid || loading}
              onClick={() => {
                setSubmitted(true);
                if (submitted) void mainQuery.refetch();
              }}
            >
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Run report
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={!submitted || loading}
              onClick={() => void mainQuery.refetch()}
            >
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={loading}
              onClick={applyMonthEnd}
            >
              This month (BS month-end)
            </Button>
            <ReportExportButtons
              tenantSlug={tenantSlug}
              reportType="balance_sheet"
              branchId={branchId}
              aggregateAll={aggregateAll}
              asOf={asOf}
              consolidated
              disabled={loading}
            />
          </div>
        </CardAction>
      </CardHeader>

      <div className="flex justify-end gap-8 px-4 py-2 text-sm text-muted-foreground">
        <span className="tabular-nums">Balance sheet as of {displayAsOf}</span>
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

        {bs?.warnings?.length ? (
          <Alert
            variant={bs.isValid ? "default" : "destructive"}
            className="mx-4 mt-4 border-amber-200 bg-amber-50 text-amber-950"
          >
            <AlertCircle />
            <AlertTitle>
              {bs.isValid ? "Validation warnings" : "Critical validation warnings"}
            </AlertTitle>
            <AlertDescription>
              <div className="space-y-1 text-xs">
                {bs.warnings.slice(0, 6).map((w, idx) => (
                  <p key={`${w.code}-${idx}`}>
                    {w.severity.toUpperCase()}: {w.message}
                  </p>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {bs?.consolidation ? (
          <div
            className={cn(
              "mx-4 mt-4 rounded-md border px-3 py-2 text-sm",
              bs.consolidation.severity === "critical"
                ? "border-destructive/60 bg-destructive/5"
                : bs.consolidation.severity === "warning"
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-border bg-muted/40",
            )}
          >
            <div className="font-medium text-foreground">Consolidation</div>
            <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <span>Gross due from branch: {money(bs.consolidation.grossDueFrom)}</span>
              <span>Gross due to branch: {money(bs.consolidation.grossDueTo)}</span>
              <span>Eliminated (from): {money(bs.consolidation.eliminatedDueFrom)}</span>
              <span>Eliminated (to): {money(bs.consolidation.eliminatedDueTo)}</span>
              <span className="sm:col-span-2 font-medium text-foreground">
                Residual (from − to): {money(bs.consolidation.residual)}
              </span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
              {bs.consolidation.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            {bs.consolidation.interbranchBreakdown?.length ? (
              <div className="mt-3 space-y-1">
                <div className="text-xs font-medium text-foreground">
                  Branch pairs (inter-branch GL)
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-xs">From → to</TableHead>
                      <TableHead className="h-8 text-right text-xs">Due from</TableHead>
                      <TableHead className="h-8 text-right text-xs">Due to</TableHead>
                      <TableHead className="h-8 text-right text-xs">Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bs.consolidation.interbranchBreakdown.map((row) => (
                      <TableRow key={`${row.fromBranchId}-${row.toBranchId}`}>
                        <TableCell className="py-1.5 text-xs">
                          <span className="text-foreground">
                            {row.fromBranchName} → {row.toBranchName}
                          </span>
                          <div>
                            <Button asChild variant="link" className="h-auto p-0 text-[11px]">
                              <Link href={ROUTES.inventory.transfers}>Transfers list</Link>
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-xs tabular-nums">
                          {money(row.dueFrom)}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-xs tabular-nums">
                          {money(row.dueTo)}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-xs tabular-nums font-medium">
                          {money(row.difference)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {bs.consolidation.transferBreakdown?.length ? (
              <div className="mt-3 space-y-1">
                <div className="text-xs font-medium text-foreground">
                  Transfers with pair mismatch
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-xs">Transfer</TableHead>
                      <TableHead className="h-8 text-xs">Route</TableHead>
                      <TableHead className="h-8 text-right text-xs">Difference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bs.consolidation.transferBreakdown.map((row) => (
                      <TableRow key={row.transferId}>
                        <TableCell className="py-1.5 text-xs">
                          <Button asChild variant="link" className="h-auto p-0 text-xs">
                            <Link href={inventoryTransferDetailPath(row.transferId)}>
                              {row.transferId.slice(0, 8)}…
                            </Link>
                          </Button>
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-muted-foreground">
                          {row.fromBranchName} → {row.toBranchName}
                        </TableCell>
                        <TableCell className="py-1.5 text-right text-xs tabular-nums font-medium">
                          {money(row.difference)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <Collapsible
              className="mt-3"
              open={previewOpen}
              onOpenChange={setPreviewOpen}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-1 rounded border border-border/80 bg-muted/30 px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted/50">
                {previewOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                Elimination preview (not posted)
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2 text-xs">
                {previewLoading ? (
                  <p className="text-muted-foreground">Loading preview…</p>
                ) : null}
                {previewErr ? (
                  <p className="text-amber-800">{previewErr}</p>
                ) : null}
                {preview && !previewLoading ? (
                  <>
                    <p className="text-muted-foreground">
                      Residual {money(preview.residual)} as of {preview.asOfDate}.
                      Lines below are illustrative only.
                    </p>
                    {preview.suggestedSummary ? (
                      <p className="font-medium text-foreground">
                        {preview.suggestedSummary.headline}
                      </p>
                    ) : null}
                    {preview.suggestedAction ? (
                      <p className="text-muted-foreground">{preview.suggestedAction}</p>
                    ) : null}
                    {preview.proposedLines.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 text-xs">Account</TableHead>
                            <TableHead className="h-8 text-right text-xs">Debit</TableHead>
                            <TableHead className="h-8 text-right text-xs">Credit</TableHead>
                            <TableHead className="h-8 text-xs">Memo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.proposedLines.map((ln, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="py-1.5 font-mono text-[11px]">
                                {ln.accountKey}
                              </TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums">
                                {money(ln.debit)}
                              </TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums">
                                {money(ln.credit)}
                              </TableCell>
                              <TableCell className="py-1.5 text-muted-foreground">
                                {ln.memo}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-muted-foreground">No proposed lines (residual in tolerance).</p>
                    )}
                  </>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}

        {loading && !bs ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : null}

        {pnl && !loading ? (
          <div className="mx-4 mt-4 rounded-md border border-border bg-card px-3 py-3">
            <div className="text-sm font-semibold">Group profit and loss</div>
            <p className="text-xs text-muted-foreground">
              Sum of income and expense accounts across branches ({from} – {to}). This is
              a <strong>group roll-up</strong>, not full intercompany P&amp;L
              consolidation: internal revenue between branches is not eliminated until
              product rules and postings exist for that scenario.
            </p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                Revenue: <span className="font-medium">{money(pnl.totalRevenue)}</span>
              </div>
              <div>
                Expenses:{" "}
                <span className="font-medium">{money(pnl.totalExpenses)}</span>
              </div>
              <div>
                Net income:{" "}
                <span className="font-medium">{money(pnl.netIncome)}</span>
              </div>
            </div>
            <Button asChild variant="link" className="mt-1 h-auto p-0 text-xs">
              <Link href="/accounting/reports/profit-loss">Open full P&amp;L report</Link>
            </Button>
          </div>
        ) : null}

        {tree && bs ? (
          <div className="flex-1 overflow-auto pb-10">
            <div className="mx-3 my-2 flex items-center justify-between rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>Accounting equation (consolidated)</span>
              <span
                className={cn(
                  "font-medium",
                  Math.abs(bs.totals.assets - bs.totals.liabilitiesAndEquity) < 0.01
                    ? "text-emerald-400"
                    : "text-amber-400",
                )}
              >
                Difference:{" "}
                {money(bs.totals.assets - bs.totals.liabilitiesAndEquity)}
              </span>
            </div>
            {bs.drilldownCheck ? (
              <div className="mx-3 mb-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Drill-down consistency:{" "}
                {bs.drilldownCheck.skipReason ? (
                  <span className="text-foreground">{bs.drilldownCheck.skipReason}</span>
                ) : (
                  <span
                    className={cn(
                      "font-medium",
                      bs.drilldownCheck.isConsistent ? "text-emerald-400" : "text-amber-400",
                    )}
                  >
                    {bs.drilldownCheck.isConsistent
                      ? "Consistent"
                      : `${bs.drilldownCheck.mismatches} mismatches`}
                  </span>
                )}
              </div>
            ) : null}

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
