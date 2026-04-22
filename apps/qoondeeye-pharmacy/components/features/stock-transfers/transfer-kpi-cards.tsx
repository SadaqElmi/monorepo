"use client";

import type { ComponentType } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  FileEdit,
  Truck,
} from "lucide-react";

import { Card, CardContent } from "@repo/ui/card";
import { cn } from "@/lib/utils";

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tone: "primary" | "violet" | "blue" | "emerald";
}) {
  const iconWrap = {
    primary: "bg-primary/10 text-primary",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  }[tone];

  const corner = {
    primary: "bg-primary/5",
    violet: "bg-violet-500/5",
    blue: "bg-blue-500/5",
    emerald: "bg-emerald-500/5",
  }[tone];

  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-transparent shadow-sm ring-1 ring-border/60 transition-colors hover:border-primary/10">
      <div
        className={cn(
          "absolute -right-8 -top-8 size-24 rounded-bl-full transition-transform group-hover:scale-110",
          corner,
        )}
      />
      <CardContent className="relative p-6">
        <div className="mb-4 flex items-start justify-between">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              iconWrap,
            )}
          >
            <Icon className="size-5" />
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
              tone === "primary" && "bg-primary/10 text-primary",
              tone === "violet" &&
                "bg-violet-500/10 text-violet-700 dark:text-violet-400",
              tone === "blue" && "bg-blue-500/10 text-blue-700 dark:text-blue-400",
              tone === "emerald" &&
                "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            )}
          >
            {hint}
          </span>
        </div>
        <div className="text-2xl font-extrabold tracking-tight">{value}</div>
        <div className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}

export function TransferKpiCards({
  drafts,
  confirmedOrders,
  inTransit,
  received,
}: {
  drafts: number;
  confirmedOrders: number;
  inTransit: number;
  received: number;
}) {
  return (
    <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Drafts"
        value={drafts.toLocaleString()}
        hint="Planning"
        icon={FileEdit}
        tone="primary"
      />
      <KpiCard
        label="Confirmed orders"
        value={confirmedOrders.toLocaleString()}
        hint="Ready to ship"
        icon={ClipboardCheck}
        tone="violet"
      />
      <KpiCard
        label="In transit"
        value={inTransit.toLocaleString()}
        hint="Stock out @ source"
        icon={Truck}
        tone="blue"
      />
      <KpiCard
        label="Received"
        value={received.toLocaleString()}
        hint="Final"
        icon={CheckCircle2}
        tone="emerald"
      />
    </div>
  );
}
