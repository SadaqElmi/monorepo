"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export type BillsPurchasesPaginationProps = {
  showingStart: number;
  showingEnd: number;
  filteredTotal: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function BillsPurchasesPagination({
  showingStart,
  showingEnd,
  filteredTotal,
  page,
  totalPages,
  onPageChange,
  onPrevPage,
  onNextPage,
}: BillsPurchasesPaginationProps) {
  const show = 5;
  let start = Math.max(1, page - Math.floor(show / 2));
  const end = Math.min(totalPages, start + show - 1);
  if (end - start + 1 < show) {
    start = Math.max(1, end - show + 1);
  }
  const pageNumbers = Array.from(
    { length: end - start + 1 },
    (_, i) => start + i,
  );

  return (
    <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium">{showingStart}</span> to{" "}
        <span className="font-medium">{showingEnd}</span> of{" "}
        <span className="font-medium">{filteredTotal}</span> purchases
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={onPrevPage}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous</span>
        </Button>
        {pageNumbers.map((n) => (
          <Button
            key={n}
            variant={n === page ? "default" : "outline"}
            size="icon"
            className="h-8 w-8 rounded-lg text-xs font-medium"
            onClick={() => onPageChange(n)}
          >
            {n}
          </Button>
        ))}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-lg"
          onClick={onNextPage}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next</span>
        </Button>
      </div>
    </div>
  );
}
