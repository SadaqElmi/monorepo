"use client";

import * as React from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStoredUser } from "@/lib/auth-client";
import {
  createPaymentTerm,
  getPaymentTerms,
  type PaymentTermRow,
} from "@/lib/services/accounting";

export default function ConfigurationPaymentTermsPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<PaymentTermRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [days, setDays] = React.useState("30");

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
    const onBranch = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { branchId?: string | null };
      if (detail?.branchId) setBranchId(detail.branchId);
      else syncBranch();
    };
    window.addEventListener("storage", () => syncBranch());
    window.addEventListener("activeBranchChanged", onBranch as EventListener);
    return () => {
      window.removeEventListener("activeBranchChanged", onBranch as EventListener);
    };
  }, [syncBranch]);

  const load = React.useCallback(async () => {
    if (!branchId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await getPaymentTerms(tenantSlug, branchId);
      setRows(list);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load payment terms");
      setRows([]);
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
      setErr("Select a branch first.");
      return;
    }
    const d = Number(days);
    if (!name.trim() || !Number.isFinite(d) || d < 0) {
      setErr("Enter a name and valid days until due.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await createPaymentTerm(tenantSlug, {
        branchId,
        name: name.trim(),
        daysUntilDue: d,
      });
      setName("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not create term");
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
          Select a branch to manage payment terms.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add payment term</CardTitle>
          <CardDescription>
            Named terms with days until due (reference data for invoicing flows).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid max-w-md gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pt-name">Name</Label>
              <Input
                id="pt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Net 30"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pt-days">Days until due</Label>
              <Input
                id="pt-days"
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting || !branchId}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment terms</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !branchId ? null : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No terms yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.days_until_due}
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
