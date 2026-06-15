"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LogIn, LogOut, Settings2 } from "lucide-react";

import {
  clearPosDeviceBinding,
  getPosDeviceBinding,
  getPosDeviceCredential,
  getPosServerUrl,
  savePosDeviceBinding,
  savePosServerUrl,
} from "@/lib/device-client";
import {
  clearAuthToken,
  isPosStaffSessionActive,
} from "@/lib/auth-client";
import { setupPosTerminal } from "@/lib/services/auth";
import { formatApiErrorForUser } from "@/lib/services/http";
import { POS_BRAND_COLOR } from "@/features/register/model/constants";

const DEFAULT_SERVER_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_URL_LOCAL ??
  "https://api.qoondeeye.online";

export function PosSessionGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<0 | 1 | 2>(0);

  const refresh = React.useCallback(() => {
    const credential = getPosDeviceCredential();
    if (!credential) {
      setSession(0);
      return;
    }

    if (isPosStaffSessionActive()) {
      setSession(2);
      return;
    }

    setSession(1);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (session === 0) return <PosTerminalSetup onBound={refresh} />;
  if (session === 1) return <PosPinGate onRebind={refresh} />;
  return <>{children}</>;
}

export function PosTerminalSetup({ onBound }: { onBound: () => void }) {
  const [serverUrl, setServerUrl] = React.useState(DEFAULT_SERVER_URL);
  const [tenantCode, setTenantCode] = React.useState("");
  const [terminalUsername, setTerminalUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    try {
      setServerUrl(getPosServerUrl() || DEFAULT_SERVER_URL);
      const existing = getPosDeviceBinding();
      if (existing?.tenantSlug) {
        setTenantCode(existing.tenantSlug);
      }
    } catch {
      // ignore
    }
  }, []);

  const submit = async () => {
    setError("");
    if (
      !serverUrl.trim() ||
      !tenantCode.trim() ||
      !terminalUsername.trim() ||
      password.length < 6
    ) {
      setError(
        "Enter server URL, tenant code, terminal username, and password.",
      );
      return;
    }
    setLoading(true);
    try {
      savePosServerUrl(serverUrl);
      if (!tenantCode.trim()) {
        setError("Tenant code is required (e.g. hayat or aman).");
        return;
      }
      const res = await setupPosTerminal({
        serverUrl: serverUrl.trim(),
        terminalUsername: terminalUsername.trim(),
        password,
        tenantCode: tenantCode.trim(),
      });
      savePosDeviceBinding(
        {
          deviceId: res.deviceId,
          terminalId: res.terminalId,
          deviceCode: res.terminalId,
          tenantId: res.tenantId,
          tenantSlug: res.tenantSlug,
          branchId: res.branchId ?? null,
          status: res.status,
          displayName: res.displayName ?? null,
        },
        res.deviceCredential,
      );
      setPassword("");
      onBound();
    } catch (e) {
      setError(formatApiErrorForUser(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-6"
      style={{
        ["--pos-brand" as string]: POS_BRAND_COLOR,
        background: `linear-gradient(160deg, ${POS_BRAND_COLOR}18 0%, #0f172a08 45%)`,
      }}
    >
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-6 shadow-xl ring-0 dark:bg-slate-900">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-(--pos-brand)">
            POS terminal setup
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            One-time activation with the terminal credentials from your manager.
          </p>
        </div>
        <div className="space-y-2">
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="Server URL"
            autoComplete="off"
          />
          <Input
            value={tenantCode}
            onChange={(e) => setTenantCode(e.target.value)}
            placeholder="Tenant code (e.g. hayat)"
            autoComplete="off"
          />
          <Input
            value={terminalUsername}
            onChange={(e) => setTerminalUsername(e.target.value)}
            placeholder="Terminal username (e.g. hayatpos01)"
            autoComplete="off"
          />
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Terminal password"
            type="password"
            autoComplete="current-password"
          />
        </div>
        {error ? (
          <p className="text-center text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full"
          style={{ backgroundColor: POS_BRAND_COLOR, color: "#fff" }}
          disabled={loading}
          onClick={() => void submit()}
        >
          {loading ? "Activating..." : "Activate terminal"}
        </Button>
      </div>
    </div>
  );
}

function PosPinGate({ onRebind }: { onRebind: () => void }) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const reconfigureTerminal = () => {
    clearAuthToken();
    clearPosDeviceBinding();
    onRebind();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-start-2 row-start-1 aspect-square rounded-md border bg-sky-200 py-0 shadow-sm">
            <Button
              asChild
              type="button"
              variant="ghost"
              className="h-full w-full rounded-md text-2xl font-bold tracking-tight text-slate-900"
            >
              <Link href="/staff-login">Tender Operation</Link>
            </Button>
          </Card>

          <Card className="col-start-1 row-start-2 aspect-square rounded-md border bg-white py-0 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              className="h-full w-full rounded-md"
              onClick={() => {
                clearAuthToken();
                onRebind();
              }}
            >
              <div className="flex flex-col items-center justify-center gap-3">
                <LogOut className="h-16 w-16 text-red-500" />
                <div className="text-base font-medium text-foreground">
                  Logoff
                </div>
              </div>
            </Button>
          </Card>

          <Card className="col-start-2 row-start-2 aspect-square rounded-md border bg-emerald-400 py-0 shadow-sm">
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
              <div className="text-lg font-semibold text-slate-900">
                {now.toLocaleDateString("en-US", {
                  month: "long",
                  day: "2-digit",
                  year: "numeric",
                })}
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {now.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </div>
          </Card>

          <Card className="col-start-3 row-start-2 aspect-square rounded-md border bg-white py-0 shadow-sm">
            <Button
              asChild
              type="button"
              variant="ghost"
              className="h-full w-full rounded-md"
            >
              <Link
                href="/staff-login"
                className="flex h-full w-full flex-col items-center justify-center gap-3"
              >
                <LogIn className="h-16 w-16 text-emerald-500" />
                <span className="text-base font-medium text-foreground">
                  Logon
                </span>
              </Link>
            </Button>
          </Card>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 text-center">
          <Button
            asChild
            type="button"
            variant="link"
            className="text-xs font-medium"
            style={{ color: POS_BRAND_COLOR }}
          >
            <Link href="/setup">
              <Settings2 className="mr-1 inline h-3.5 w-3.5" />
              Terminal setup (server URL)
            </Link>
          </Button>
          <Button
            type="button"
            variant="link"
            className="text-xs text-muted-foreground"
            onClick={reconfigureTerminal}
          >
            Clear binding &amp; start over
          </Button>
        </div>
      </div>
    </div>
  );
}
