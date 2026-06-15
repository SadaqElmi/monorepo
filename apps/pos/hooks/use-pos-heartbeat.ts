"use client";

import { useEffect } from "react";
import { sendPosHeartbeat } from "@/lib/services/pos-heartbeat";
import { useOfflineSync } from "./use-offline-sync";

export function usePosHeartbeat(tenantSlug: string | null | undefined) {
  const { pendingCount } = useOfflineSync(tenantSlug);

  useEffect(() => {
    if (!tenantSlug) return;
    void sendPosHeartbeat(pendingCount);
    const id = window.setInterval(() => {
      void sendPosHeartbeat(pendingCount);
    }, 60000);
    return () => window.clearInterval(id);
  }, [tenantSlug, pendingCount]);
}
