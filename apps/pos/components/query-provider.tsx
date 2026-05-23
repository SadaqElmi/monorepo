"use client";

import * as React from "react";
import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from "@tanstack/react-query";

import { queryRetryPolicy } from "@repo/utils";

import { POS_GC_TIME, POS_STALE_SALES } from "@/lib/pos-query-keys";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: POS_STALE_SALES,
        gcTime: POS_GC_TIME,
        refetchOnWindowFocus: false,
        retry: queryRetryPolicy,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeQueryClient);
  return (
    <TanstackQueryClientProvider client={client}>
      {children}
    </TanstackQueryClientProvider>
  );
}
