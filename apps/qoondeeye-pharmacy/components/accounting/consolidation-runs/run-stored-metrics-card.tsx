"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { RunMetadataPanels } from "./run-metadata-panels";

export function RunStoredMetricsCard({
  metadata,
}: {
  metadata: Record<string, unknown> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stored metrics</CardTitle>
        <CardDescription>
          Values persisted with the run (ownership, FX, balances, P&amp;L).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RunMetadataPanels metadata={metadata} />
      </CardContent>
    </Card>
  );
}
