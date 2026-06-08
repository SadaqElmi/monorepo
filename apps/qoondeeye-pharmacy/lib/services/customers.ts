import { CUSTOMERS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type {
  CustomerCreditSummary,
  CustomerLoanHistoryRow,
} from "@repo/types";

export type Customer = {
  id: string;
  name: string | null;
  phone?: string | null;
  address?: string | null;
  customer_no?: string | null;
  credit_limit?: number | null;
  credit_status?: string;
  is_active?: boolean;
  member_card_no?: string | null;
  created_at?: string;
};

export type CreateCustomerInput = {
  name?: string;
  phone?: string;
  address?: string;
  customerNo?: string;
  creditLimit?: number;
  creditStatus?: string;
  isActive?: boolean;
  memberCardNo?: string;
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

export async function searchCustomers(
  tenantSlug: string,
  q: string,
  limit = 25,
): Promise<Customer[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return jsonFetch<Customer[]>(`${CUSTOMERS_PREFIX}/search?${params}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getCustomer(
  tenantSlug: string,
  id: string,
): Promise<Customer | null> {
  return jsonFetch<Customer | null>(`${CUSTOMERS_PREFIX}/${id}`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function getCustomerCreditSummary(
  tenantSlug: string,
  customerId: string,
): Promise<CustomerCreditSummary> {
  return jsonFetch<CustomerCreditSummary>(
    `${CUSTOMERS_PREFIX}/${customerId}/credit-summary`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function getCustomerLoanHistory(
  tenantSlug: string,
  customerId: string,
): Promise<CustomerLoanHistoryRow[]> {
  return jsonFetch<CustomerLoanHistoryRow[]>(
    `${CUSTOMERS_PREFIX}/${customerId}/loan-history`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    },
  );
}

export async function createCustomerRepayment(
  tenantSlug: string,
  customerId: string,
  input: {
    branchId: string;
    amount: number;
    paymentDate: string;
    reference?: string;
    notes?: string;
    paymentMethod?: string;
    allocations?: Array<{ saleId: string; amount: number }>;
  },
) {
  return jsonFetch(`${CUSTOMERS_PREFIX}/${customerId}/repayments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
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
