"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function ConfigurationErrorBanner({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <Alert
      variant="destructive"
      className={cn("border-destructive/30 bg-destructive/5", className)}
    >
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function ConfigurationSuccessBanner({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <Alert
      className={cn(
        "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100",
        className,
      )}
    >
      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
