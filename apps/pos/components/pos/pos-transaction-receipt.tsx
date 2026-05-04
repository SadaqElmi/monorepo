"use client";

import * as React from "react";
import JsBarcode from "jsbarcode";
import { Building2, CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PosTransaction, PosTransactionLine } from "@repo/types";
import { POS_TAX_RATE } from "@repo/types";
import { cn, formatMoney } from "@repo/utils";

export type { PosTransaction, PosTransactionLine };

const BRAND = "#0d968b";

/** localStorage JSON may deserialize amounts as strings; coerce for display. */
function readMoney(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

type PosTransactionReceiptProps = {
  transaction: PosTransaction;
  registerLabel?: string;
  /** When true, renders the sale/receipt lookup barcode (used on every POS print). */
  showBarcode?: boolean;
  className?: string;
};

/**
 * Printable transaction receipt — layout inspired by the Zenith mock,
 * trimmed to real POS data (PharmaCare branding). Optional barcode encodes
 * {@link PosTransaction.saleId} when posted online (best for Returns lookup),
 * otherwise {@link PosTransaction.receiptId}.
 */
export function PosTransactionReceipt({
  transaction: tx,
  registerLabel = "Register #01",
  showBarcode = false,
  className,
}: PosTransactionReceiptProps) {
  const barcodeSvgRef = React.useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    if (!showBarcode) return;
    const el = barcodeSvgRef.current;
    if (!el) return;
    const fromServer = tx.saleId?.trim();
    const payload =
      (fromServer && fromServer.length > 0
        ? fromServer
        : String(tx.receiptId ?? "").replace(/\s+/g, "")) || "0";
    const textUnder =
      fromServer && tx.receiptId ? `Receipt ${tx.receiptId}` : payload;
    try {
      while (el.firstChild) el.removeChild(el.firstChild);
      JsBarcode(el, payload, {
        format: "CODE128",
        width: fromServer ? 1.1 : 1.25,
        height: 48,
        displayValue: true,
        text: textUnder,
        fontSize: fromServer ? 9 : 11,
        textMargin: 4,
        margin: 6,
      });
    } catch {
      /* invalid payload — leave empty */
    }
  }, [showBarcode, tx.receiptId, tx.saleId]);
  const when = new Date(tx.createdAt);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(when);
  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(when);

  const paid = readMoney(tx.amountTendered);
  const totalSale = readMoney(tx.total) ?? 0;
  const changeStored = readMoney(tx.changeDue);
  const changeAmt =
    changeStored != null && changeStored > 0
      ? changeStored
      : paid != null
        ? Math.max(0, Math.round((paid - totalSale) * 100) / 100)
        : 0;
  const showPaidSection = paid != null || changeAmt >= 0.01;

  return (
    <Card
      className={cn(
        "receipt-thermal mx-auto w-full max-w-[72mm] overflow-visible border-0 bg-white text-[12px] leading-[14px] text-neutral-900 shadow-none print:rounded-none print:shadow-none dark:bg-white dark:text-neutral-900",
        className,
      )}
    >
      <div className="px-3 py-4 text-center">
        <div
          className="mb-2 inline-flex items-center justify-center rounded-lg p-1.5"
          style={{ backgroundColor: `${BRAND}1a`, color: BRAND }}
        >
          <Building2 className="size-4" aria-hidden />
        </div>
        <h1
          className="font-sans text-base font-bold tracking-tight"
          style={{ color: BRAND }}
        >
          PharmaCare Pharmacy
        </h1>
        <p className="receipt-muted mt-1 text-[11px] leading-[13px]">
          482 Wellness Plaza, Medical District
          <br />
          Care City, CC 50291
          <br />
          Tel: (555) 010-PHARM | pharmacare.local
        </p>
      </div>

      <CardContent className="space-y-2 px-3 py-3">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="receipt-muted uppercase tracking-wide">Receipt</span>
          <span className="font-mono font-semibold">{tx.receiptId}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="receipt-muted uppercase tracking-wide">Date</span>
          <span>{dateStr}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="receipt-muted uppercase tracking-wide">Time</span>
          <span>{timeStr}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="receipt-muted uppercase tracking-wide">
            Register
          </span>
          <span>{registerLabel}</span>
        </div>
        <Separator className="my-1 bg-neutral-300" />
      </CardContent>

      <div className="p-0.5">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-100 hover:bg-neutral-100">
              <TableHead className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-700">
                Description
              </TableHead>
              <TableHead className="px-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-neutral-700">
                Qty
              </TableHead>
              <TableHead className="px-1 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-neutral-700">
                Unit price
              </TableHead>
              <TableHead className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-neutral-700">
                Total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tx.lines.map((l) => {
              const lineTotal = l.unitPrice * l.qty;
              return (
                <TableRow key={l.lineId} className="hover:bg-neutral-50/80">
                  <TableCell className="px-2 py-1.5 align-top">
                    <p className="text-[11px] font-semibold text-neutral-900">
                      {l.name}
                    </p>
                    <p className="receipt-muted text-[10px]">
                      Unit: {l.unitType}
                    </p>
                  </TableCell>
                  <TableCell className="px-1 py-1.5 text-center text-[11px] font-medium tabular-nums">
                    {l.qty}
                  </TableCell>
                  <TableCell className="px-1 py-1.5 text-right text-[11px] font-medium tabular-nums">
                    {formatMoney(l.unitPrice)}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right text-[11px] font-bold tabular-nums">
                    {formatMoney(lineTotal)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CardContent className="space-y-2 px-3 py-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="receipt-muted uppercase tracking-wide">Payment</span>
          <Badge
            variant="outline"
            className="h-5 border-0 px-1.5 text-[10px] font-bold uppercase"
            style={{ backgroundColor: `${BRAND}1a`, color: BRAND }}
          >
            Success
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded bg-neutral-100"
              style={{ color: BRAND }}
            >
              <CreditCard className="size-3.5" aria-hidden />
            </div>
            <span className="text-[11px] font-semibold">
              {tx.paymentMethod}
            </span>
          </div>
          <span className="receipt-muted text-[10px]">In-store POS</span>
        </div>
        <Separator className="my-1 bg-neutral-300" />
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="receipt-muted">Subtotal</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(tx.subtotal)}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="receipt-muted">{`VAT (${Math.round(POS_TAX_RATE * 100)}%)`}</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(tx.tax)}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="font-semibold">Discount</span>
            <span className="font-semibold tabular-nums">
              -{formatMoney(tx.discount)}
            </span>
          </div>
          <Separator className="my-1 bg-neutral-400" />
          <div className="flex items-end justify-between">
            <span className="font-bold uppercase tracking-wide">Total due</span>
            <span
              className="font-sans text-[14px] font-extrabold tabular-nums"
              style={{ color: BRAND }}
            >
              {formatMoney(tx.total)}
            </span>
          </div>
          {showPaidSection ? (
            <>
              <Separator className="my-1 bg-neutral-300" />
              {paid != null ? (
                <div className="flex justify-between gap-2 text-[11px]">
                  <span className="min-w-0 font-semibold">
                    {tx.paymentMethod}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(paid)}
                  </span>
                </div>
              ) : null}
              {changeAmt >= 0.01 ? (
                <div className="flex justify-between gap-2 text-[11px]">
                  <span className="font-bold uppercase tracking-wide">
                    Charge
                  </span>
                  <span className="font-bold tabular-nums">
                    {formatMoney(changeAmt)}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 bg-white px-3 py-3 text-center">
        {showBarcode ? (
          <div className="flex w-full flex-col items-center gap-1 py-1">
            <svg
              ref={barcodeSvgRef}
              className="max-h-[150px] w-full max-w-[260px]"
              aria-label="Sale lookup barcode for returns"
            />
            <p className="receipt-muted max-w-[240px] px-1 text-[9px] leading-snug">
              Scan this code in POS Returns to open the sale for return vouchers
              or refunds (same as receipt # or sale ID).
            </p>
          </div>
        ) : null}
        <div className="space-y-1">
          <p className="text-[11px] font-semibold">
            Thank you for choosing PharmaCare Pharmacy.
          </p>
          <p className="receipt-muted text-[10px] uppercase leading-relaxed">
            Prescription items follow dispensing rules. OTC returns within 7
            days with this receipt when allowed by policy.
          </p>
        </div>
        <div className="receipt-muted text-[10px] font-mono">
          Ref: {tx.receiptId} · {when.getTime()}
        </div>
      </CardFooter>
    </Card>
  );
}
