"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ConsolidationErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Consolidation error</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
