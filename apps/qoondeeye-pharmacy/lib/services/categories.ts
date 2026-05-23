import { buildPagedQuery, unwrapListResponse } from "@repo/utils";
import type { Category, PagedList } from "@repo/types";

import { CATEGORIES_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type { Category };

export async function getCategories(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Category[]> {
  const data = await jsonFetch<Category[] | PagedList<Category>>(CATEGORIES_PREFIX, {
    method: "GET",
    tenantSlug,
    signal: init?.signal,
  });
  return unwrapListResponse(data).items;
}

export async function getCategoriesPaged(
  tenantSlug: string,
  params: { page: number; limit?: number },
  init?: Pick<RequestInit, "signal">,
): Promise<PagedList<Category>> {
  const q = buildPagedQuery({
    page: params.page,
    limit: params.limit ?? 50,
  });
  const data = await jsonFetch<Category[] | PagedList<Category>>(
    `${CATEGORIES_PREFIX}${q}`,
    { method: "GET", tenantSlug, signal: init?.signal },
  );
  return unwrapListResponse(data, params.page, params.limit ?? 50);
}

export async function createCategory(
  tenantSlug: string,
  input: {
    name: string;
    description?: string;
    slug?: string;
    global?: boolean;
    parentId?: string | null;
  },
) {
  return jsonFetch<Category>(CATEGORIES_PREFIX, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateCategory(
  tenantSlug: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    slug?: string;
    parentId?: string | null;
  },
) {
  return jsonFetch<Category>(`${CATEGORIES_PREFIX}/${id}`, {
    method: "PATCH",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteCategory(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${CATEGORIES_PREFIX}/${id}`, {
    method: "DELETE",
    tenantSlug,
  });
}
