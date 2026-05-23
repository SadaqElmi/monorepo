import type { QueryClient } from "@tanstack/react-query";
import { bumpCatalogCache } from "@repo/utils";

import { invalidateErpCatalogQueries } from "@/lib/invalidate-erp-catalog";

/** After product / category / batch catalog changes. */
export async function invalidateAfterCatalogMutation(
  queryClient: QueryClient,
): Promise<void> {
  await invalidateErpCatalogQueries(queryClient);
  await queryClient.invalidateQueries({ queryKey: ["erp", "categories"] });
  await queryClient.invalidateQueries({ queryKey: ["erp", "inventory"] });
}

/** After stock movements (sale, purchase, transfer, adjustment). */
export async function invalidateAfterStockMutation(
  queryClient: QueryClient,
): Promise<void> {
  await invalidateErpCatalogQueries(queryClient);
  await queryClient.invalidateQueries({ queryKey: ["erp", "inventory"] });
}

export async function invalidateAfterSalePosting(
  queryClient: QueryClient,
): Promise<void> {
  await invalidateAfterStockMutation(queryClient);
  await queryClient.invalidateQueries({ queryKey: ["erp", "returns"] });
}

export async function invalidateAfterPurchasePosting(
  queryClient: QueryClient,
): Promise<void> {
  await invalidateAfterStockMutation(queryClient);
}

export async function invalidateAfterTransferPosting(
  queryClient: QueryClient,
): Promise<void> {
  await invalidateAfterStockMutation(queryClient);
}

export async function invalidateAfterBranchOrRoleSettings(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["erp", "branches"] });
  await queryClient.invalidateQueries({ queryKey: ["erp", "roles"] });
  await queryClient.invalidateQueries({ queryKey: ["erp", "staff"] });
  bumpCatalogCache();
}
