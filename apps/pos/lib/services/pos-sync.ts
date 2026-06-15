import type { CreateSaleInput } from "@repo/types";
import { POS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type BatchSyncItemResult = {
  clientSaleRef: string;
  status: "accepted" | "duplicate" | "conflict";
  saleId?: string;
  receiptNumber?: string | null;
  message?: string;
};

export type BatchSyncPayload = {
  sales: Array<{
    clientSaleRef: string;
    idempotencyKey?: string;
    sale: CreateSaleInput;
  }>;
};

export async function batchSyncSales(
  tenantSlug: string,
  payload: BatchSyncPayload,
): Promise<{ results: BatchSyncItemResult[] }> {
  return jsonFetch(`${POS_PREFIX}/sync/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(payload),
  });
}

export type BatchSyncCashItemResult = {
  clientRef: string;
  status: "accepted" | "duplicate" | "conflict";
  movementId?: string;
  message?: string;
};

export async function batchSyncCashMovements(
  tenantSlug: string,
  payload: {
    movements: Array<{
      clientRef: string;
      sessionId: string;
      movementType: string;
      amount: number;
      reasonCode?: string;
      note?: string;
    }>;
  },
): Promise<{ results: BatchSyncCashItemResult[] }> {
  return jsonFetch(`${POS_PREFIX}/sync/cash-movements/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(payload),
  });
}
