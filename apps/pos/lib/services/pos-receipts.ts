import { POS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export async function reprintReceipt(tenantSlug: string, saleId: string) {
  return jsonFetch(`${POS_PREFIX}/receipts/${saleId}/reprint`, {
    method: "POST",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}

export async function emailReceipt(
  tenantSlug: string,
  saleId: string,
  email: string,
) {
  return jsonFetch(`${POS_PREFIX}/receipts/${saleId}/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify({ email }),
  });
}

export async function whatsappReceipt(
  tenantSlug: string,
  saleId: string,
  phone: string,
) {
  return jsonFetch(`${POS_PREFIX}/receipts/${saleId}/whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify({ phone }),
  });
}
