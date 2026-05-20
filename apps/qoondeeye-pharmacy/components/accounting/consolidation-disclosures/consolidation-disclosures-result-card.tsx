"use client";

import { Suspense } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RouteLoading } from "@/components/loading/route-loading";

import { DisclosurePayloadView } from "./disclosure-payload-view";
import type { DisclosureTab } from "./utils";

export function ConsolidationDisclosuresResultCard({
  tabTitle,
  loading,
  tab,
  payload,
}: {
  tabTitle: string;
  loading: boolean;
  tab: DisclosureTab;
  payload: Record<string, unknown> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tabTitle}</CardTitle>
        <CardDescription>
          Structured view for the selected tab. Use raw JSON only if you need the exact API
          payload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <Suspense fallback={<RouteLoading variant="section" />}>
            <DisclosurePayloadView tab={tab} payload={payload} />
          </Suspense>
        )}
        {!loading && payload ? (
          <Collapsible className="group rounded-lg border bg-muted/15 px-3 py-2">
            <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              Raw API payload (advanced)
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <pre className="max-h-[50vh] overflow-auto rounded-md border bg-background p-3 text-[11px] leading-relaxed">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
    </Card>
  );
}
