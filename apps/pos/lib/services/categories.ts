import { CATEGORIES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type { Category } from "@repo/types";

export type { Category };

export async function getCategories(tenantSlug: string): Promise<Category[]> {
  return jsonFetch<Category[]>(CATEGORIES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}
