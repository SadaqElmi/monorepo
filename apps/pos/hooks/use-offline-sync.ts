"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatApiErrorForUser } from "@repo/utils";
import {
  countPendingApprovalOutbox,
  countPendingOutbox,
  listPendingOutbox,
  markOutboxConflict,
  markOutboxSynced,
  updateOutboxRecord,
} from "@/lib/offline/outbox";
import {
  countPendingCashMovements,
  listPendingCashMovements,
  markCashMovementConflict,
  markCashMovementSynced,
  updateCashMovementOutbox,
} from "@/lib/offline/cash-movement-outbox";
import { batchSyncCashMovements, batchSyncSales } from "@/lib/services/pos-sync";
import { useNetworkStatus } from "./use-network-status";

const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60000;

export function useOfflineSync(tenantSlug: string | null | undefined) {
  const { isOffline, markApiReachable, markApiUnreachable } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [pendingCashCount, setPendingCashCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const backoffRef = useRef(BASE_BACKOFF_MS);

  const refreshPendingCount = useCallback(async () => {
    const [n, approval, cash] = await Promise.all([
      countPendingOutbox(),
      countPendingApprovalOutbox(),
      countPendingCashMovements(),
    ]);
    setPendingCount(n);
    setPendingApprovalCount(approval);
    setPendingCashCount(cash);
    return n;
  }, []);

  const syncNow = useCallback(async () => {
    const slug = tenantSlug?.trim();
    if (!slug || isOffline) return { synced: 0, failed: 0 };

    const pending = await listPendingOutbox();
    const pendingCash = await listPendingCashMovements();
    if (pending.length === 0 && pendingCash.length === 0) {
      await refreshPendingCount();
      return { synced: 0, failed: 0 };
    }

    setSyncing(true);
    let synced = 0;
    let failed = 0;

    try {
      if (pending.length > 0) {
        const batch = pending.slice(0, 50);
        for (const item of batch) {
          await updateOutboxRecord(item.clientSaleRef, { status: "syncing" });
        }

        const result = await batchSyncSales(slug, {
          sales: batch.map((item) => ({
            clientSaleRef: item.clientSaleRef,
            idempotencyKey: item.idempotencyKey,
            sale: { ...item.body, syncSource: "offline" },
          })),
        });

        const resultMap = new Map(
          result.results.map((r) => [r.clientSaleRef, r]),
        );

        for (const item of batch) {
          const r = resultMap.get(item.clientSaleRef);
          if (!r) {
            await markOutboxConflict(item.clientSaleRef, "No sync response");
            failed++;
            continue;
          }
          if (r.status === "accepted" || r.status === "duplicate") {
            await markOutboxSynced(
              item.clientSaleRef,
              r.saleId ?? "",
              r.receiptNumber ?? item.localReceiptId,
            );
            synced++;
          } else {
            await markOutboxConflict(
              item.clientSaleRef,
              r.message ?? "Sync conflict",
            );
            failed++;
          }
        }
      }

      if (pendingCash.length > 0) {
        const cashBatch = pendingCash.slice(0, 50);
        for (const item of cashBatch) {
          await updateCashMovementOutbox(item.clientRef, { status: "syncing" });
        }

        const cashResult = await batchSyncCashMovements(slug, {
          movements: cashBatch.map((item) => ({
            clientRef: item.clientRef,
            sessionId: item.sessionId,
            movementType: item.movementType,
            amount: item.amount,
            reasonCode: item.reasonCode,
            note: item.note,
          })),
        });

        const cashMap = new Map(
          cashResult.results.map((r) => [r.clientRef, r]),
        );

        for (const item of cashBatch) {
          const r = cashMap.get(item.clientRef);
          if (!r) {
            await markCashMovementConflict(item.clientRef, "No sync response");
            failed++;
            continue;
          }
          if (r.status === "accepted" || r.status === "duplicate") {
            await markCashMovementSynced(item.clientRef, r.movementId ?? "");
            synced++;
          } else {
            await markCashMovementConflict(
              item.clientRef,
              r.message ?? "Sync conflict",
            );
            failed++;
          }
        }
      }

      markApiReachable();
      backoffRef.current = BASE_BACKOFF_MS;
      setLastSyncAt(Date.now());
    } catch (e) {
      markApiUnreachable();
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      for (const item of pending.slice(0, 50)) {
        await updateOutboxRecord(item.clientSaleRef, {
          status: "pending",
          lastError: formatApiErrorForUser(e),
        });
      }
      for (const item of pendingCash.slice(0, 50)) {
        await updateCashMovementOutbox(item.clientRef, {
          status: "pending",
          lastError: formatApiErrorForUser(e),
        });
      }
      failed = pending.length + pendingCash.length;
    } finally {
      setSyncing(false);
      await refreshPendingCount();
    }

    return { synced, failed };
  }, [
    tenantSlug,
    isOffline,
    markApiReachable,
    markApiUnreachable,
    refreshPendingCount,
  ]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (isOffline || !tenantSlug) return;
    const id = window.setInterval(() => {
      void syncNow();
    }, 30000);
    return () => window.clearInterval(id);
  }, [isOffline, tenantSlug, syncNow]);

  useEffect(() => {
    if (!isOffline && tenantSlug) {
      const id = window.setTimeout(() => void syncNow(), 500);
      return () => window.clearTimeout(id);
    }
  }, [isOffline, tenantSlug, syncNow]);

  return {
    pendingCount,
    pendingApprovalCount,
    pendingCashCount,
    syncing,
    lastSyncAt,
    syncNow,
    refreshPendingCount,
    isOffline,
  };
}
