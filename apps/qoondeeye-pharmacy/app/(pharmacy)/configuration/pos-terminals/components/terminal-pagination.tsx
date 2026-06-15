"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  page: number;
  limit: number;
  total: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (limit: number) => void;
  isFetching?: boolean;
};

export function TerminalPagination({
  page,
  limit,
  total,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  isFetching,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const showPager = total > limit || (pageSizeOptions?.length && onPageSizeChange);

  if (!showPager) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-1 py-3 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total}
        {isFetching ? " (updating…)" : ""}
      </span>
      <div className="flex items-center gap-2">
        {pageSizeOptions?.length && onPageSizeChange ? (
          <Select
            value={String(limit)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || isFetching}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages || isFetching}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
