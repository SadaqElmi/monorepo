"use client";

import { useQueryClient } from "@tanstack/react-query";
import { subscribeCatalogBump } from "@repo/utils";
import * as React from "react";

/** Refetch POS register catalog when ERP bumps product data (same origin / other tab). */
export function PosCatalogSync() {
  const queryClient = useQueryClient();

  React.useEffect(
    () =>
      subscribeCatalogBump(() => {
        void queryClient.invalidateQueries({ queryKey: ["pos", "catalog"] });
      }),
    [queryClient],
  );

  return null;
}
