"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getResolvedStoredUser } from "@/lib/auth-client";
import { reconcileClientBranchSelection } from "@/lib/branch-reconcile";
import { erpKeys } from "@/lib/erp-query-keys";
import { erpQueryOptions } from "@/lib/erp-query-options";
import { getBranchQueryKeyFacet } from "@/lib/query-branch-key";
import { getBranches } from "@/lib/services/branches";

/** Runs once per session to fix stale `branchId` before data queries fire. */
export function BranchReconcileHost() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const user = getResolvedStoredUser();
    const slug = user?.tenantSlug?.trim();
    if (!slug || user?.userType === "system") {
      const { changed } = reconcileClientBranchSelection();
      if (changed) {
        void queryClient.invalidateQueries({ queryKey: ["erp"] });
      }
      return;
    }

    let cancelled = false;
    const branchFacet = getBranchQueryKeyFacet();

    void (async () => {
      try {
        const rows = await queryClient.fetchQuery({
          queryKey: erpKeys.branches(slug, branchFacet),
          ...erpQueryOptions.static,
          queryFn: ({ signal }) => getBranches(slug, { signal }),
        });
        if (cancelled) return;
        const ids = rows.map((b) => b.id);
        const { changed } = reconcileClientBranchSelection(ids);
        if (changed) {
          void queryClient.invalidateQueries({ queryKey: ["erp"] });
        }
      } catch {
        if (!cancelled) {
          const { changed } = reconcileClientBranchSelection();
          if (changed) {
            void queryClient.invalidateQueries({ queryKey: ["erp"] });
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  return null;
}
