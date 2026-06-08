import { API_BASE } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type {
  CustomerCreditSummary,
  CustomerLoanHistoryRow,
  CustomerSummary,
} from "@repo/types";

const CUSTOMERS_PREFIX = `${API_BASE}/api/customers`;

export async function getCustomers(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<CustomerSummary[]> {
  return jsonFetch<CustomerSummary[]>(CUSTOMERS_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}

export async function searchCustomers(
  tenantSlug: string,
  q: string,
  limit = 25,
  init?: Pick<RequestInit, "signal">,
): Promise<CustomerSummary[]> {
  const params = new URLSearchParams({
    q: q.trim(),
    limit: String(limit),
  });
  return jsonFetch<CustomerSummary[]>(
    `${CUSTOMERS_PREFIX}/search?${params}`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export async function getCustomerCreditSummary(
  tenantSlug: string,
  customerId: string,
  init?: Pick<RequestInit, "signal">,
): Promise<CustomerCreditSummary> {
  return jsonFetch<CustomerCreditSummary>(
    `${CUSTOMERS_PREFIX}/${customerId}/credit-summary`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}

export async function getCustomerLoanHistory(
  tenantSlug: string,
  customerId: string,
  init?: Pick<RequestInit, "signal">,
): Promise<CustomerLoanHistoryRow[]> {
  return jsonFetch<CustomerLoanHistoryRow[]>(
    `${CUSTOMERS_PREFIX}/${customerId}/loan-history`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug } as JsonHeaders,
      signal: init?.signal,
    },
  );
}
