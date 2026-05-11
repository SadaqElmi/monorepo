"use client";

import type { ReactNode } from "react";

import { DrawerHostProvider } from "@/components/DrawerHost";
import { Toaster } from "@/components/ui/sonner";
import { useBranchQuerySync } from "@/hooks/use-branch-query-sync";

import { AppTopNav } from "./app-top-nav";

function BranchQuerySyncHost() {
  useBranchQuerySync();
  return null;
}

export function PharmacyAppShell({ children }: { children: ReactNode }) {
  return (
    <DrawerHostProvider>
      <BranchQuerySyncHost />
      <div className="flex min-h-dvh flex-col">
        <AppTopNav />
        <main className="min-h-[calc(100dvh-3.5rem)] flex-1">{children}</main>
        <Toaster richColors position="top-center" />
      </div>
    </DrawerHostProvider>
  );
}
