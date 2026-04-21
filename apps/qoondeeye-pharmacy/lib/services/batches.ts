import { BATCHES_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type Batch = {
  id: string;
  product_id: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number | null;
  cost_price: number | null;
  selling_price: number | null;
  created_at?: string;
};

export async function getBatches(tenantSlug: string): Promise<Batch[]> {
  return jsonFetch<Batch[]>(BATCHES_PREFIX, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}
