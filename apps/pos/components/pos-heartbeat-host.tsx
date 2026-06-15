"use client";

import { usePos } from "@/components/pos-context";
import { usePosHeartbeat } from "@/hooks/use-pos-heartbeat";

export function PosHeartbeatHost() {
  const { currentUser } = usePos();
  usePosHeartbeat(currentUser?.tenantSlug);
  return null;
}
