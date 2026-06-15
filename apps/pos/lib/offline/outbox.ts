import type { CreateSaleInput } from "@repo/types";
import {
  getOfflineDb,
  type OutboxSaleRecord,
  type OutboxSaleStatus,
} from "./db";

export function newOfflineReceiptId(): string {
  const n = Math.floor(Math.random() * 90000) + 10000;
  return `OFF-${n}`;
}

export async function enqueueOutboxSale(input: {
  clientSaleRef: string;
  idempotencyKey: string;
  tenantSlug: string;
  branchId: string;
  body: CreateSaleInput;
  localReceiptId: string;
  status?: OutboxSaleStatus;
  discountApprovalId?: string;
}): Promise<OutboxSaleRecord> {
  const record: OutboxSaleRecord = {
    ...input,
    createdAt: Date.now(),
    status: input.status ?? "pending",
    discountApprovalId: input.discountApprovalId,
  };
  const db = await getOfflineDb();
  await db.put("outbox", record);
  return record;
}

export async function listOutboxByStatus(status: OutboxSaleStatus) {
  const db = await getOfflineDb();
  return db.getAllFromIndex("outbox", "by-status", status);
}

export async function listPendingOutbox() {
  const pending = await listOutboxByStatus("pending");
  const conflict = await listOutboxByStatus("conflict");
  return [...pending, ...conflict];
}

export async function listPendingApprovalOutbox() {
  return listOutboxByStatus("pending_approval");
}

export async function countPendingOutbox(): Promise<number> {
  const items = await listPendingOutbox();
  const awaitingApproval = await listPendingApprovalOutbox();
  return items.length + awaitingApproval.length;
}

export async function countPendingApprovalOutbox(): Promise<number> {
  const items = await listPendingApprovalOutbox();
  return items.length;
}

export async function updateOutboxRecord(
  clientSaleRef: string,
  patch: Partial<OutboxSaleRecord>,
) {
  const db = await getOfflineDb();
  const existing = await db.get("outbox", clientSaleRef);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await db.put("outbox", next);
  return next;
}

export async function promoteOutboxWithApproval(
  clientSaleRef: string,
  approvalId: string,
) {
  const db = await getOfflineDb();
  const existing = await db.get("outbox", clientSaleRef);
  if (!existing || existing.status !== "pending_approval") return null;
  const next: OutboxSaleRecord = {
    ...existing,
    status: "pending",
    discountApprovalId: approvalId,
    body: {
      ...existing.body,
      discountApprovalId: approvalId,
    },
    lastError: undefined,
  };
  await db.put("outbox", next);
  return next;
}

export async function markOutboxSynced(
  clientSaleRef: string,
  serverSaleId: string,
  serverReceiptNumber: string,
) {
  return updateOutboxRecord(clientSaleRef, {
    status: "synced",
    serverSaleId,
    serverReceiptNumber,
    lastError: undefined,
  });
}

export async function markOutboxConflict(
  clientSaleRef: string,
  message: string,
) {
  return updateOutboxRecord(clientSaleRef, {
    status: "conflict",
    lastError: message,
  });
}
