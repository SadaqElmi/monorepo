import { QueryClient } from "@tanstack/react-query";
import { cache } from "react";

import { ERP_GC_TIME, ERP_STALE_LIST } from "@/lib/erp-query-options";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: ERP_STALE_LIST,
        gcTime: ERP_GC_TIME,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

const getServerQueryClient = cache(() => makeQueryClient());

export function getQueryClient() {
  if (typeof window === "undefined") {
    return getServerQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
