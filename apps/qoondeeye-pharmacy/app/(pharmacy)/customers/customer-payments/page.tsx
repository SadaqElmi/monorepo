"use client";

import * as React from "react";
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
import { getStoredUser } from "@/lib/auth-client";
import { money } from "@/lib/accounting-display";
import {
  createCustomerPayment,
  getCustomerPayments,
  type CustomerPaymentRow,
} from "@/lib/services/accounting";
import { getCustomers, type Customer } from "@/lib/services/customers";

const PAYMENT_METHOD_PRESETS = [
  { value: "cash", label: "Cash" },
  { value: "bank transfer", label: "Bank transfer" },
  { value: "mobile wallet", label: "Mobile wallet" },
  { value: "card", label: "Card" },
] as const;

export default function CustomerPaymentsPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );

  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [payments, setPayments] = React.useState<CustomerPaymentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [customerId, setCustomerId] = React.useState("");
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

  const load = React.useCallback(async () => {
    if (!branchId) {
      setPayments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const [cust, pay] = await Promise.all([
        getCustomers(tenantSlug),
        getCustomerPayments(tenantSlug, branchId, 80),
      ]);
      setCustomers(cust);
      setPayments(pay);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load data");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, branchId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId) {
      setErr(
        "Select a branch in the app header (or open Purchases once to set it).",
      );
      return;
    }
    const amt = Number(amount);
    if (!customerId || !Number.isFinite(amt) || amt <= 0) {
      setErr("Choose a customer and enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await createCustomerPayment(tenantSlug, {
        branchId,
        customerId,
        amount: amt,
        paymentDate,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentMethod,
      });
      setAmount("");
      setReference("");
      setNotes("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not save payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </p>
      ) : null}

      {!branchId ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          No branch selected. Set <strong>branchId</strong> in local storage,
          or pick a branch from your app shell if available.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Record customer payment</CardTitle>
          <CardDescription>
            Posts <strong>Dr Cash or Bank</strong> /{" "}
            <strong>Cr Accounts receivable</strong> for on-account sales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
            <div className="grid gap-2">
              <Label htmlFor="customer">Customer</Label>
              <Select
                value={customerId || undefined}
                onValueChange={setCustomerId}
                disabled={!customers.length}
              >
                <SelectTrigger id="customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? c.id.slice(0, 8)}
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
              <Label htmlFor="pm">Received into (GL)</Label>
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
                placeholder="Receipt #, transfer ref"
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
          <CardTitle>Recent customer payments</CardTitle>
          <CardDescription>
            Newest first. Each row has a matching journal with source{" "}
            <code className="text-xs">ar_payment</code>.
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
                  <TableHead>Customer</TableHead>
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
                    <TableCell>{p.customerName ?? "—"}</TableCell>
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
