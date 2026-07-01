"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Download, FileSpreadsheet, Loader2, Receipt } from "lucide-react";

import { ListPagination } from "@/components/api/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RefundStatus, TransactionRegisterType } from "@repo/types";
import { useErpTransactionRegisterPaged } from "@/hooks/queries/use-erp-transaction-register-paged";
import { getStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_STATIC } from "@/lib/erp-query-options";
import { transactionRegisterDetailPath } from "@/lib/routes";
import { getBranches } from "@/lib/services/branches";
import { getStaff } from "@/lib/services/staff";
import { exportTransactionRegister } from "@/lib/services/transaction-register";
import { useQuery } from "@tanstack/react-query";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";

const PAGE_SIZE = 25;
const ALL_BRANCHES = "all";
const ALL_STAFF = "all";
const ALL_TYPES = "all";
const ALL_REFUND = "all";

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso: string) {
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return { date: "—", time: "—" };
  const dt = new Date(d);
  return {
    date: format(dt, "yyyy-MM-dd"),
    time: format(dt, "HH:mm:ss"),
  };
}

function typeBadge(type: string) {
  if (type === "refund") {
    return <Badge variant="destructive">Refund</Badge>;
  }
  return <Badge variant="secondary">Sale</Badge>;
}

export default function TransactionRegisterClient() {
  const [tenantSlug] = useState(() => getStoredUser()?.tenantSlug?.trim() ?? null);
  const branchFacet = useErpBranchFacet();
  const [page, setPage] = useState(1);
  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);
  const [staffFilter, setStaffFilter] = useState(ALL_STAFF);
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [refundFilter, setRefundFilter] = useState(ALL_REFUND);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [transactionNo, setTransactionNo] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [statementId, setStatementId] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  const filtersKey = useMemo(
    () => ({
      branchFilter,
      staffFilter,
      typeFilter,
      refundFilter,
      dateFrom,
      dateTo,
      receiptNo,
      transactionNo,
      customerQ,
      statementId,
      terminalId,
    }),
    [
      branchFilter,
      staffFilter,
      typeFilter,
      refundFilter,
      dateFrom,
      dateTo,
      receiptNo,
      transactionNo,
      customerQ,
      statementId,
      terminalId,
    ],
  );

  useEffect(() => {
    setPage(1);
  }, [filtersKey]);

  const branchesQuery = useQuery({
    queryKey: erpKeys.branches(tenantSlug!, branchFacet),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_STATIC,
    queryFn: ({ signal }) => getBranches(tenantSlug!, { signal }),
  });

  const staffQuery = useQuery({
    queryKey: erpKeys.staff(tenantSlug!, branchFacet),
    enabled: Boolean(tenantSlug && branchFacet),
    staleTime: ERP_STALE_STATIC,
    queryFn: ({ signal }) => getStaff(tenantSlug!, { signal }),
  });

  const resolvedType: TransactionRegisterType | undefined =
    typeFilter === "sale" || typeFilter === "refund" ? typeFilter : undefined;
  const resolvedRefund: RefundStatus | undefined =
    refundFilter === "none" ||
    refundFilter === "partial" ||
    refundFilter === "full"
      ? refundFilter
      : undefined;

  const listQuery = useErpTransactionRegisterPaged(tenantSlug, {
    page,
    limit: PAGE_SIZE,
    branch_id: branchFilter !== ALL_BRANCHES ? branchFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    staff_id: staffFilter !== ALL_STAFF ? staffFilter : undefined,
    terminal_id: terminalId.trim() || undefined,
    receipt_no: receiptNo.trim() || undefined,
    transaction_no: transactionNo.trim() || undefined,
    customer_q: customerQ.trim() || undefined,
    statement_id: statementId.trim() || undefined,
    transaction_type: resolvedType,
    refund_status: resolvedRefund,
    sort_by: "transaction_at",
    sort_dir: "desc",
  });

  const rows = listQuery.data?.items ?? [];
  const totalPages = Math.max(1, listQuery.data?.totalPages ?? 1);
  const loading = listQuery.isFetching || branchesQuery.isFetching;

  const branchOptions = useMemo(() => {
    return [...(branchesQuery.data ?? [])].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
    );
  }, [branchesQuery.data]);

  const staffOptions = useMemo(() => {
    return [...(staffQuery.data ?? [])].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
    );
  }, [staffQuery.data]);

  const exportFilters = useMemo(
    () => ({
      branch_id: branchFilter !== ALL_BRANCHES ? branchFilter : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      staff_id: staffFilter !== ALL_STAFF ? staffFilter : undefined,
      terminal_id: terminalId.trim() || undefined,
      receipt_no: receiptNo.trim() || undefined,
      transaction_no: transactionNo.trim() || undefined,
      customer_q: customerQ.trim() || undefined,
      statement_id: statementId.trim() || undefined,
      transaction_type: resolvedType,
      refund_status: resolvedRefund,
      sort_by: "transaction_at",
      sort_dir: "desc" as const,
    }),
    [
      branchFilter,
      dateFrom,
      dateTo,
      staffFilter,
      terminalId,
      receiptNo,
      transactionNo,
      customerQ,
      statementId,
      resolvedType,
      resolvedRefund,
    ],
  );

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!tenantSlug) return;
    if (!exportFilters.date_from && !exportFilters.date_to) {
      window.alert("Select a date range before exporting.");
      return;
    }
    try {
      setExporting(format);
      const blob = await exportTransactionRegister(tenantSlug, {
        ...exportFilters,
        format,
      });
      const ext = format === "csv" ? "csv" : "xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transaction-register-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  if (!tenantSlug) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sign in with a tenant to view the transaction register.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
        <Receipt className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            Transaction Register
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            Audit POS sales and refunds across stores and terminals
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(exporting)}
            onClick={() => void handleExport("csv")}
          >
            {exporting === "csv" ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Download className="mr-1 size-4" />
            )}
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(exporting)}
            onClick={() => void handleExport("xlsx")}
          >
            {exporting === "xlsx" ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-1 size-4" />
            )}
            Excel
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>
              Server-side filtering. Export requires a date range.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="reg-date-from">Date from</Label>
              <Input
                id="reg-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-date-to">Date to</Label>
              <Input
                id="reg-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-branch">Store</Label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger id="reg-branch">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANCHES}>All stores</SelectItem>
                  {branchOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name ?? b.code ?? b.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-staff">Staff</Label>
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger id="reg-staff">
                  <SelectValue placeholder="Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STAFF}>All staff</SelectItem>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.staff_id ? `${s.staff_id} — ` : ""}
                      {s.name ?? s.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-type">Transaction type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger id="reg-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TYPES}>All types</SelectItem>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-refund">Refund status</Label>
              <Select value={refundFilter} onValueChange={setRefundFilter}>
                <SelectTrigger id="reg-refund">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_REFUND}>Any</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-receipt">Receipt no.</Label>
              <Input
                id="reg-receipt"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                placeholder="Search receipt…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-trx">Transaction no.</Label>
              <Input
                id="reg-trx"
                value={transactionNo}
                onChange={(e) => setTransactionNo(e.target.value)}
                placeholder="TRX-…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-customer">Customer</Label>
              <Input
                id="reg-customer"
                value={customerQ}
                onChange={(e) => setCustomerQ(e.target.value)}
                placeholder="Name or customer no."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-terminal">Terminal ID</Label>
              <Input
                id="reg-terminal"
                value={terminalId}
                onChange={(e) => setTerminalId(e.target.value)}
                placeholder="Device UUID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-statement">Statement no.</Label>
              <Input
                id="reg-statement"
                value={statementId}
                onChange={(e) => setStatementId(e.target.value)}
                placeholder="Statement UUID"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Transactions
              {listQuery.data ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({listQuery.data.total.toLocaleString()} total)
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>
              Sales appear here as soon as they are saved. Posted statement numbers
              are assigned when the POS shift is closed (Z-report), not at sale time.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0 pb-4">
            {listQuery.error ? (
              <p className="px-4 py-6 text-sm text-destructive">
                {listQuery.error instanceof Error
                  ? listQuery.error.message
                  : "Failed to load register"}
              </p>
            ) : loading && !rows.length ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Loading…
              </div>
            ) : !rows.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No transactions match your filters.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction No.</TableHead>
                    <TableHead>Receipt No.</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Terminal</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Sales type</TableHead>
                    <TableHead>Pay method</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Refund</TableHead>
                    <TableHead>Statement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const { date, time } = formatDateTime(row.transaction_at);
                    return (
                      <TableRow key={row.register_id}>
                        <TableCell>
                          <Link
                            href={transactionRegisterDetailPath(row.register_id)}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {row.transaction_no}
                          </Link>
                        </TableCell>
                        <TableCell>{row.receipt_no ?? "—"}</TableCell>
                        <TableCell>{typeBadge(row.transaction_type)}</TableCell>
                        <TableCell>{row.store_no ?? "—"}</TableCell>
                        <TableCell>{row.terminal_no ?? "—"}</TableCell>
                        <TableCell>{row.staff_code ?? row.staff_name ?? "—"}</TableCell>
                        <TableCell>{date}</TableCell>
                        <TableCell>{time}</TableCell>
                        <TableCell>
                          {row.customer_name ?? row.customer_no ?? "—"}
                        </TableCell>
                        <TableCell>{row.sales_type}</TableCell>
                        <TableCell>
                          {row.payment_method === "customer-credit"
                            ? "Customer Credit"
                            : (row.payment_method ?? "—")}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.gross_amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.net_amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.payment_amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.discount_amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.cost_amount)}
                        </TableCell>
                        <TableCell>{row.refund_status ?? "—"}</TableCell>
                        <TableCell className="max-w-[8rem] truncate text-xs text-muted-foreground">
                          {row.posted_statement_no ?? row.statement_no ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <div className="px-4 pt-4">
              <ListPagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
