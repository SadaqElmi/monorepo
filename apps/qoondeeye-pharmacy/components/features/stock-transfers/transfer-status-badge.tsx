import { Badge } from "@repo/ui/badge";
import { cn } from "@/lib/utils";

import type { TransferStatus } from "./types";

export function TransferStatusBadge({
  status,
  className,
}: {
  status: TransferStatus;
  className?: string;
}) {
  const config: Record<
    TransferStatus,
    { label: string; className: string }
  > = {
    draft: {
      label: "Draft",
      className:
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-0",
    },
    confirmed: {
      label: "Confirmed",
      className:
        "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300 border-0",
    },
    shipped: {
      label: "Shipped",
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-0",
    },
    received: {
      label: "Received",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-0",
    },
    closed: {
      label: "Closed",
      className:
        "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100 border-0",
    },
  };

  const c = config[status];
  return (
    <Badge
      className={cn(
        "text-[10px] font-bold uppercase tracking-wider",
        c.className,
        className,
      )}
    >
      {c.label}
    </Badge>
  );
}
