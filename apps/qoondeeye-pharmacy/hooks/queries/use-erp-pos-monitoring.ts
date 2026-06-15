"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";
import {
  getPosMonitoringEvents,
  getPosMonitoringOverview,
} from "@/lib/services/pos-monitoring";

export function useErpPosMonitoringOverview() {
  const tenantSlug = getResolvedStoredUser()?.tenantSlug ?? "";
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["erp", "pos-monitoring", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: ERP_STALE_LIST,
    refetchInterval: 30000,
    queryFn: () => getPosMonitoringOverview(tenantSlug!),
  });

  useEffect(() => {
    if (!tenantSlug || typeof window === "undefined") return;
    const url = `/api/pos/monitoring/stream`;
    let source: EventSource | null = null;
    try {
      source = new EventSource(url);
      source.onmessage = () => {
        void queryClient.invalidateQueries({
          queryKey: ["erp", "pos-monitoring", tenantSlug],
        });
        void queryClient.invalidateQueries({
          queryKey: ["erp", "pos-monitoring-events", tenantSlug],
        });
      };
    } catch {
      /* polling fallback */
    }
    return () => source?.close();
  }, [tenantSlug, queryClient]);

  return query;
}

export function useErpPosMonitoringEvents(limit = 50) {
  const tenantSlug = getResolvedStoredUser()?.tenantSlug ?? "";
  return useQuery({
    queryKey: ["erp", "pos-monitoring-events", tenantSlug, limit],
    enabled: Boolean(tenantSlug),
    staleTime: ERP_STALE_LIST,
    queryFn: () => getPosMonitoringEvents(tenantSlug!, limit),
  });
}
