"use client";

import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";

import { PAYMENT_METHODS, brand } from "./pharmacy-pos-constants";
import { formatMoney } from "./pharmacy-pos-utils";

type PosPaymentSectionProps = {
  total: number;
  onBackToCart: () => void;
  onCompletePayment: (paymentLabel: string, paymentMethodCode?: string) => void;
};

export function PosPaymentSection({
  total,
  onBackToCart,
  onCompletePayment,
}: PosPaymentSectionProps) {
  return (
    <CardFooter className="flex min-h-0 flex-1 flex-col gap-6 border-t border-[color:var(--pos-brand)]/10 bg-[color:var(--pos-brand)]/5 py-8">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Amount due</p>
        <p
          className="text-3xl font-black tabular-nums"
          style={{ color: brand }}
        >
          {formatMoney(total)}
        </p>
      </div>
      <div className="grid w-full max-h-[min(45vh,420px)] grid-cols-3 gap-2 overflow-y-auto pr-1">
        {PAYMENT_METHODS.map((m) => {
          const Icon = m.icon;
          return (
            <Button
              key={m.id}
              type="button"
              variant="outline"
              className="h-auto flex-col gap-1 rounded-xl border-2 border-[color:var(--pos-brand)]/25 px-2 py-3 text-[11px] font-semibold hover:bg-[color:var(--pos-brand)]/10"
              onClick={() => void onCompletePayment(m.label, m.id)}
            >
              <Icon className="size-5 shrink-0 text-[color:var(--pos-brand)]" />
              <span className="text-center leading-tight">{m.label}</span>
            </Button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full gap-2 rounded-xl border-0 bg-white text-base font-bold text-[color:var(--pos-brand)] shadow-sm hover:bg-[color:var(--pos-brand)]/12 dark:bg-slate-800/90"
        onClick={onBackToCart}
      >
        <Undo2 className="size-4" />
        Back to cart
      </Button>
    </CardFooter>
  );
}
