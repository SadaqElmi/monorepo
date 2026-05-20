"use client";

import { FileEdit, PauseCircle, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { POS_TAX_RATE } from "@repo/types";

import { brand } from "./pharmacy-pos-constants";
import type { CartLine } from "./pharmacy-pos-types";
import { formatMoney, lineIconForProductId } from "./pharmacy-pos-utils";

type PosCartSectionProps = {
  cart: CartLine[];
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  onClearCart: () => void;
  onSetQty: (lineId: string, qty: number) => void;
  onCycleUnit: (lineId: string) => void;
  onEditDiscount: () => void;
  onGoToPayment: () => void;
};

export function PosCartSection({
  cart,
  discount,
  subtotal,
  tax,
  total,
  onClearCart,
  onSetQty,
  onCycleUnit,
  onEditDiscount,
  onGoToPayment,
}: PosCartSectionProps) {
  return (
    <>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
        {cart.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Tap a product to add lines, or hold the order when a customer steps
            away.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[2.2fr_0.8fr_1fr_1fr_1fr] items-center gap-2 px-3 pb-1 text-[11px] font-semibold uppercase text-muted-foreground">
              <span>Item</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit</span>
              <span className="text-right">Cart disc</span>
              <span className="text-right">Line</span>
            </div>

            {cart.map((item) => {
              const Icon = lineIconForProductId(item.productId);
              const lineSubtotal = item.unitPrice * item.qty;
              const allocatedDiscount =
                subtotal > 0 ? (lineSubtotal / subtotal) * discount : 0;
              const discountedLinePrice = lineSubtotal - allocatedDiscount;

              const discText =
                allocatedDiscount > 0
                  ? `-${formatMoney(allocatedDiscount)}`
                  : formatMoney(0);

              return (
                <Card
                  key={item.lineId}
                  className="gap-0 border-[color:var(--pos-brand)]/5 py-3 dark:bg-[#102220]/30"
                >
                  <CardContent className="grid grid-cols-[2.2fr_0.8fr_1fr_1fr_1fr] items-center gap-2 px-3 py-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[color:var(--pos-brand)]/10">
                        <Icon
                          className="size-5 text-[color:var(--pos-brand)]"
                          aria-hidden
                        />
                      </div>
                      <div className="min-w-0">
                        <h5 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {item.name}
                        </h5>
                        {item.listUnitPrice != null &&
                        item.listUnitPrice > item.unitPrice ? (
                          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                            <span className="line-through tabular-nums">
                              {formatMoney(item.listUnitPrice)}
                            </span>
                            <span className="mx-1 text-muted-foreground/80">
                              →
                            </span>
                            <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                              {formatMoney(item.unitPrice)}
                            </span>
                            <span className="sr-only">
                              {" "}
                              list to sale per unit
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <div className="flex items-center gap-2 rounded-lg bg-[color:var(--pos-brand)]/5 p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 text-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]/10"
                          aria-label="Decrease quantity"
                          onClick={() => onSetQty(item.lineId, item.qty - 1)}
                        >
                          −
                        </Button>
                        <span className="w-4 text-center text-xs font-bold">
                          {item.qty}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 text-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]/10"
                          aria-label="Increase quantity"
                          onClick={() => onSetQty(item.lineId, item.qty + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    <div className="text-right">
                      <button
                        type="button"
                        className="text-sm font-medium text-slate-800 dark:text-slate-100 cursor-pointer hover:opacity-80"
                        onClick={() => onCycleUnit(item.lineId)}
                        aria-label={`Change unit for ${item.name}`}
                      >
                        {item.unitType}
                      </button>
                    </div>

                    <div className="text-right text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      {discText}
                    </div>

                    <div className="text-right text-sm font-bold text-slate-800 dark:text-slate-100">
                      {formatMoney(discountedLinePrice)}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-4 border-t border-[color:var(--pos-brand)]/10 bg-[color:var(--pos-brand)]/5 py-6">
        <div className="w-full space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{`Tax (${Math.round(POS_TAX_RATE * 100)}%)`}</span>
            <span className="font-medium">{formatMoney(tax)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Discount</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                −{formatMoney(discount)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-[color:var(--pos-brand)]"
                aria-label="Edit discount"
                onClick={onEditDiscount}
              >
                <FileEdit className="size-4" />
              </Button>
            </div>
          </div>
          <Separator className="my-1 bg-[color:var(--pos-brand)]/10" />
          <div className="flex items-end justify-between pt-1">
            <span className="font-bold text-slate-800 dark:text-slate-100">
              Total
            </span>
            <span className="text-2xl font-black" style={{ color: brand }}>
              {formatMoney(total)}
            </span>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-auto rounded-xl border-2 border-[color:var(--pos-brand)]/20 py-4 font-bold text-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]/5"
            onClick={onClearCart}
            disabled={cart.length === 0}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-auto gap-2 rounded-xl py-4 font-bold text-primary-foreground shadow-lg shadow-[color:var(--pos-brand)]/20 disabled:opacity-50"
            style={{ backgroundColor: brand }}
            disabled={cart.length === 0}
            onClick={onGoToPayment}
          >
            Total
          </Button>
        </div>
      </CardFooter>
    </>
  );
}

type PosCartSidebarHeaderProps = {
  checkoutStep: "cart" | "payment";
  cartLength: number;
  onClearCart: () => void;
  onHoldOrder: () => void;
  onOpenHeldSheet: () => void;
  heldOrdersCount: number;
  heldSheetOpen: boolean;
};

export function PosCartSidebarHeader({
  checkoutStep,
  cartLength,
  onClearCart,
  onHoldOrder,
  onOpenHeldSheet,
  heldOrdersCount,
  heldSheetOpen,
}: PosCartSidebarHeaderProps) {
  return (
    <CardHeader className="flex flex-col gap-3 border-b border-[color:var(--pos-brand)]/5 bg-[color:var(--pos-brand)]/5 py-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShoppingCart
            className="size-5 text-[color:var(--pos-brand)]"
            aria-hidden
          />
          <CardTitle className="text-lg font-bold">
            {checkoutStep === "payment" ? "Payment" : "Current order"}
          </CardTitle>
        </div>
        {checkoutStep === "cart" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearCart}
            disabled={cartLength === 0}
            className="text-xs font-semibold text-red-500 hover:text-red-600 hover:underline disabled:opacity-40"
          >
            Clear all
          </Button>
        ) : null}
      </div>
      {checkoutStep === "cart" && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cartLength === 0}
            onClick={onHoldOrder}
            className="gap-1.5 border-[color:var(--pos-brand)]/30 font-semibold text-[color:var(--pos-brand)]"
          >
            <PauseCircle className="size-4" />
            Hold / suspend
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={heldOrdersCount === 0}
            className="font-semibold"
            aria-haspopup="dialog"
            aria-expanded={heldSheetOpen}
            onClick={onOpenHeldSheet}
          >
            Held orders ({heldOrdersCount})
          </Button>
        </div>
      )}
    </CardHeader>
  );
}
