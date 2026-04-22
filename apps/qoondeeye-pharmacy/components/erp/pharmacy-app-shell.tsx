"use client";

import type { ReactNode } from "react";

import { DrawerHostProvider } from "@/components/DrawerHost";
import { Toaster } from "@repo/ui/sonner";

import { AppTopNav } from "./app-top-nav";

export function PharmacyAppShell({ children }: { children: ReactNode }) {
  return (
    <DrawerHostProvider>
      <div className="flex min-h-dvh flex-col">
        <AppTopNav />
        <main className="min-h-[calc(100dvh-3.5rem)] flex-1">{children}</main>
        <Toaster richColors position="top-center" />
      </div>
    </DrawerHostProvider>
  );
}
