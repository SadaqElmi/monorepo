import { SUPPLIERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Supplier = {
  id: string;
  name: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  created_at?: string;
};

export type CreateSupplierInput = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type UpdateSupplierInput = CreateSupplierInput;

export async function getSuppliers(tenantSlug: string): Promise<Supplier[]> {
  return jsonFetch<Supplier[]>(SUPPLIERS_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function createSupplier(
  tenantSlug: string,
  input: CreateSupplierInput,
): Promise<Supplier> {
  return jsonFetch<Supplier>(SUPPLIERS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateSupplier(
  tenantSlug: string,
  id: string,
  input: UpdateSupplierInput,
): Promise<Supplier | null> {
  return jsonFetch<Supplier | null>(`${SUPPLIERS_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteSupplier(
  tenantSlug: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return jsonFetch<{ deleted: boolean }>(`${SUPPLIERS_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

