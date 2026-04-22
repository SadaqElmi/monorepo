"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";

import { Button } from "@repo/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";

type ReturnVoucherPrintProps = {
  voucherId: string;
  token: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  receiptNumber: string | null;
  originalSaleId: string;
  brandColor?: string;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function ReturnVoucherPrint({
  voucherId,
  token,
  productName,
  quantity,
  unitPrice,
  receiptNumber,
  originalSaleId,
  brandColor = "#0d968b",
}: ReturnVoucherPrintProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    try {
      while (el.firstChild) el.removeChild(el.firstChild);
      JsBarcode(el, token, {
        format: "CODE128",
        width: 2,
        height: 64,
        displayValue: true,
        fontSize: 12,
        margin: 8,
      });
    } catch {
      /* invalid token length for barcode — still show token text */
    }
  }, [token]);

  const triggerPrint = () => {
    document.body.classList.add("printing-return-voucher");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  React.useEffect(() => {
    const end = () => {
      document.body.classList.remove("printing-return-voucher");
    };
    window.addEventListener("afterprint", end);
    return () => window.removeEventListener("afterprint", end);
  }, []);

  const lineTotal = unitPrice * quantity;

  const card = (
    <div className="return-voucher-print-mount">
      <Card className="receipt-card border-neutral-200 bg-white text-neutral-900 shadow-sm print:shadow-none">
        <CardHeader className="border-b border-neutral-100 pb-3">
          <CardTitle className="text-base" style={{ color: brandColor }}>
            PharmaCare — Return voucher
          </CardTitle>
          <p className="text-xs text-neutral-500">
            Present this voucher to complete the return at the register.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-4 text-sm">
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-neutral-500">Voucher ID</span>
            <span className="font-mono">{voucherId}</span>
          </div>
          {receiptNumber ? (
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-neutral-500">Original receipt #</span>
              <span className="font-mono font-semibold">{receiptNumber}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-2 text-xs">
            <span className="text-neutral-500">Original sale (UUID)</span>
            <span className="max-w-[200px] break-all font-mono text-[10px]">
              {originalSaleId}
            </span>
          </div>
          <div className="border-t border-neutral-100 pt-3">
            <p className="font-semibold text-neutral-900">{productName}</p>
            <p className="mt-1 text-xs text-neutral-600">
              Qty: {quantity} × {formatMoney(unitPrice)} ={" "}
              <span className="font-bold text-neutral-900">
                {formatMoney(lineTotal)}
              </span>
            </p>
          </div>
          <div className="flex justify-center overflow-hidden rounded border border-neutral-200 bg-white py-2">
            <svg ref={svgRef} className="max-w-full" aria-label="Voucher barcode" />
          </div>
          <p className="text-center font-mono text-[10px] text-neutral-500">
            Scan token: {token}
          </p>
        </CardContent>
        <CardFooter className="border-t border-neutral-100 text-[10px] text-neutral-500">
          Keep for your records. Expires per store policy (see POS).
        </CardFooter>
      </Card>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {typeof document !== "undefined"
        ? createPortal(card, document.body)
        : null}
      <Button
        type="button"
        variant="outline"
        className="no-print gap-2 font-semibold"
        style={{ borderColor: brandColor, color: brandColor }}
        onClick={triggerPrint}
      >
        Print voucher
      </Button>
    </div>
  );
}
