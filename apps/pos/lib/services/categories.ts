import { unwrapListResponse } from "@repo/utils";
import type { Category, PagedList } from "@repo/types";

import { CATEGORIES_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type { Category };

export async function getCategories(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Category[]> {
  const data = await jsonFetch<Category[] | PagedList<Category>>(
    CATEGORIES_PREFIX,
    { method: "GET", tenantSlug, signal: init?.signal },
  );
  return unwrapListResponse(data).items;
}
