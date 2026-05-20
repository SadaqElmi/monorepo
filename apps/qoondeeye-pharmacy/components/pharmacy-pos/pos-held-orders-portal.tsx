"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

import { brand } from "./pharmacy-pos-constants";
import type { HeldOrder } from "./pharmacy-pos-types";
import { cartTotals, formatMoney } from "./pharmacy-pos-utils";

type PosHeldOrdersPortalProps = {
  open: boolean;
  heldOrders: HeldOrder[];
  onClose: () => void;
  onRecall: (order: HeldOrder) => void;
  onRemove: (id: string) => void;
};

export function PosHeldOrdersPortal({
  open,
  heldOrders,
  onClose,
  onRecall,
  onRemove,
}: PosHeldOrdersPortalProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 dark:bg-black/60"
        aria-label="Close held orders"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-held-orders-title"
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-popover text-popover-foreground shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <h2
            id="pos-held-orders-title"
            className="text-base font-semibold text-foreground"
          >
            Held &amp; suspended
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="shrink-0 px-4 py-2 text-sm text-muted-foreground">
          Recall a sale when the customer returns to pay. Your current register
          cart is replaced when you recall.
        </p>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
          {heldOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No held orders.</p>
          ) : (
            heldOrders.map((h) => (
              <Card
                key={h.id}
                className="gap-2 bg-slate-50 py-3 shadow-sm ring-0 dark:bg-slate-800/50"
              >
                <CardContent className="flex flex-col gap-3 px-3 py-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{h.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.lines.length} line(s) ·{" "}
                        {formatMoney(cartTotals(h.lines, 0).subtotal)} subtotal
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        style={{ backgroundColor: brand }}
                        className="text-primary-foreground"
                        onClick={() => onRecall(h)}
                      >
                        Recall
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onRemove(h.id)}
                      >
                        Drop
                      </Button>
                    </div>
                  </div>
                  <ul className="text-xs text-muted-foreground">
                    {h.lines.slice(0, 4).map((l) => (
                      <li key={l.lineId}>
                        {l.name} × {l.qty}
                      </li>
                    ))}
                    {h.lines.length > 4 ? <li>…</li> : null}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
