"use client";

import { Badge } from "@/components/ui/badge";
import { bindingBadgeVariant } from "@/lib/pos-terminals/terminal-status";

export function TerminalStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "default" : "secondary"}>
      {status}
    </Badge>
  );
}

export function TerminalBindingBadge({ bindingStatus }: { bindingStatus: string }) {
  return (
    <Badge variant={bindingBadgeVariant(bindingStatus)}>{bindingStatus}</Badge>
  );
}
