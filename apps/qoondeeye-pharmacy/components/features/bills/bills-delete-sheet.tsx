"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Purchase, Supplier } from "@/lib/api";

import { formatDate, formatMoney } from "./bills-format";

export type BillsDeleteSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleteCandidate: Purchase | null;
  supplierMap: Map<string, Supplier>;
  deletingId: string | null;
  onCancel: () => void;
  onConfirmDelete: () => void;
};

export function BillsDeleteSheet({
  open,
  onOpenChange,
  deleteCandidate,
  supplierMap,
  deletingId,
  onCancel,
  onConfirmDelete,
}: BillsDeleteSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Delete purchase</SheetTitle>
          <SheetDescription>
            This cannot be undone. If this purchase had line items, those
            quantities are removed from inventory and batches.
          </SheetDescription>
        </SheetHeader>

        <div className="p-4">
          {deleteCandidate ? (
            <div className="rounded-xl border bg-muted/20 p-4 text-sm">
              <div className="font-semibold">
                {supplierMap.get(deleteCandidate.supplier_id ?? "")?.name ??
                  "Unnamed supplier"}
              </div>
              {(deleteCandidate.item_count ?? 0) > 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  This purchase has {deleteCandidate.item_count} line item
                  {deleteCandidate.item_count === 1 ? "" : "s"}. Deleting will
                  reverse that stock in inventory, reduce linked batches, and
                  remove batch rows that reach zero quantity (blocked if stock
                  was already sold or adjusted away).
                </div>
              ) : null}
              <div className="mt-2 text-muted-foreground">
                Invoice:{" "}
                <span className="font-mono">
                  {deleteCandidate.invoice_number ?? "—"}
                </span>
              </div>
              <div className="mt-2 text-muted-foreground">
                Total:{" "}
                <span className="font-mono">
                  {formatMoney(deleteCandidate.total_amount)}
                </span>
              </div>
              <div className="mt-2 text-muted-foreground">
                Date:{" "}
                <span className="font-mono">
                  {formatDate(deleteCandidate.purchase_date)}
                </span>
              </div>
              <div className="mt-2 text-muted-foreground">
                Created:{" "}
                <span className="font-mono">
                  {formatDate(deleteCandidate.created_at)}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t">
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={!!deletingId}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={!deleteCandidate || !!deletingId}
            >
              {deletingId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
