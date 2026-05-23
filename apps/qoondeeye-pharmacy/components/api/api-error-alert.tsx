"use client";

import { AlertCircle } from "lucide-react";

import { formatApiErrorForUser } from "@/lib/services/http";

type ApiErrorAlertProps = {
  error: unknown;
  className?: string;
};

export function ApiErrorAlert({ error, className }: ApiErrorAlertProps) {
  if (!error) return null;
  const message = formatApiErrorForUser(error);
  return (
    <div
      role="alert"
      className={
        className ??
        "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      }
    >
      <div className="flex gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{message}</p>
      </div>
    </div>
  );
}
