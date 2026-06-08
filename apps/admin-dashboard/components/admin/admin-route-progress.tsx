"use client";

import { useIsFetching } from "@tanstack/react-query";

/** Thin bar under the top nav while any admin TanStack query is in flight. */
export function AdminRouteProgress() {
  const fetching = useIsFetching({ queryKey: ["erp", "admin"] });

  if (!fetching) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-14 z-50 h-0.5 overflow-hidden bg-primary/15"
      role="status"
      aria-live="polite"
      aria-label="Loading admin data"
    >
      <div className="h-full w-1/3 animate-pulse bg-primary" />
    </div>
  );
}
