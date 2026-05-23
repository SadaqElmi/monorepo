"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { reconcileClientBranchSelection } from "@/lib/branch-reconcile";

/** POS always uses a single branch — reset invalid `branchId` on load. */
export function BranchReconcileHost() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { changed } = reconcileClientBranchSelection();
    if (changed) {
      void queryClient.invalidateQueries({ queryKey: ["pos"] });
    }
  }, [queryClient]);

  return null;
}
