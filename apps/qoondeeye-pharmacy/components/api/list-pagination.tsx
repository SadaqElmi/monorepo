"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type ListPaginationProps = {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
};

export function ListPagination({
  page,
  totalPages,
  total,
  onPageChange,
  disabled,
  className,
}: ListPaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);

  return (
    <div
      className={
        className ??
        "flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm text-muted-foreground"
      }
    >
      <span>
        Page {safePage} of {safeTotalPages}
        {typeof total === "number" ? ` · ${total.toLocaleString()} total` : ""}
      </span>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || safePage >= safeTotalPages}
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
