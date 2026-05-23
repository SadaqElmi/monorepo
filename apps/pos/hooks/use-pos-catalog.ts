"use client";

import { useQueries } from "@tanstack/react-query";

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
  const tenant = tenantSlug ?? "";

  const [productsQ, batchesQ, categoriesQ] = useQueries({
    queries: [
      {
        queryKey: posKeys.catalogProducts(tenant, branchFacet),
        enabled,
        staleTime: POS_STALE_CATALOG,
        refetchOnWindowFocus: false,
        initialData: options?.initialData?.prods,
        queryFn: ({ signal }) => getProducts(tenantSlug!, { signal }),
      },
      {
        queryKey: posKeys.catalogBatches(tenant, branchFacet),
        enabled,
        staleTime: POS_STALE_CATALOG,
        refetchOnWindowFocus: false,
        initialData: options?.initialData?.batchesData,
        queryFn: ({ signal }) => getBatches(tenantSlug!, { signal }),
      },
      {
        queryKey: posKeys.catalogCategories(tenant, branchFacet),
        enabled,
        staleTime: POS_STALE_CATALOG,
        refetchOnWindowFocus: false,
        initialData: options?.initialData?.cats,
        queryFn: ({ signal }) => getCategories(tenantSlug!, { signal }),
      },
    ],
  });

  const data: PosCatalogData | undefined =
    productsQ.data != null &&
    batchesQ.data != null &&
    categoriesQ.data != null
      ? {
          prods: productsQ.data,
          batchesData: batchesQ.data,
          cats: categoriesQ.data,
        }
      : options?.initialData;

  return {
    data,
    isPending:
      productsQ.isPending || batchesQ.isPending || categoriesQ.isPending,
    isFetching:
      productsQ.isFetching || batchesQ.isFetching || categoriesQ.isFetching,
    isError: productsQ.isError || batchesQ.isError || categoriesQ.isError,
    error: productsQ.error ?? batchesQ.error ?? categoriesQ.error,
    dataUpdatedAt: Math.max(
      productsQ.dataUpdatedAt,
      batchesQ.dataUpdatedAt,
      categoriesQ.dataUpdatedAt,
    ),
    refetch: () =>
      Promise.all([
        productsQ.refetch(),
        batchesQ.refetch(),
        categoriesQ.refetch(),
      ]),
  };
}
