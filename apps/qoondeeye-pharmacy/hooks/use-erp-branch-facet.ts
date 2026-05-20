"use client";

import { useEffect, useState } from "react";

import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";

/** Branch facet for TanStack query keys; syncs on branch change events. */
export function useErpBranchFacet(): string {
  const [branchFacet, setBranchFacet] = useState(() =>
    typeof window !== "undefined" ? getBranchQueryKeyFacet() : "",
  );

  useEffect(() => {
    const sync = () => setBranchFacet(getBranchQueryKeyFacet());
    window.addEventListener("storage", sync);
    window.addEventListener("activeBranchChanged", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("activeBranchChanged", sync as EventListener);
    };
  }, []);

  return branchFacet;
}
