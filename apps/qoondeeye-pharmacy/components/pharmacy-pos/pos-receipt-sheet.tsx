"use client";

import { createPortal } from "react-dom";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PosTransaction } from "@/components/pos/pos-transaction-receipt";
import { PosTransactionReceipt } from "@/components/pos/pos-transaction-receipt";

import { brand } from "./pharmacy-pos-constants";

type PosReceiptSheetProps = {
  selectedReceipt: PosTransaction | null;
  onClose: () => void;
  onPrintReceipt: (tx: PosTransaction) => void;
};

export function PosReceiptSheet({
  selectedReceipt,
  onClose,
  onPrintReceipt,
}: PosReceiptSheetProps) {
  return (
    <Sheet
      open={selectedReceipt != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="no-print shrink-0">
          <SheetTitle>Transaction receipt</SheetTitle>
          <SheetDescription>
            Preview matches the printed layout. Use Print receipt for your
            printer.
          </SheetDescription>
        </SheetHeader>
        {selectedReceipt ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 py-4">
            <PosTransactionReceipt transaction={selectedReceipt} />
            <Button
              type="button"
              className="no-print gap-2 font-semibold text-primary-foreground"
              style={{ backgroundColor: brand }}
              onClick={() => onPrintReceipt(selectedReceipt)}
            >
              <Printer className="size-4" />
              Print receipt
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function PosReceiptPrintPortal({
  transaction,
}: {
  transaction: PosTransaction | null;
}) {
  if (transaction == null || typeof document === "undefined") return null;
  return createPortal(
    <div className="receipt-print-mount">
      <PosTransactionReceipt transaction={transaction} />
    </div>,
    document.body,
  );
}
