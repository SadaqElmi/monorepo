"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ReportPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <Card className="w-full max-w-lg py-6">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>
            This report is not wired up yet. Use Accounting in the top menu for
            journals, chart of accounts, and live financial statements.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
