"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";

import { ConfigurationModuleShell } from "@/components/configuration/configuration-module-shell";
import { ConfigurationErrorBanner } from "@/components/configuration/configuration-status-banner";
import { PosOpsQuickLinks } from "@/components/pos/pos-ops-quick-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoredUser } from "@/lib/auth-client";
import { POS_PREFIX } from "@/lib/services/endpoints";
import { jsonFetch } from "@/lib/services/http";

async function getSecurityEvents(tenantSlug: string) {
  return jsonFetch<
    Array<{
      id: string;
      eventType: string;
      severity: string;
      createdAt: string;
      payload: unknown;
    }>
  >(`${POS_PREFIX}/security/events?limit=50`, {
    method: "GET",
    headers: { "X-Tenant": tenantSlug },
  });
}

async function runAnomalyScan(tenantSlug: string) {
  return jsonFetch<Array<{ type: string; message: string }>>(
    `${POS_PREFIX}/security/anomalies`,
    {
      method: "GET",
      headers: { "X-Tenant": tenantSlug, "x-branch-id": "all" },
    },
  );
}

function severityVariant(
  severity: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "high") return "destructive";
  if (severity === "medium") return "default";
  return "secondary";
}

export function PosSecurityClient() {
  const tenantSlug = getStoredUser()?.tenantSlug ?? "";
  const qc = useQueryClient();

  const events = useQuery({
    queryKey: ["erp", "pos-security", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: () => getSecurityEvents(tenantSlug),
  });

  const scanMutation = useMutation({
    mutationFn: () => runAnomalyScan(tenantSlug),
    onSuccess: (found) => {
      void qc.invalidateQueries({ queryKey: ["erp", "pos-security"] });
      if (found.length === 0) {
        toast.success("No anomalies detected in the last hour");
      } else {
        toast.warning(`${found.length} anomaly signal(s) recorded`);
      }
    },
    onError: (e: Error) => {
      toast.error("Scan failed", { description: e.message });
    },
  });

  const error =
    events.error instanceof Error ? events.error.message : null;

  return (
    <ConfigurationModuleShell
      title="POS Security"
      description="Failed PIN attempts, refund velocity, and security anomalies."
      stat={{
        icon: Shield,
        value: `${events.data?.length ?? 0} recent events`,
      }}
      headerEnd={
        <Button
          variant="outline"
          size="sm"
          disabled={scanMutation.isPending}
          onClick={() => scanMutation.mutate()}
        >
          Run anomaly scan
        </Button>
      }
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PosOpsQuickLinks />

        {error ? <ConfigurationErrorBanner message={error} /> : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.isPending ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {(events.data ?? []).map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{e.eventType}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant={severityVariant(e.severity)}>
                      {e.severity}
                    </Badge>
                  </div>
                ))}
                {!events.data?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No security events recorded yet.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ConfigurationModuleShell>
  );
}
