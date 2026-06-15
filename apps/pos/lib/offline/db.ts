import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CreateSaleInput } from "@repo/types";
import type { PosCatalogData } from "@/lib/pos-catalog-view";
import type { CashMovementType } from "@/lib/services/pos-cash-drawer";

export type CashMovementOutboxStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "conflict";

export type CashMovementOutboxRecord = {
  clientRef: string;
  tenantSlug: string;
  branchId: string;
  sessionId: string;
  movementType: CashMovementType;
  amount: number;
  reasonCode?: string;
  note?: string;
  createdAt: number;
  status: CashMovementOutboxStatus;
  lastError?: string;
  serverMovementId?: string;
};

export type OutboxSaleStatus =
  | "pending"
  | "pending_approval"
  | "syncing"
  | "synced"
  | "conflict";

export type OutboxSaleRecord = {
  clientSaleRef: string;
  idempotencyKey: string;
  tenantSlug: string;
  branchId: string;
  body: CreateSaleInput;
  localReceiptId: string;
  createdAt: number;
  status: OutboxSaleStatus;
  lastError?: string;
  serverReceiptNumber?: string;
  serverSaleId?: string;
  /** Supervisor approval required before sync (large offline discount). */
  discountApprovalId?: string;
};

export type CachedShift = {
  sessionId: string;
  status: "open" | "paused";
  openingCash: number;
  openedAt: string | null;
  cachedAt: number;
};

export type CachedCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  cachedAt: number;
};

interface PosOfflineDb extends DBSchema {
  outbox: {
    key: string;
    value: OutboxSaleRecord;
    indexes: { "by-status": OutboxSaleStatus };
  };
  catalog: {
    key: string;
    value: {
      key: string;
      tenantSlug: string;
      facet: string;
      data: PosCatalogData;
      cachedAt: number;
    };
  };
  shift: {
    key: string;
    value: CachedShift & { tenantSlug: string; branchId: string };
  };
  customers: {
    key: string;
    value: CachedCustomer;
  };
  cashMovements: {
    key: string;
    value: CashMovementOutboxRecord;
    indexes: { "by-status": CashMovementOutboxRecord["status"] };
  };
}

const DB_NAME = "qoondeeye-pos-offline";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<PosOfflineDb>> | null = null;

export function getOfflineDb() {
  if (!dbPromise) {
    dbPromise = openDB<PosOfflineDb>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const outbox = db.createObjectStore("outbox", {
            keyPath: "clientSaleRef",
          });
          outbox.createIndex("by-status", "status");
          db.createObjectStore("catalog", { keyPath: "key" });
          db.createObjectStore("shift", { keyPath: "tenantSlug" });
          db.createObjectStore("customers", { keyPath: "id" });
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains("cashMovements")) {
          const cashMovements = db.createObjectStore("cashMovements", {
            keyPath: "clientRef",
          });
          cashMovements.createIndex("by-status", "status");
        }
      },
    });
  }
  return dbPromise;
}
