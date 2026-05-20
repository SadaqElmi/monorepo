"use client";

import { useQuery } from "@tanstack/react-query";

import { usePosBranchFacet } from "@/hooks/use-pos-branch-facet";
import { getBatches, getCategories, getProducts } from "@/lib/api";
import { posKeys, POS_STALE_CATALOG } from "@/lib/pos-query-keys";
import type { Batch } from "@/lib/api";
import type { Product } from "@repo/types";
import type { Category } from "@repo/types";

export type PosCatalogData = {
  prods: Product[];
  batchesData: Batch[];
  cats: Category[];
};

export async function fetchPosCatalog(
  tenantSlug: string,
  signal?: AbortSignal,
): Promise<PosCatalogData> {
  const [prods, batchesData, cats] = await Promise.all([
    getProducts(tenantSlug, { signal }),
    getBatches(tenantSlug, { signal }),
    getCategories(tenantSlug, { signal }),
  ]);
  return { prods, batchesData, cats };
}

export function usePosCatalog(
  tenantSlug: string | null,
  options?: {
    initialData?: PosCatalogData;
    enabled?: boolean;
  },
) {
  const branchFacet = usePosBranchFacet(tenantSlug);
  const enabled =
    options?.enabled !== false && Boolean(tenantSlug && branchFacet);

  return useQuery({
    queryKey: posKeys.catalog(tenantSlug ?? "", branchFacet),
    enabled,
    staleTime: POS_STALE_CATALOG,
    refetchOnWindowFocus: true,
    initialData: options?.initialData,
    queryFn: ({ signal }) => fetchPosCatalog(tenantSlug!, signal),
  });
}
