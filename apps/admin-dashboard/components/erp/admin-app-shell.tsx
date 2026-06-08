"use client";

import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import { AdminTopNav } from "./admin-top-nav";

export function AdminAppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex min-h-dvh flex-col">
        <AdminTopNav />
        <main className="min-h-[calc(100dvh-3.5rem)] flex-1">{children}</main>
        <Toaster richColors position="top-center" />
      </div>
    </>
  );
}
