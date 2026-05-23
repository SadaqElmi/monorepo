"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { invalidateReportCache } from "@/lib/services/accounting";

/** Invalidate tenant-scoped ERP queries when branch selection changes. */
export function useBranchQuerySync() {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const onBranchChange = () => {
      void queryClient.cancelQueries({ queryKey: ["erp"] });
      invalidateReportCache();
      queueMicrotask(() => {
        void queryClient.invalidateQueries({ queryKey: ["erp"] });
      });
    };

    window.addEventListener("activeBranchChanged", onBranchChange);
    window.addEventListener("storage", onBranchChange);
    return () => {
      window.removeEventListener("activeBranchChanged", onBranchChange);
      window.removeEventListener("storage", onBranchChange);
    };
  }, [queryClient]);
}
