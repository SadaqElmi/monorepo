"use client";

import {
  CheckCircle2,
  CircleDot,
  FileText,
  History,
  Loader2,
  Package,
  ShieldCheck,
  ShieldX,
  Truck,
} from "lucide-react";

import type { TransferEventDto } from "@/lib/services/transfers";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";
import { cn } from "@/lib/utils";

function eventTypeKey(e: TransferEventDto): string {
  return (e.event_type ?? e.type ?? "").toLowerCase();
}

function eventMeta(e: TransferEventDto): { label: string; hint?: string } {
  const t = eventTypeKey(e);
  if (t.includes("created") || t === "draft")
    return { label: "Draft created", hint: "No stock movement" };
  if (t.includes("confirm") && !t.includes("un"))
    return { label: "Confirmed", hint: "Order approved; still no stock move" };
  if (t.includes("approval") && t.includes("request"))
    return { label: "Approval requested", hint: "Awaiting manager" };
  if (t.includes("approv") && !t.includes("reject"))
    return { label: "Approved", hint: "Ready to ship" };
  if (t.includes("reject"))
    return { label: "Rejected", hint: "Revise and resubmit" };
  if (t.includes("reverse"))
    return { label: "Reversed", hint: "Operational and accounting reversal posted" };
  if (t.includes("ship"))
    return { label: "Shipped", hint: "Stock OUT @ source · transfer_out" };
  if (t.includes("receive"))
    return { label: "Received", hint: "Stock IN @ destination · transfer_in" };
  if (t.includes("qty") || t.includes("update") || t.includes("edit"))
    return { label: "Edited", hint: e.message ?? undefined };
  return {
    label: e.type ?? e.event_type ?? "Event",
    hint: e.message ?? undefined,
  };
}

function EventIcon({ typeKey }: { typeKey: string }) {
  if (typeKey.includes("ship"))
    return <Truck className="size-4 text-sky-600 dark:text-sky-400" />;
  if (typeKey.includes("receive"))
    return <Package className="size-4 text-teal-600 dark:text-teal-400" />;
  if (typeKey.includes("approv") && !typeKey.includes("reject"))
    return <ShieldCheck className="size-4 text-violet-600 dark:text-violet-400" />;
  if (typeKey.includes("reject"))
    return <ShieldX className="size-4 text-destructive" />;
  if (typeKey.includes("confirm"))
    return <CheckCircle2 className="size-4 text-primary" />;
  if (typeKey.includes("created") || typeKey.includes("draft"))
    return <FileText className="size-4 text-muted-foreground" />;
  return <CircleDot className="size-4 text-muted-foreground" />;
}

function eventAccentClass(typeKey: string): string {
  if (typeKey.includes("ship")) return "group-hover:ring-sky-500/25";
  if (typeKey.includes("receive"))
    return "group-hover:ring-teal-500/25";
  if (typeKey.includes("approv") && !typeKey.includes("reject"))
    return "group-hover:ring-violet-500/25";
  if (typeKey.includes("reject")) return "group-hover:ring-destructive/25";
  if (typeKey.includes("confirm")) return "group-hover:ring-primary/25";
  return "group-hover:ring-muted-foreground/20";
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function TransferActivityTimeline({
  events,
  loading,
}: {
  events: TransferEventDto[];
  loading?: boolean;
}) {
  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.created_at ?? 0).getTime();
    const tb = new Date(b.created_at ?? 0).getTime();
    return ta - tb;
  });

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 bg-card/80 shadow-sm ring-1 ring-border/40 backdrop-blur-sm dark:bg-card/50">
      <CardHeader className="border-b border-border/50 bg-linear-to-r from-teal-600/6 via-transparent to-transparent pb-4 dark:from-teal-500/10">
        <CardTitle className="text-base font-semibold tracking-tight">
          Activity timeline
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed sm:text-sm">
          Audit trail of status changes and stock moves for this transfer.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 py-14 text-center dark:bg-muted/10"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="size-8 animate-spin text-teal-600 dark:text-teal-400"
              aria-hidden
            />
            <p className="text-sm font-medium text-foreground">Loading events…</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Fetching timeline from the server.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/15 py-14 text-center dark:bg-muted/10">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border/50 dark:bg-muted/40">
              <History className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-sm font-medium text-foreground">No events yet</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Timeline entries appear when this transfer is updated—create, confirm,
              ship, receive, and approvals are recorded automatically.
            </p>
          </div>
        ) : (
          <ul className="space-y-0">
            {sorted.map((e, index) => {
              const tk = eventTypeKey(e);
              const { label, hint } = eventMeta(e);
              const branchId =
                e.branch_id ??
                (typeof e.metadata?.["branch_id"] === "string"
                  ? e.metadata["branch_id"]
                  : null);
              const isLast = index === sorted.length - 1;
              return (
                <li key={e.id} className="group flex gap-4">
                  <div className="flex w-11 shrink-0 flex-col items-center self-stretch pt-0.5">
                    <div
                      className={cn(
                        "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted/90 shadow-md ring-1 ring-border/60 transition-[box-shadow,background-color] duration-200",
                        eventAccentClass(tk),
                        "group-hover:bg-background group-hover:shadow-lg dark:bg-muted/70 dark:group-hover:bg-muted/90",
                      )}
                    >
                      <EventIcon typeKey={tk} />
                    </div>
                    {!isLast ? (
                      <span
                        className="mt-2 w-px flex-1 min-h-5 bg-linear-to-b from-border via-border/80 to-transparent dark:from-border/80"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "min-w-0 flex-1",
                      isLast ? "pb-2" : "pb-8",
                    )}
                  >
                    <div
                      className={cn(
                        "space-y-2 rounded-xl border border-border/40 bg-muted/25 px-4 py-3.5 transition-colors",
                        "group-hover:border-teal-500/20 group-hover:bg-muted/40 dark:border-border/30 dark:bg-muted/15 dark:group-hover:border-teal-500/15 dark:group-hover:bg-muted/25",
                      )}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-sm font-semibold leading-snug text-foreground">
                          {label}
                        </p>
                        <time
                          className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground sm:text-xs"
                          dateTime={e.created_at}
                        >
                          {formatWhen(e.created_at)}
                        </time>
                      </div>
                      {hint ? (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {hint}
                        </p>
                      ) : null}
                      {branchId ? (
                        <p className="text-[11px] text-muted-foreground">
                          Branch: <span className="font-medium">{branchId}</span>
                        </p>
                      ) : null}
                      {e.message && e.message !== hint ? (
                        <p className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground dark:bg-background/40">
                          {e.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
