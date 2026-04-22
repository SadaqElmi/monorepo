"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";

import { ReturnVoucherPrint } from "@/components/pos/return-voucher-print";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import {
  createReturnVoucher,
  finalizeReturnVoucher,
  getProductByBarcode,
  getProducts,
  getReturnVoucherByToken,
  getSaleById,
  getSaleByReceiptNumber,
  type ReturnVoucherCreated,
  type Sale,
  type SaleItem,
} from "@/lib/api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function lookupSale(
  tenantSlug: string,
  query: string,
): Promise<Sale | null> {
  const q = query.trim();
  if (!q) return null;
  let sale: Sale | null = null;
  if (UUID_RE.test(q)) {
    try {
      sale = await getSaleById(tenantSlug, q);
    } catch {
      sale = null;
    }
  }
  if (!sale) {
    try {
      sale = await getSaleByReceiptNumber(tenantSlug, q);
    } catch {
      sale = null;
    }
  }
  if (!sale && !UUID_RE.test(q)) {
    try {
      sale = await getSaleById(tenantSlug, q);
    } catch {
      sale = null;
    }
  }
  return sale;
}

type PosReturnPanelProps = {
  tenantSlug: string | null;
  brandColor?: string;
};

export function PosReturnPanel({
  tenantSlug,
  brandColor = "#0d968b",
}: PosReturnPanelProps) {
  const [lookupInput, setLookupInput] = React.useState("");
  const [sale, setSale] = React.useState<Sale | null>(null);
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);

  const [productNames, setProductNames] = React.useState<
    Record<string, string>
  >({});
  const [barcodeToProductId, setBarcodeToProductId] = React.useState<
    Record<string, string>
  >({});
  const [returnQtyByLine, setReturnQtyByLine] = React.useState<
    Record<string, string>
  >({});
  const [issueLoading, setIssueLoading] = React.useState<string | null>(null);
  const [voucher, setVoucher] = React.useState<ReturnVoucherCreated | null>(
    null,
  );

  const [productBarcode, setProductBarcode] = React.useState("");
  const [resolvedProductId, setResolvedProductId] = React.useState<
    string | null
  >(null);
  const [voucherIdInput, setVoucherIdInput] = React.useState("");
  const [tokenInput, setTokenInput] = React.useState("");
  const [refundMethod, setRefundMethod] = React.useState("cash");
  const [finalizeLoading, setFinalizeLoading] = React.useState(false);
  const [finalizeError, setFinalizeError] = React.useState<string | null>(null);
  const [finalizeSuccess, setFinalizeSuccess] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const prods = await getProducts(tenantSlug);
        if (cancelled) return;
        const map: Record<string, string> = {};
        const bc: Record<string, string> = {};
        for (const p of prods) {
          map[p.id] = p.name;
          const code = (p.sku ?? "").trim().toLowerCase();
          if (code) bc[code] = p.id;
        }
        setProductNames(map);
        setBarcodeToProductId(bc);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const runLookup = async () => {
    if (!tenantSlug) return;
    setLookupError(null);
    setLookupLoading(true);
    setSale(null);
    setVoucher(null);
    try {
      const found = await lookupSale(tenantSlug, lookupInput);
      if (!found) {
        setLookupError("No sale found for this receipt # or transaction ID.");
        return;
      }
      setSale(found);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  };

  const lineLabel = (item: SaleItem) =>
    productNames[item.product_id ?? ""] ?? item.product_id ?? "Product";

  const issueVoucher = async (item: SaleItem) => {
    if (!tenantSlug || !sale) return;
    const id = item.id;
    const raw = returnQtyByLine[id] ?? "1";
    const qty = Number.parseInt(raw, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      setLookupError("Enter a valid return quantity.");
      return;
    }
    setIssueLoading(id);
    setLookupError(null);
    try {
      const created = await createReturnVoucher(tenantSlug, {
        saleId: sale.id,
        saleItemId: item.id,
        quantity: qty,
        reason: "POS return voucher",
      });
      setVoucher(created);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Could not create voucher");
    } finally {
      setIssueLoading(null);
    }
  };

  const resolveBarcode = async () => {
    setResolvedProductId(null);
    setFinalizeError(null);
    const code = productBarcode.trim();
    if (!code) return;
    if (UUID_RE.test(code)) {
      setResolvedProductId(code);
      return;
    }
    if (tenantSlug) {
      try {
        const p = await getProductByBarcode(tenantSlug, code);
        setResolvedProductId(p.id);
        return;
      } catch {
        /* fall through to local map */
      }
    }
    const byBc = barcodeToProductId[code.toLowerCase()];
    if (byBc) {
      setResolvedProductId(byBc);
      return;
    }
    setFinalizeError(
      "Could not match barcode to catalog. Paste product UUID or scan a valid barcode.",
    );
  };

  const resolveTokenToVoucherId = async () => {
    if (!tenantSlug) return;
    const tok = tokenInput.trim();
    if (!tok) return;
    try {
      const v = await getReturnVoucherByToken(tenantSlug, tok);
      setVoucherIdInput(v.id);
      setFinalizeError(null);
    } catch {
      /* invalid token */
    }
  };

  const runFinalize = async () => {
    if (!tenantSlug) return;
    setFinalizeError(null);
    setFinalizeSuccess(null);
    const vid = voucherIdInput.trim();
    const tok = tokenInput.trim();
    if (!vid || !tok) {
      setFinalizeError("Enter voucher ID and token (from barcode).");
      return;
    }
    if (!resolvedProductId) {
      setFinalizeError("Confirm the product (scan / resolve barcode first).");
      return;
    }
    const item = sale?.items?.find((i) => i.product_id === resolvedProductId);
    const unitPrice = item ? num(item.price) : undefined;
    setFinalizeLoading(true);
    try {
      const result = await finalizeReturnVoucher(tenantSlug, vid, {
        token: tok,
        confirmedProductId: resolvedProductId,
        scannedUnitPrice: unitPrice,
        refundMethod,
      });
      setFinalizeSuccess(
        `Return completed. Refund ${Number(result.refundAmount).toFixed(2)} (${refundMethod}).`,
      );
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Return receipt</title>
<style>body{font-family:system-ui,sans-serif;max-width:400px;margin:24px auto;padding:12px}h1{font-size:1rem}</style></head><body>
<h1>PharmaCare — Return receipt</h1>
<p>Sale return ID: <strong>${result.saleReturn.id}</strong></p>
<p>Original receipt #: ${result.receiptNumber ?? "—"}</p>
<p>Refund: <strong>$${Number(result.refundAmount).toFixed(2)}</strong> (${refundMethod})</p>
<p>${new Date().toLocaleString()}</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
      const w = window.open("", "_blank", "noopener,noreferrer");
      if (w) {
        w.document.write(html);
        w.document.close();
      }
      setVoucher(null);
      setSale(null);
      setLookupInput("");
      setVoucherIdInput("");
      setTokenInput("");
      setProductBarcode("");
      setResolvedProductId(null);
    } catch (e) {
      setFinalizeError(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setFinalizeLoading(false);
    }
  };

  if (!tenantSlug) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Returns</CardTitle>
          <CardDescription>
            Sign in with a tenant and select a branch (local storage) to look
            up sales and issue return vouchers.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const voucherUnit = voucher ? num(voucher.unit_price) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Look up sale</CardTitle>
          <CardDescription>
            Search by printed receipt number (e.g. 00042) or transaction ID
            (sale UUID).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="pos-return-lookup">Receipt # or transaction ID</Label>
            <Input
              id="pos-return-lookup"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="00042 or UUID"
              className="font-mono text-sm"
            />
          </div>
          <Button
            type="button"
            disabled={lookupLoading}
            className="gap-2 text-primary-foreground"
            style={{ backgroundColor: brandColor }}
            onClick={() => void runLookup()}
          >
            {lookupLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Find sale
          </Button>
        </CardContent>
        {lookupError ? (
          <CardContent className="pt-0">
            <p className="text-sm text-destructive">{lookupError}</p>
          </CardContent>
        ) : null}
      </Card>

      {sale?.items?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sale lines</CardTitle>
            <CardDescription>
              Enter qty to return and issue a voucher. Stock updates when you
              finalize the voucher below.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="w-28">Return qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {lineLabel(item)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantity ?? 0}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 font-mono text-xs"
                        value={returnQtyByLine[item.id] ?? "1"}
                        onChange={(e) =>
                          setReturnQtyByLine((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(num(item.price))}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={issueLoading === item.id}
                        onClick={() => void issueVoucher(item)}
                      >
                        {issueLoading === item.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Issue voucher"
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {voucher ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voucher issued</CardTitle>
            <CardDescription>
              Print the voucher for the customer. Complete the return using
              Finalize below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">ID: {voucher.id}</Badge>
              <Badge variant="outline">Qty: {voucher.quantity}</Badge>
            </div>
            <ReturnVoucherPrint
              voucherId={voucher.id}
              token={voucher.token}
              productName={
                productNames[
                  sale?.items?.find((i) => i.id === voucher.sale_item_id)
                    ?.product_id ?? ""
                ] ?? "Item"
              }
              quantity={voucher.quantity}
              unitPrice={voucherUnit}
              receiptNumber={sale?.receipt_number ?? null}
              originalSaleId={voucher.sale_id}
              brandColor={brandColor}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Finalize return</CardTitle>
          <CardDescription>
            1) Resolve product (barcode / ID). 2) Enter voucher ID + token from
            the printed voucher. 3) Choose refund method and confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Product barcode or ID</Label>
              <div className="flex gap-2">
                <Input
                  value={productBarcode}
                  onChange={(e) => setProductBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void resolveBarcode();
                  }}
                  placeholder="Scan or paste"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void resolveBarcode()}
                >
                  OK
                </Button>
              </div>
              {resolvedProductId ? (
                <p className="text-xs text-muted-foreground">
                  Matched product ID:{" "}
                  <span className="font-mono">{resolvedProductId}</span>
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Refund method</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Voucher ID (UUID)</Label>
              <Input
                value={voucherIdInput}
                onChange={(e) => setVoucherIdInput(e.target.value)}
                className="font-mono text-xs"
                placeholder="From printed voucher"
              />
            </div>
            <div className="space-y-2">
              <Label>Token (barcode value)</Label>
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void resolveTokenToVoucherId();
                }}
                className="font-mono text-xs"
              />
            </div>
          </div>
          {finalizeError ? (
            <p className="text-sm text-destructive">{finalizeError}</p>
          ) : null}
          {finalizeSuccess ? (
            <p className="text-sm text-emerald-600">{finalizeSuccess}</p>
          ) : null}
          <Button
            type="button"
            disabled={finalizeLoading}
            className="text-primary-foreground"
            style={{ backgroundColor: brandColor }}
            onClick={() => void runFinalize()}
          >
            {finalizeLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Confirm return & refund"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}
