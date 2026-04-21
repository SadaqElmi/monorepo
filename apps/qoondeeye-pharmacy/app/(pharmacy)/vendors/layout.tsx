"use client";

import type { ReactNode } from "react";

import { ReportScopeBadge } from "@/components/accounting/report-scope-badge";
import { AccountingHubBar } from "@/components/accounting/accounting-hub-bar";

export default function VendorsModuleLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <AccountingHubBar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="px-4 pt-3 md:px-8">
          <ReportScopeBadge />
        </div>
        <div>{children}</div>
      </div>
    </>
  );
}
