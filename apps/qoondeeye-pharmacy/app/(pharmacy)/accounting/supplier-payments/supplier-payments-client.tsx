"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST, ERP_STALE_STATIC } from "@/lib/erp-query-options";
import {
  createSupplierPayment,
  getSupplierPayments,
  getSuppliers,
} from "@/lib/api";

const PAYMENT_METHOD_PRESETS = [
  { value: "cash", label: "Cash" },
  { value: "bank transfer", label: "Bank transfer" },
  { value: "mobile wallet", label: "Mobile wallet" },
  { value: "card", label: "Card" },
] as const;

const PAYMENTS_LIMIT = 80;

export default function SupplierPaymentsPage() {
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [supplierId, setSupplierId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<string>(
    PAYMENT_METHOD_PRESETS[0].value,
  );

  const syncBranch = React.useCallback(() => {
    try {
      const v = localStorage.getItem("branchId");
      const t = v?.trim();
      setBranchId(t && t !== "all" ? t : null);
    } catch {
      setBranchId(null);
    }
  }, []);

  React.useEffect(() => {
    syncBranch();
    const onStorage = () => syncBranch();
    const onBranch = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { branchId?: string | null };
      if (detail?.branchId) setBranchId(detail.branchId);
      else syncBranch();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("activeBranchChanged", onBranch as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "activeBranchChanged",
        onBranch as EventListener,
      );
    };
  }, [syncBranch]);

  const suppliersQuery = useQuery({
    queryKey: erpKeys.suppliers(tenantSlug, branchFacet),
    queryFn: () => getSuppliers(tenantSlug),
    enabled: Boolean(tenantSlug && branchId),
    staleTime: ERP_STALE_STATIC,
  });
  const paymentsQuery = useQuery({
    queryKey: erpKeys.supplierPayments(
      tenantSlug,
      branchFacet,
      branchId ?? "",
      PAYMENTS_LIMIT,
    ),
    queryFn: () => getSupplierPayments(tenantSlug, branchId!, PAYMENTS_LIMIT),
    enabled: Boolean(tenantSlug && branchId),
    staleTime: ERP_STALE_LIST,
  });

  const suppliers = suppliersQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const loading = suppliersQuery.isPending || paymentsQuery.isPending;
  const loadError = suppliersQuery.error ?? paymentsQuery.error;
  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load data"
        : null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId) {
      setError("Select a branch in the app header (or open Purchases once to set it).");
      return;
    }
    const amt = Number(amount);
    if (!supplierId || !Number.isFinite(amt) || amt <= 0) {
      setError("Choose a supplier and enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createSupplierPayment(tenantSlug, {
        branchId,
        supplierId,
        amount: amt,
        paymentDate,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentMethod,
      });
      setAmount("");
      setReference("");
      setNotes("");
      await queryClient.invalidateQueries({
        queryKey: ["erp", "supplier-payments"],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {displayError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {displayError}
        </p>
      ) : null}

      {!branchId ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          No branch selected. Set <strong>branchId</strong> in local storage
          (same as Purchases / POS), or pick a branch from your app shell if
          available.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Record supplier payment</CardTitle>
          <CardDescription>
            Posts <strong>Dr Accounts payable</strong> /{" "}
            <strong>Cr Cash or Bank</strong> based on payment method. Credit
            purchases must be settled here to clear AP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
            <div className="grid gap-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Select
                value={supplierId || undefined}
                onValueChange={setSupplierId}
                disabled={!suppliers.length}
              >
                <SelectTrigger id="supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name ?? s.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payDate">Payment date</Label>
                <Input
                  id="payDate"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm">Paid from (GL)</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="pm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ref">Reference (optional)</Label>
              <Input
                id="ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque #, transfer ref"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting || !branchId}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Post payment"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent supplier payments</CardTitle>
          <CardDescription>
            Newest first. Each row has a matching journal with source{" "}
            <code className="text-xs">ap_payment</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !branchId ? null : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">
                      {p.paymentDate}
                    </TableCell>
                    <TableCell>{p.supplierName ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(p.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.paymentMethod ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-muted-foreground">
                      {p.reference ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
