import { BATCHES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";
import type { Batch } from "@repo/types";

export type { Batch };

export async function getBatches(
  tenantSlug: string,
  init?: Pick<RequestInit, "signal">,
): Promise<Batch[]> {
  return jsonFetch<Batch[]>(BATCHES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
    signal: init?.signal,
  });
}
