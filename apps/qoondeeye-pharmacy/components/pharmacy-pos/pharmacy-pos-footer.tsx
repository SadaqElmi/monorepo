"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

type PharmacyPosFooterProps = {
  formattedFooter: string;
  onLogout: () => void;
};

export function PharmacyPosFooter({
  formattedFooter,
  onLogout,
}: PharmacyPosFooterProps) {
  return (
    <footer className="flex h-12 shrink-0 items-center justify-between border-t border-[color:var(--pos-brand)]/10 bg-white px-8 text-[11px] text-muted-foreground dark:bg-[#102220]/80">
      <div className="flex gap-6">
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">
            F1
          </kbd>{" "}
          Search
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">
            F2
          </kbd>{" "}
          Customer
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800">
            ESC
          </kbd>{" "}
          Cancel
        </span>
      </div>
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-[color:var(--pos-brand)]/25 text-[11px] text-slate-700 hover:bg-[color:var(--pos-brand)]/10 dark:text-slate-200"
          onClick={onLogout}
        >
          <LogOut className="size-3.5" aria-hidden />
          Log out
        </Button>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
          Register #01
        </span>
        <span className="font-medium uppercase text-slate-700 dark:text-slate-300">
          {formattedFooter}
        </span>
      </div>
    </footer>
  );
}
