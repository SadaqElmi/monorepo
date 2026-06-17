import type { CashMovementType } from "@/lib/services/pos-cash-drawer";
import {
  getOfflineDb,
  type CashMovementOutboxRecord,
} from "./db";

export type { CashMovementOutboxRecord, CashMovementOutboxStatus } from "./db";

export async function enqueueCashMovement(input: {
  clientRef: string;
  tenantSlug: string;
  branchId: string;
  sessionId: string;
  movementType: CashMovementType;
  amount: number;
  reasonCode?: string;
  note?: string;
}): Promise<CashMovementOutboxRecord> {
  const record: CashMovementOutboxRecord = {
    ...input,
    createdAt: Date.now(),
    status: "pending",
  };
  const db = await getOfflineDb();
  await db.put("cashMovements", record);
  return record;
}

export async function listPendingCashMovements() {
  const db = await getOfflineDb();
  const pending = await db.getAllFromIndex("cashMovements", "by-status", "pending");
  const conflict = await db.getAllFromIndex("cashMovements", "by-status", "conflict");
  return [...pending, ...conflict];
}

export async function countPendingCashMovements(): Promise<number> {
  const items = await listPendingCashMovements();
  return items.length;
}

export async function updateCashMovementOutbox(
  clientRef: string,
  patch: Partial<CashMovementOutboxRecord>,
) {
  const db = await getOfflineDb();
  const existing = await db.get("cashMovements", clientRef);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await db.put("cashMovements", next);
  return next;
}

export async function markCashMovementSynced(
  clientRef: string,
  serverMovementId: string,
) {
  return updateCashMovementOutbox(clientRef, {
    status: "synced",
    serverMovementId,
    lastError: undefined,
  });
}

export async function markCashMovementConflict(
  clientRef: string,
  message: string,
) {
  return updateCashMovementOutbox(clientRef, {
    status: "conflict",
    lastError: message,
  });
}
