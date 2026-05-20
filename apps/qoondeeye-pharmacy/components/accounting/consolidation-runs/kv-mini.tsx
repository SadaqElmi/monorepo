"use client";

import type * as React from "react";

export function KvMini({
  items,
}: {
  items: { label: string; value: React.ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2"
        >
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium tabular-nums text-foreground">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
