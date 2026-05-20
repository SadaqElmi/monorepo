"use client";

import * as React from "react";
import { AlertCircle, Loader2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpReportQuery } from "@/hooks/queries/use-erp-report-query";
import { useReportBranchQuery } from "@/hooks/use-branch-for-reports";
import { money } from "@/lib/accounting-display";
import { getStoredUser } from "@/lib/auth-client";
import { validateReportDateRange } from "@/lib/report-date-validation";
import {
  getPartnerLedger,
  type PartnerLedgerResult,
} from "@/lib/services/accounting";
import { getCustomers, type Customer } from "@/lib/services/customers";
import { getSuppliers, type Supplier } from "@/lib/services/suppliers";

export type PartnerLedgerReportClientProps = {
  initialLedger: PartnerLedgerResult | null;
  serverPrefetched: boolean;
  defaultFrom: string;
  defaultTo: string;
  defaultPartnerKind: "customer" | "supplier";
  defaultPartnerId: string;
};

export default function PartnerLedgerReportClient({
  initialLedger,
  serverPrefetched,
  defaultFrom,
  defaultTo,
  defaultPartnerKind,
  defaultPartnerId,
}: PartnerLedgerReportClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const { branchId, aggregateAll } = useReportBranchQuery();
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [partnerKind, setPartnerKind] = React.useState<"customer" | "supplier">(
    defaultPartnerKind,
  );
  const [partnerId, setPartnerId] = React.useState(defaultPartnerId);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [validationErr, setValidationErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [c, s] = await Promise.all([
          getCustomers(tenantSlug),
          getSuppliers(tenantSlug),
        ]);
        if (!cancelled) {
          setCustomers(c);
          setSuppliers(s);
        }
      } catch {
        if (!cancelled) {
          setCustomers([]);
          setSuppliers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const trimmedPartnerId = partnerId.trim();
  const rangeCheck = React.useMemo(
    () => validateReportDateRange(from, to, { branchId }),
    [from, to, branchId],
  );
  const ledgerEnabled =
    rangeCheck.ok &&
    (!!branchId || aggregateAll) &&
    trimmedPartnerId !== "";

  const reportQuery = useErpReportQuery({
    reportId: "partner-ledger",
    tenantSlug,
    params: {
      from,
      to,
      branchId,
      aggregateAll,
      partnerKind,
      partnerId: trimmedPartnerId,
    },
    queryFn: () =>
      getPartnerLedger(
        tenantSlug,
        branchId,
        partnerKind,
        trimmedPartnerId,
        from,
        to,
        aggregateAll,
      ),
    initialData:
      serverPrefetched &&
      initialLedger != null &&
      defaultPartnerId.trim() !== ""
        ? initialLedger
        : undefined,
    enabled: ledgerEnabled,
  });

  React.useEffect(() => {
    setValidationErr(rangeCheck.ok ? null : rangeCheck.message);
  }, [rangeCheck]);

  const data = ledgerEnabled ? (reportQuery.data ?? null) : null;
  const loading = reportQuery.isFetching;
  const err =
    validationErr ??
    (reportQuery.error instanceof Error
      ? reportQuery.error.message
      : reportQuery.error
        ? "Failed to load partner ledger"
        : null);

  const partnerList = partnerKind === "customer" ? customers : suppliers;

  return (
    <Card className="mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Partner ledger</CardTitle>
        <CardDescription>
          Journal lines for one customer or supplier with running balance.
        </CardDescription>
        <CardAction>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Partner type</Label>
                <Select
                  value={partnerKind}
                  onValueChange={(v) => {
                    setPartnerKind(v as "customer" | "supplier");
                    setPartnerId("");
                  }}
                >
                  <SelectTrigger className="h-8 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Partner</Label>
                <Select
                  value={partnerId || undefined}
                  onValueChange={setPartnerId}
                >
                  <SelectTrigger className="h-8 min-w-[200px]">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerList.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name ?? p.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pl-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="pl-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 w-[148px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pl-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="pl-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 w-[148px]"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8"
                disabled={
                  loading || (!branchId && !aggregateAll) || !partnerId.trim()
                }
                onClick={() => void reportQuery.refetch()}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Refresh
              </Button>
            </div>
          </div>
        </CardAction>
      </CardHeader>
      <Separator />
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0 pt-0">
        {err ? (
          <Alert
            variant="destructive"
            className="mx-4 mt-4"
          >
            <AlertCircle />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        ) : null}
        {!branchId && !aggregateAll ? (
          <p className="mx-4 mt-4 text-sm text-muted-foreground">
            Select a branch or all branches (admin/owner) to load the ledger.
          </p>
        ) : null}
        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : null}
        {data ? (
          <div className="flex-1 overflow-auto p-4 pb-10">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Source</TableHead>
                  <TableHead className="text-muted-foreground">Account</TableHead>
                  <TableHead className="text-right text-muted-foreground">Debit</TableHead>
                  <TableHead className="text-right text-muted-foreground">Credit</TableHead>
                  <TableHead className="text-right text-muted-foreground">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No lines in range.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.lines.map((l, i) => (
                    <TableRow key={`${l.entryDate}-${i}`} className="border-border">
                      <TableCell className="whitespace-nowrap text-xs text-foreground">
                        {l.entryDate}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.sourceType}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-foreground">
                        {l.accountKey ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {l.debit > 0 ? money(l.debit) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {l.credit > 0 ? money(l.credit) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium text-foreground">
                        {money(l.runningBalance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
