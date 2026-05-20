"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LogIn, LogOut } from "lucide-react";

import {
  clearPosDeviceBinding,
  getOrCreatePosDeviceCode,
  getPosDeviceBinding,
  savePosDeviceBinding,
} from "@/lib/device-client";
import {
  clearAuthToken,
  getStoredUser,
  setAuthToken,
  type StoredUser,
} from "@/lib/auth-client";
import { enrollPosDevice } from "@/lib/services/auth";
import { POS_BRAND_COLOR } from "@/features/register/model/constants";

const POS_LOGIN_MODE = (
  process.env.NEXT_PUBLIC_POS_DEVICE_LOGIN_MODE ?? "dual"
).toLowerCase();

export function PosSessionGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<0 | 1 | 2>(0);

  const refresh = React.useCallback(() => {
    const u = getStoredUser();
    const isLoggedIn = u?.userType === "tenant" && u.tenantSlug;
    if (isLoggedIn) {
      setSession(2);
      return;
    }
    const binding = getPosDeviceBinding();
    if (POS_LOGIN_MODE === "device" && !binding) {
      setSession(0);
      return;
    }
    setSession(1);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (session === 0) return <PosEnrollGate onBound={refresh} />;
  if (session === 1) return <PosPinGate onRebind={refresh} />;
  return <>{children}</>;
}

function PosEnrollGate({ onBound }: { onBound: () => void }) {
  const [tenant, setTenant] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("posTenantSlug");
      const env = process.env.NEXT_PUBLIC_DEFAULT_TENANT;
      setTenant((saved ?? env ?? "").trim());
      const existing = getPosDeviceBinding();
      setDisplayName(existing?.displayName ?? "");
    } catch {
      // ignore
    }
  }, []);

  const submit = async () => {
    setError("");
    if (!tenant.trim() || !email.trim() || password.length < 6) {
      setError("Enter tenant code, manager email, and password.");
      return;
    }
    setLoading(true);
    try {
      const deviceCode = getOrCreatePosDeviceCode();
      const res = await enrollPosDevice({
        tenant: tenant.trim(),
        email: email.trim(),
        password,
        deviceCode,
        displayName: displayName.trim() || undefined,
      });
      savePosDeviceBinding(
        {
          deviceId: res.deviceId,
          deviceCode: res.deviceCode,
          tenantId: res.tenantId,
          tenantSlug: res.tenantSlug,
          branchId: res.branchId ?? null,
          status: res.status,
          displayName: res.displayName ?? null,
          enrolledByUserId: res.enrolledByUserId,
        },
        res.deviceCredential,
      );
      setPassword("");
      onBound();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Device enrollment failed");
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
            Bind POS device
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            One-time manager enrollment for this terminal.
          </p>
        </div>
        <div className="space-y-2">
          <Input
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            placeholder="Tenant code (e.g. pharmacy1)"
            autoComplete="off"
          />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Manager email"
            autoComplete="email"
            inputMode="email"
          />
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Manager password"
            type="password"
            autoComplete="current-password"
          />
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Device name (optional)"
            autoComplete="off"
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
          {loading ? "Binding..." : "Bind device"}
        </Button>
      </div>
    </div>
  );
}

function PosPinGate({
  onRebind,
}: {
  onRebind: () => void;
}) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

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
                clearPosDeviceBinding();
                onRebind();
              }}
            >
              <div className="flex flex-col items-center justify-center gap-3">
                <LogOut className="h-16 w-16 text-red-500" />
                <div className="text-base font-medium text-foreground">Logoff</div>
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

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/login" className="font-medium underline underline-offset-3">
            Manager sign in (email)
          </Link>
        </div>
      </div>
    </div>
  );
}

