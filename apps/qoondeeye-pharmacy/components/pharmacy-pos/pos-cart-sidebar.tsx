"use client";

import { Card } from "@/components/ui/card";

import type { CartLine } from "./pharmacy-pos-types";
import {
  PosCartSection,
  PosCartSidebarHeader,
} from "./pos-cart-section";
import { PosPaymentSection } from "./pos-payment-section";

type PosCartSidebarProps = {
  checkoutStep: "cart" | "payment";
  cart: CartLine[];
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  heldOrdersCount: number;
  heldSheetOpen: boolean;
  onClearCart: () => void;
  onHoldOrder: () => void;
  onOpenHeldSheet: () => void;
  onSetQty: (lineId: string, qty: number) => void;
  onCycleUnit: (lineId: string) => void;
  onEditDiscount: () => void;
  onGoToPayment: () => void;
  onBackToCart: () => void;
  onCompletePayment: (paymentLabel: string, paymentMethodCode?: string) => void;
};

export function PosCartSidebar({
  checkoutStep,
  cart,
  discount,
  subtotal,
  tax,
  total,
  heldOrdersCount,
  heldSheetOpen,
  onClearCart,
  onHoldOrder,
  onOpenHeldSheet,
  onSetQty,
  onCycleUnit,
  onEditDiscount,
  onGoToPayment,
  onBackToCart,
  onCompletePayment,
}: PosCartSidebarProps) {
  return (
    <Card className="flex w-[420px] shrink-0 flex-col overflow-hidden border-[color:var(--pos-brand)]/10 p-0 shadow-sm dark:bg-slate-900/40">
      <PosCartSidebarHeader
        checkoutStep={checkoutStep}
        cartLength={cart.length}
        onClearCart={onClearCart}
        onHoldOrder={onHoldOrder}
        onOpenHeldSheet={onOpenHeldSheet}
        heldOrdersCount={heldOrdersCount}
        heldSheetOpen={heldSheetOpen}
      />

      {checkoutStep === "cart" ? (
        <PosCartSection
          cart={cart}
          discount={discount}
          subtotal={subtotal}
          tax={tax}
          total={total}
          onClearCart={onClearCart}
          onSetQty={onSetQty}
          onCycleUnit={onCycleUnit}
          onEditDiscount={onEditDiscount}
          onGoToPayment={onGoToPayment}
        />
      ) : (
        <PosPaymentSection
          total={total}
          onBackToCart={onBackToCart}
          onCompletePayment={onCompletePayment}
        />
      )}
    </Card>
  );
}
