"use client";

import { Loader2 } from "lucide-react";

import type { Product } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type ProductDeleteSheetProps = {
  open: boolean;
  product: Product | null;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ProductDeleteSheet({
  open,
  product,
  deleting,
  onOpenChange,
  onCancel,
  onConfirm,
}: ProductDeleteSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-none">
        <SheetHeader className="border-b">
          <SheetTitle>Delete product</SheetTitle>
          <SheetDescription>This action cannot be undone.</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          <div className="rounded-xl border bg-muted/20 p-3 text-sm">
            <div className="font-medium">{product?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              Barcode/SKU:{" "}
              <span className="font-mono">{product?.sku ?? "—"}</span>
            </div>
          </div>
        </div>
        <SheetFooter className="border-t">
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={!product || deleting}
            >
              {deleting ? (
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
