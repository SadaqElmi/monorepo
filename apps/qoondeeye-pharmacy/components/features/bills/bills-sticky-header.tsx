"use client";

import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BillsStickyHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onNewPurchase: () => void;
  newPurchaseDisabled: boolean;
};

export function BillsStickyHeader({
  query,
  onQueryChange,
  onNewPurchase,
  newPurchaseDisabled,
}: BillsStickyHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md supports-backdrop-filter:bg-background/60">
      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <div className="relative w-64 max-w-[32vw] hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search purchases..."
            className="h-9 rounded-full pl-9"
          />
        </div>
        <Button
          className="gap-2 rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
          onClick={onNewPurchase}
          disabled={newPurchaseDisabled}
        >
          <Plus className="h-4 w-4" />
          New Purchase
        </Button>
      </div>
    </header>
  );
}
