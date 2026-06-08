import { Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type AdminPageLoadingProps = {
  message?: string;
};

/** Centered spinner for full admin page / main content area. */
export function AdminPageLoading({
  message = "Loading…",
}: AdminPageLoadingProps) {
  return (
    <div
      className="flex min-h-[50vh] flex-1 items-center justify-center p-6 md:p-8"
      role="status"
      aria-busy="true"
      aria-label={message}
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}

type AdminKpiSkeletonProps = {
  count?: number;
};

/** KPI card placeholders (platform overview). */
export function AdminKpiSkeleton({ count = 5 }: AdminKpiSkeletonProps) {
  return (
    <section
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="ring-1 ring-foreground/10">
          <CardContent className="flex flex-col gap-3 p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

type AdminTableSkeletonProps = {
  rows?: number;
  cols?: number;
};

/** Table body placeholder inside a card. */
export function AdminTableSkeleton({
  rows = 6,
  cols = 5,
}: AdminTableSkeletonProps) {
  return (
    <div className="space-y-3 px-4 py-6" aria-hidden>
      <div className="flex gap-3 border-b border-border/60 pb-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

type AdminCardTableLoadingProps = {
  message?: string;
  rows?: number;
  cols?: number;
};

/** Card with skeleton table + optional status line. */
export function AdminCardTableLoading({
  message = "Loading data…",
  rows = 6,
  cols = 5,
}: AdminCardTableLoadingProps) {
  return (
    <div role="status" aria-busy="true" aria-label={message}>
      <div className="flex items-center justify-center gap-2 border-b px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{message}</span>
      </div>
      <AdminTableSkeleton rows={rows} cols={cols} />
    </div>
  );
}

type AdminDashboardLoadingProps = {
  message?: string;
};

/** Overview page: KPI grid + two table cards. */
export function AdminDashboardLoading({
  message = "Loading platform overview…",
}: AdminDashboardLoadingProps) {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label={message}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{message}</span>
      </div>
      <AdminKpiSkeleton />
      <section className="grid gap-6 xl:grid-cols-2">
        {["Recent clients", "Recent domains"].map((title) => (
          <Card key={title} className="ring-1 ring-foreground/10">
            <CardHeader className="border-b pb-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-4 w-full max-w-sm" />
            </CardHeader>
            <CardContent className="px-0">
              <AdminTableSkeleton rows={5} cols={4} />
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
