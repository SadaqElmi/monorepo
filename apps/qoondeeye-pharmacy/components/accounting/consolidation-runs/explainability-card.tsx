"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ExplainRollupPanel } from "./explain-rollup-panel";
import type { ConsolidationRunDetailSelected } from "./types";

export function ExplainabilityCard({
  explain,
}: {
  explain: ConsolidationRunDetailSelected["explain"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Explainability</CardTitle>
        <CardDescription>
          Roll-up of posted link amounts by elimination type (quick inspection).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ExplainRollupPanel explain={explain} />
      </CardContent>
    </Card>
  );
}
