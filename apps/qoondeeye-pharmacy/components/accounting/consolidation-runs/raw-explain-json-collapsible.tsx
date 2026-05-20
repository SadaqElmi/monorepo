"use client";

import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import type { ConsolidationRunDetailSelected } from "./types";

export function RawExplainJsonCollapsible({
  explain,
}: {
  explain: ConsolidationRunDetailSelected["explain"];
}) {
  return (
    <Collapsible className="group rounded-lg border bg-muted/20 px-4 py-3">
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        Raw explain JSON (advanced)
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">
          {JSON.stringify(explain ?? {}, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
