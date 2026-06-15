"use client";

import * as React from "react";
import Link from "next/link";
import {
  CreditCard,
  Download,
  Printer,
  RefreshCw,
  Search,
  Server,
  Shield,
} from "lucide-react";
import type {
  DeviceListResponse,
  HealthResponse,
  UpdateCheckResponse,
} from "@repo/hardware-contract";
import { HardwareServiceClient } from "@repo/hardware-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOrCreatePosDeviceCode,
  getPosDeviceBinding,
} from "@/lib/device-client";
import { pairHardwareService } from "@/lib/hardware";
import { posToast } from "@/lib/pos-toast";
import { POS_BRAND_COLOR } from "@/features/register/model/constants";

type HealthState = HealthResponse | null;

export function HardwareDashboard() {
  const client = React.useMemo(() => new HardwareServiceClient(), []);
  const [loading, setLoading] = React.useState(false);
  const [health, setHealth] = React.useState<HealthState>(null);
  const [devices, setDevices] = React.useState<DeviceListResponse | null>(null);
  const [updateInfo, setUpdateInfo] = React.useState<UpdateCheckResponse | null>(
    null,
  );
  const [paymentProvider, setPaymentProvider] = React.useState("simulated");
  const [paymentSessionId, setPaymentSessionId] = React.useState<string | null>(
    null,
  );
  const [paymentStatus, setPaymentStatus] = React.useState("");
  const [printerHost, setPrinterHost] = React.useState("");
  const [printerPort, setPrinterPort] = React.useState("9100");
  const [windowsPrinterName, setWindowsPrinterName] = React.useState("");
  const [scalePort, setScalePort] = React.useState("");
  const [discoveredPrinters, setDiscoveredPrinters] = React.useState<
    Array<{ name: string; port?: string }>
  >([]);

  const refresh = React.useCallback(async () => {
    const h = await client.health();
    setHealth(h);
    if (h?.paired) {
      setDevices(await client.getDevices().catch(() => null));
    } else {
      setDevices(null);
    }
  }, [client]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!paymentSessionId) return;
    const timer = window.setInterval(async () => {
      const session = await client.getPaymentSession(paymentSessionId);
      if (!session) return;
      setPaymentStatus(`${session.status}${session.authCode ? ` · ${session.authCode}` : ""}`);
      if (session.status !== "pending") {
        window.clearInterval(timer);
      }
    }, 800);
    return () => window.clearInterval(timer);
  }, [client, paymentSessionId]);

  const pair = async () => {
    setLoading(true);
    try {
      const deviceCode =
        getPosDeviceBinding()?.deviceCode ?? getOrCreatePosDeviceCode();
      const result = await pairHardwareService(deviceCode);
      if (!result.ok) {
        posToast.error("Pairing failed", result.message);
        return;
      }
      posToast.success("Hardware service paired");
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const discover = async () => {
    setLoading(true);
    try {
      const result = await client.discoverDevices();
      if (!result) {
        posToast.error("Discovery failed", "Could not reach hardware service");
        return;
      }
      setDiscoveredPrinters(result.windowsPrinters ?? []);
      posToast.success(
        "Discovery complete",
        `${result.serialPorts.length} serial, ${result.windowsPrinters.length} printer(s)`,
      );
    } finally {
      setLoading(false);
    }
  };

  const checkUpdates = async () => {
    setLoading(true);
    try {
      const result = await client.checkForUpdates();
      setUpdateInfo(result);
      if (!result?.updateAvailable) {
        posToast.success("Up to date", `Running v${result?.currentVersion ?? "?"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const applyUpdate = async () => {
    if (!updateInfo?.manifest) return;
    setLoading(true);
    try {
      const result = await client.applyUpdate(updateInfo.manifest.version);
      if (result?.ok) {
        posToast.success("Update scheduled", result.message);
      } else {
        posToast.error("Update failed", result?.message ?? "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  };

  const savePaymentProvider = async () => {
    setLoading(true);
    try {
      const current = (await client.getConfig()) ?? {};
      await client.saveConfig({
        ...current,
        paymentTerminals: [
          {
            id: "terminal-default",
            providerId: paymentProvider as "simulated" | "local-eft",
            config:
              paymentProvider === "local-eft"
                ? { host: "127.0.0.1", port: 2000, declineRate: 0 }
                : {},
          },
        ],
      });
      posToast.success("Payment terminal saved", paymentProvider);
    } catch (e) {
      posToast.error("Config failed", e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const testPayment = async () => {
    setLoading(true);
    setPaymentStatus("starting…");
    try {
      const { sessionId } = await client.startPayment({
        amount: 1,
        currency: "USD",
        reference: "hardware-dashboard-test",
        providerId: paymentProvider,
      });
      setPaymentSessionId(sessionId);
      setPaymentStatus("pending");
    } catch (e) {
      setPaymentStatus("");
      posToast.error("Payment test failed", e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const saveNetworkPrinter = async () => {
    if (!printerHost.trim()) return;
    setLoading(true);
    try {
      const current = (await client.getConfig()) ?? {};
      await client.saveConfig({
        ...current,
        defaultPrinterId: "printer-network",
        printers: [
          {
            id: "printer-network",
            driverId: "network-escpos",
            vendor: "Generic",
            model: "Network ESC/POS",
            connection: {
              type: "network",
              host: printerHost.trim(),
              port: Number(printerPort) || 9100,
            },
            isDefault: true,
          },
        ],
        drawer: {
          connectedToPrinter: true,
          pulseMs: 60,
          pulsePin: 0,
          printerId: "printer-network",
        },
      });
      posToast.success("Network printer saved");
      await refresh();
    } catch (e) {
      posToast.error("Config failed", e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const saveWindowsPrinter = async () => {
    if (!windowsPrinterName.trim()) return;
    setLoading(true);
    try {
      const current = (await client.getConfig()) ?? {};
      await client.saveConfig({
        ...current,
        defaultPrinterId: "printer-windows",
        printers: [
          {
            id: "printer-windows",
            driverId: "windows-spooler",
            vendor: "Windows",
            model: windowsPrinterName.trim(),
            connection: {
              type: "windows-spooler",
              printerName: windowsPrinterName.trim(),
            },
            isDefault: true,
          },
        ],
        drawer: {
          connectedToPrinter: true,
          pulseMs: 60,
          pulsePin: 0,
          printerId: "printer-windows",
        },
      });
      posToast.success("Windows printer saved");
      await refresh();
    } catch (e) {
      posToast.error("Config failed", e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const saveScale = async () => {
    if (!scalePort.trim()) return;
    setLoading(true);
    try {
      const current = (await client.getConfig()) ?? {};
      await client.saveConfig({
        ...current,
        scales: [
          {
            id: "scale-default",
            driverId: "serial-scale",
            connection: { type: "serial", path: scalePort.trim(), baudRate: 9600 },
            protocol: "generic_ascii",
          },
        ],
      });
      posToast.success("Scale configuration saved");
    } catch (e) {
      posToast.error("Config failed", e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const versionWarning = client.checkVersionCompatibility(health);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hardware Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local Qoondeeye Hardware Service on 127.0.0.1:7755 — printers, drawer,
            scale, payment terminals, and updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/">Back to POS</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw className="mr-1 size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="size-4" style={{ color: POS_BRAND_COLOR }} />
            Service status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!health ? (
            <p className="text-sm text-destructive">
              Hardware service not running. Start with{" "}
              <code className="rounded bg-muted px-1">pnpm dev:hardware</code>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={health.status} tone={health.status} />
              <Badge variant="outline">v{health.version}</Badge>
              <Badge variant={health.paired ? "default" : "secondary"}>
                {health.paired ? "Paired" : "Pairing required"}
              </Badge>
              {health.secretsBackend ? (
                <Badge variant="outline" className="gap-1">
                  <Shield className="size-3" />
                  {health.secretsBackend === "keytar"
                    ? "Credential Manager"
                    : "File secrets"}
                </Badge>
              ) : null}
              {health.updateChannel ? (
                <Badge variant="outline">{health.updateChannel} channel</Badge>
              ) : null}
            </div>
          )}
          {versionWarning ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{versionWarning}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={loading || !health}
              style={{ backgroundColor: POS_BRAND_COLOR, color: "#fff" }}
              onClick={() => void pair()}
            >
              Pair with POS
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || !health?.paired}
              onClick={() => void discover()}
            >
              <Search className="mr-1 size-3" />
              Discover devices
            </Button>
          </div>
        </CardContent>
      </Card>

      {devices ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Printer className="size-4" />
              Connected devices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(devices.printers ?? []).map((p) => (
              <div key={p.id} className="flex justify-between rounded-lg border px-3 py-2">
                <span>
                  Printer · {p.vendor ?? p.driverId} ({p.connection})
                </span>
                <Badge variant={p.status === "ready" ? "default" : "secondary"}>
                  {p.status}
                </Badge>
              </div>
            ))}
            {(devices.scales ?? []).map((s) => (
              <div key={s.id} className="flex justify-between rounded-lg border px-3 py-2">
                <span>Scale · {s.driverId}</span>
                <Badge variant="outline">{s.status}</Badge>
              </div>
            ))}
            {(devices.displays ?? []).map((d) => (
              <div key={d.id} className="flex justify-between rounded-lg border px-3 py-2">
                <span>Display · {d.driverId}</span>
                <Badge variant="outline">{d.status}</Badge>
              </div>
            ))}
            {!devices.printers?.length &&
            !devices.scales?.length &&
            !devices.displays?.length ? (
              <p className="text-muted-foreground">No devices configured yet.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4" />
              Payment terminal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={paymentProvider} onValueChange={setPaymentProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simulated">Simulated (dev)</SelectItem>
                <SelectItem value="local-eft">Local EFT stub</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={loading || !health?.paired}
                onClick={() => void savePaymentProvider()}
              >
                Save provider
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || !health?.paired}
                onClick={() => void testPayment()}
              >
                Test $1.00 payment
              </Button>
            </div>
            {paymentStatus ? (
              <p className="text-xs text-muted-foreground">Payment: {paymentStatus}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="size-4" />
              Service updates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Checks signed MSI releases. Requires Windows service install.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || !health?.paired}
                onClick={() => void checkUpdates()}
              >
                Check for updates
              </Button>
              {updateInfo?.updateAvailable ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={loading}
                  onClick={() => void applyUpdate()}
                >
                  Apply v{updateInfo.latestVersion}
                </Button>
              ) : null}
            </div>
            {updateInfo ? (
              <p className="text-xs text-muted-foreground">
                Current v{updateInfo.currentVersion}
                {updateInfo.updateAvailable
                  ? ` · Update available: v${updateInfo.latestVersion}`
                  : " · Up to date"}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Printer &amp; scale setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {discoveredPrinters.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Discovered Windows printers
              </p>
              {discoveredPrinters.map((p) => (
                <Button
                  key={p.name}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-full justify-start text-xs"
                  onClick={() => setWindowsPrinterName(p.name)}
                >
                  {p.name}
                  {p.port ? ` (${p.port})` : ""}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={printerHost}
              onChange={(e) => setPrinterHost(e.target.value)}
              placeholder="Network printer IP"
            />
            <Input
              value={printerPort}
              onChange={(e) => setPrinterPort(e.target.value)}
              placeholder="Port (9100)"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full"
            disabled={loading || !printerHost.trim() || !health?.paired}
            onClick={() => void saveNetworkPrinter()}
          >
            Save network ESC/POS printer
          </Button>
          <Input
            value={windowsPrinterName}
            onChange={(e) => setWindowsPrinterName(e.target.value)}
            placeholder="Windows printer name (USB)"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full"
            disabled={loading || !windowsPrinterName.trim() || !health?.paired}
            onClick={() => void saveWindowsPrinter()}
          >
            Save Windows spooler printer
          </Button>
          <Input
            value={scalePort}
            onChange={(e) => setScalePort(e.target.value)}
            placeholder="Scale serial port (e.g. COM3)"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full"
            disabled={loading || !scalePort.trim() || !health?.paired}
            onClick={() => void saveScale()}
          >
            Save serial scale
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: HealthResponse["status"];
}) {
  const variant =
    tone === "healthy" ? "default" : tone === "degraded" ? "secondary" : "destructive";
  return <Badge variant={variant}>{label}</Badge>;
}
