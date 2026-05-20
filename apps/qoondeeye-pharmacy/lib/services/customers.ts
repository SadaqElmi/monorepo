import { CUSTOMERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Customer = {
  id: string;
  name: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
};

export type CreateCustomerInput = {
  name?: string;
  phone?: string;
  address?: string;
};

export type UpdateCustomerInput = CreateCustomerInput;

export async function getCustomers(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Customer[]> {
  return jsonFetch<Customer[]>(CUSTOMERS_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}

export async function createCustomer(
  tenantSlug: string,
  input: CreateCustomerInput,
): Promise<Customer> {
  return jsonFetch<Customer>(CUSTOMERS_PREFIX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function updateCustomer(
  tenantSlug: string,
  id: string,
  input: UpdateCustomerInput,
): Promise<Customer | null> {
  return jsonFetch<Customer | null>(`${CUSTOMERS_PREFIX}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteCustomer(
  tenantSlug: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return jsonFetch<{ deleted: boolean }>(`${CUSTOMERS_PREFIX}/${id}`, {
    method: "DELETE",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

