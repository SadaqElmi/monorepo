import type { OfferList, ResolvedOffer } from "@repo/types";

import { OFFERS_PREFIX } from "./endpoints";
import { jsonFetch } from "./http";

export type { OfferList, ResolvedOffer };

function queryString(params: Record<string, string | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) qs.set(key, value);
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function getOffers(
  tenantSlug: string,
  params: { status?: string; priceGroupId?: string; search?: string } = {},
): Promise<OfferList[]> {
  return jsonFetch<OfferList[]>(
    `${OFFERS_PREFIX}${queryString(params)}`,
    { method: "GET", tenantSlug },
  );
}

export async function getOffer(
  tenantSlug: string,
  id: string,
): Promise<OfferList> {
  return jsonFetch<OfferList>(`${OFFERS_PREFIX}/${id}`, {
    method: "GET",
    tenantSlug,
  });
}

export async function createOffer(
  tenantSlug: string,
  input: Omit<Partial<OfferList>, "branchScope"> & {
    description: string;
    branchScope?: string[];
    rules?: Array<{
      productId?: string;
      categoryId?: string;
      minQuantity?: number;
      specialPrice?: number;
    }>;
  },
): Promise<OfferList> {
  return jsonFetch<OfferList>(OFFERS_PREFIX, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateOffer(
  tenantSlug: string,
  id: string,
  input: Partial<OfferList>,
): Promise<OfferList> {
  return jsonFetch<OfferList>(`${OFFERS_PREFIX}/${id}`, {
    method: "PATCH",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function setOfferEnabled(
  tenantSlug: string,
  id: string,
  enabled: boolean,
): Promise<OfferList> {
  return jsonFetch<OfferList>(
    `${OFFERS_PREFIX}/${id}/${enabled ? "enable" : "disable"}`,
    { method: "POST", tenantSlug },
  );
}

export async function resolveOffer(
  tenantSlug: string,
  input: {
    productId: string;
    uomId?: string;
    priceGroupId?: string;
    branchId?: string;
    quantity?: number;
    unitPrice?: number;
  },
): Promise<ResolvedOffer | null> {
  return jsonFetch<ResolvedOffer | null>(`${OFFERS_PREFIX}/resolve`, {
    method: "POST",
    tenantSlug,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
