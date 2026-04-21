import { CATEGORIES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Category = {
  id: string;
  name: string;
  description?: string | null;
  slug?: string | null;
  branchId?: string | null;
  parentId?: string | null;
  createdAt?: string;
};

export async function getCategories(tenantSlug: string): Promise<Category[]> {
  return jsonFetch<Category[]>(CATEGORIES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createCategory(
  tenantSlug: string,
  input: {
    name: string;
    description?: string;
    slug?: string;
    /** Default true: shared across all branches. */
    global?: boolean;
    parentId?: string | null;
  },
) {
  return jsonFetch<Category>(CATEGORIES_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
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
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteCategory(tenantSlug: string, id: string) {
  return jsonFetch<{ deleted: boolean }>(`${CATEGORIES_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

