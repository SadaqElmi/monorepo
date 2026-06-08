"use client";

import * as React from "react";
import { QueryClientProvider as TanstackQueryClientProvider } from "@tanstack/react-query";

import { makeQueryClient } from "@/lib/get-query-client";

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeQueryClient);
  return (
    <TanstackQueryClientProvider client={client}>
      {children}
    </TanstackQueryClientProvider>
  );
}
