"use client";

import * as React from "react";
import { Separator } from "@repo/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@repo/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Button } from "@repo/ui/button";
import { getStoredUser } from "@/lib/auth-client";
import { createSaleReturn, getSaleReturns, type SaleReturn } from "@/lib/api";

export default function SaleReturnsPage() {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [rows, setRows] = React.useState<SaleReturn[]>([]);
  const [saleId, setSaleId] = React.useState("");
  const [saleItemId, setSaleItemId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!tenantSlug) return;
    try {
      setError(null);
      const data = await getSaleReturns(tenantSlug);
      setRows(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load sale returns",
      );
    }
  }, [tenantSlug]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (
      !saleId.trim() ||
      !saleItemId.trim() ||
      !Number.isFinite(qty) ||
      qty <= 0
    ) {
      setError("Enter sale id, sale item id and valid quantity.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await createSaleReturn(tenantSlug, {
        saleId: saleId.trim(),
        reason: reason.trim() || undefined,
        items: [{ saleItemId: saleItemId.trim(), quantity: qty }],
      });
      setSaleId("");
      setSaleItemId("");
      setQuantity("1");
      setReason("");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create sale return",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 items-center gap-2 border-b px-4">
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Sale Returns</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Sale Return</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleCreate}
              className="grid grid-cols-1 gap-3 md:grid-cols-2"
            >
              <div className="space-y-1.5">
                <Label>Sale ID</Label>
                <Input
                  value={saleId}
                  onChange={(e) => setSaleId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sale Item ID</Label>
                <Input
                  value={saleItemId}
                  onChange={(e) => setSaleItemId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Create return"}
                </Button>
              </div>
            </form>
            {error ? (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded border p-2 text-sm">
                  <div>Return ID: {r.id}</div>
                  <div>Sale ID: {r.sale_id}</div>
                  <div>Date: {r.return_date}</div>
                </div>
              ))}
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No returns yet.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
