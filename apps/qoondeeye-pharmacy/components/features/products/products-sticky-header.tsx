"use client";

import Link from "next/link";
import { Download, Plus, Search, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ProductsStickyHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onAddProduct: () => void;
  addDisabled: boolean;
};

export function ProductsStickyHeader({
  query,
  onQueryChange,
  onAddProduct,
  addDisabled,
}: ProductsStickyHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
      <div className="flex-1" />
      <div className="hidden items-center gap-2 md:flex">
        <div className="relative w-[320px] max-w-[32vw]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name or barcode..."
            className="h-9 rounded-full pl-9"
          />
        </div>
        <Button variant="outline" className="gap-1.5 rounded-full">
          <Download className="h-4 w-4" />
          Export
        </Button>
        <Button variant="outline" className="gap-1.5 rounded-full" asChild>
          <Link href="/inventory/products/import">
            <Upload className="h-4 w-4" />
            Import
          </Link>
        </Button>
        <Button
          className="gap-1.5 rounded-full shadow-md shadow-primary/20 hover:bg-primary/90"
          onClick={onAddProduct}
          disabled={addDisabled}
        >
          <Plus className="h-4 w-4" />
          Add New Product
        </Button>
      </div>
    </header>
  );
}
