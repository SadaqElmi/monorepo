"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";

/** Branch facet for TanStack query keys; syncs on navigation and branch change. */
export function usePosBranchFacet(tenantSlug: string | null): string {
  const pathname = usePathname();
  const [branchFacet, setBranchFacet] = useState(() =>
    typeof window !== "undefined" ? getBranchQueryKeyFacet() : "",
  );

  useEffect(() => {
    setBranchFacet(getBranchQueryKeyFacet());
  }, [pathname, tenantSlug]);

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
