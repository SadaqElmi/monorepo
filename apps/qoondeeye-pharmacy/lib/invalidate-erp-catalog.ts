import type { QueryClient } from "@tanstack/react-query";
import { bumpCatalogCache } from "@repo/utils";

/** Refetch product lists used by inventory and POS after catalog CRUD. */
export async function invalidateErpCatalogQueries(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["erp", "products-catalog"] }),
    queryClient.invalidateQueries({ queryKey: ["erp", "products"] }),
    queryClient.invalidateQueries({ queryKey: ["erp", "batches"] }),
  ]);
  bumpCatalogCache();
}
