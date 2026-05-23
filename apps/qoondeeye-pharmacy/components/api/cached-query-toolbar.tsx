"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type CachedQueryToolbarProps = {
  dataUpdatedAt?: number;
  isFetching?: boolean;
  onRefresh: () => void;
  className?: string;
};

/** Refresh control + last updated time for cached list/dashboard data. */
export function CachedQueryToolbar({
  dataUpdatedAt,
  isFetching = false,
  onRefresh,
  className,
}: CachedQueryToolbarProps) {
  const updatedLabel =
    dataUpdatedAt && dataUpdatedAt > 0
      ? `Updated ${formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}`
      : null;

  return (
    <div
      className={
        className ??
        "flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground"
      }
    >
      {updatedLabel ? <span>{updatedLabel}</span> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={isFetching}
        onClick={onRefresh}
      >
        {isFetching ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden />
        )}
        Refresh
      </Button>
    </div>
  );
}
