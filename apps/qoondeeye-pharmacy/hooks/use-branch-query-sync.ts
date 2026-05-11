"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

/** Invalidate tenant-scoped ERP queries when branch selection changes. */
export function useBranchQuerySync() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["erp"] });
    };

    window.addEventListener("activeBranchChanged", invalidate);
    window.addEventListener("storage", invalidate);
    return () => {
      window.removeEventListener("activeBranchChanged", invalidate);
      window.removeEventListener("storage", invalidate);
    };
  }, [queryClient]);
}
