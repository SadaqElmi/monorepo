"use client";

import * as React from "react";
import { Receipt, RotateCcw, ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { brand } from "./pharmacy-pos-constants";

export type PosMainTab = "register" | "transactions" | "returns";

type PharmacyPosToolbarProps = {
  mainTab: PosMainTab;
  onSelectTab: (tab: PosMainTab) => void;
  transactionsCount: number;
};

export function PharmacyPosToolbar({
  mainTab,
  onSelectTab,
  transactionsCount,
}: PharmacyPosToolbarProps) {
  return (
    <div className="flex shrink-0 gap-2 rounded-xl border border-[color:var(--pos-brand)]/15 bg-white p-1 dark:bg-slate-900/60">
      <Button
        type="button"
        variant={mainTab === "register" ? "default" : "ghost"}
        size="sm"
        onClick={() => onSelectTab("register")}
        className={cn(
          "flex-1 gap-2 rounded-lg font-semibold",
          mainTab === "register" &&
            "text-primary-foreground shadow-none hover:opacity-90",
          mainTab === "register" &&
            "bg-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]",
        )}
        style={
          mainTab === "register" ? { backgroundColor: brand } : undefined
        }
      >
        <ShoppingCart className="size-4" />
        Register
      </Button>
      <Button
        type="button"
        variant={mainTab === "transactions" ? "default" : "ghost"}
        size="sm"
        onClick={() => onSelectTab("transactions")}
        className={cn(
          "flex-1 gap-2 rounded-lg font-semibold",
          mainTab === "transactions" &&
            "text-primary-foreground shadow-none hover:opacity-90",
          mainTab === "transactions" &&
            "bg-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]",
        )}
        style={
          mainTab === "transactions" ? { backgroundColor: brand } : undefined
        }
      >
        <Receipt className="size-4" />
        Transactions
        {transactionsCount > 0 ? (
          <Badge
            variant="secondary"
            className="ml-0.5 h-5 min-w-5 px-1.5 text-[10px] tabular-nums"
          >
            {transactionsCount}
          </Badge>
        ) : null}
      </Button>
      <Button
        type="button"
        variant={mainTab === "returns" ? "default" : "ghost"}
        size="sm"
        onClick={() => onSelectTab("returns")}
        className={cn(
          "flex-1 gap-2 rounded-lg font-semibold",
          mainTab === "returns" &&
            "text-primary-foreground shadow-none hover:opacity-90",
          mainTab === "returns" &&
            "bg-[color:var(--pos-brand)] hover:bg-[color:var(--pos-brand)]",
        )}
        style={mainTab === "returns" ? { backgroundColor: brand } : undefined}
      >
        <RotateCcw className="size-4" />
        Returns
      </Button>
    </div>
  );
}
