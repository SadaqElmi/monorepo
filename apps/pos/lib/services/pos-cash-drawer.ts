import { POS_PREFIX } from "./endpoints";
import { type JsonHeaders, jsonFetch } from "./http";

export type CashMovementType =
  | "cash_in"
  | "cash_out"
  | "safe_drop"
  | "petty_cash"
  | "replenishment";

export async function createCashMovement(
  tenantSlug: string,
  sessionId: string,
  input: {
    movementType: CashMovementType;
    amount: number;
    reasonCode?: string;
    note?: string;
    clientRef?: string;
  },
) {
  return jsonFetch(`${POS_PREFIX}/sessions/${sessionId}/cash-movements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": tenantSlug,
    } as JsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function getDrawerBalance(tenantSlug: string, sessionId: string) {
  return jsonFetch<{
    drawerBalance: number;
    openingCash: number;
    cashSalesTotal: number;
    movementsNet: number;
  }>(`${POS_PREFIX}/sessions/${sessionId}/drawer-balance`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug } as JsonHeaders,
  });
}
