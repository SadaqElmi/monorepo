"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { syncActiveBranchCookie } from "@/lib/branch-cookie";
import {
  setAuthToken,
  type StoredUser,
} from "@/lib/auth-client";
import { pinLogin } from "@/lib/services/auth";
import { pinLoginSchema, validateForSubmit } from "@/lib/validation";

import { brand } from "./pharmacy-pos-constants";

export function PosPinGate({ onSuccess }: { onSuccess: () => void }) {
  const [tenant, setTenant] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("posTenantSlug");
      const env = process.env.NEXT_PUBLIC_DEFAULT_TENANT;
      setTenant((saved ?? env ?? "").trim());
    } catch {
      /* ignore */
    }
  }, []);

  const append = (d: string) => {
    setPin((p) => (p.length >= 12 ? p : p + d));
    setError("");
  };

  const backspace = () => {
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  const submit = async () => {
    setError("");
    let branchId: string | undefined;
    try {
      const b = localStorage.getItem("branchId");
      if (b) branchId = b;
    } catch {
      /* ignore */
    }
    const validated = validateForSubmit(pinLoginSchema, {
      pin,
      tenant: tenant.trim(),
      ...(branchId ? { branchId } : {}),
    });
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    setLoading(true);
    try {
      const res = await pinLogin(
        validated.data.pin,
        validated.data.tenant,
        validated.data.branchId,
      );
      const user: StoredUser = {
        id: res.user.id,
        email: res.user.email ?? "",
        name: res.user.name,
        userType: "tenant",
        role: res.role,
        tenantId: res.tenantId ?? undefined,
        tenantSlug: res.tenantSlug ?? undefined,
        assignedBranchId: res.assignedBranchId,
        allowedBranchIds: res.allowedBranchIds,
      };
      setAuthToken(res.token, user);
      try {
        localStorage.setItem("posTenantSlug", validated.data.tenant);
        const initialBranchId = res.assignedBranchId ?? res.defaultBranchId;
        if (initialBranchId) {
          localStorage.setItem("branchId", initialBranchId);
          syncActiveBranchCookie(initialBranchId);
        }
      } catch {
        /* ignore */
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "↵"];

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-6"
      style={{
        ["--pos-brand" as string]: brand,
        background: `linear-gradient(160deg, ${brand}18 0%, #0f172a08 45%)`,
      }}
    >
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-[color:var(--pos-brand)]/20 bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-[color:var(--pos-brand)]">
            POS sign in
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Pharmacy code + PIN. Managers use the full login with email.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Pharmacy code (tenant)
          </label>
          <Input
            value={tenant}
            onChange={(e) => setTenant(e.target.value.trim())}
            placeholder="e.g. pharmacy1"
            className="h-11 rounded-xl font-mono text-sm"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <div className="flex h-12 items-center justify-center rounded-xl border-2 border-dashed border-[color:var(--pos-brand)]/30 bg-[color:var(--pos-brand)]/5 font-mono text-2xl tracking-[0.4em] text-foreground">
            {pin ? (
              "●".repeat(pin.length)
            ) : (
              <span className="text-muted-foreground">PIN</span>
            )}
          </div>
          {error ? (
            <p className="text-center text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <Button
              key={k}
              type="button"
              variant={k === "↵" ? "default" : "outline"}
              className="h-14 rounded-xl text-lg font-semibold"
              style={
                k === "↵"
                  ? { backgroundColor: brand, color: "#fff" }
                  : undefined
              }
              disabled={loading}
              onClick={() => {
                if (k === "C") backspace();
                else if (k === "↵") void submit();
                else append(k);
              }}
            >
              {k}
            </Button>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-[color:var(--pos-brand)] underline"
          >
            Manager sign in (email)
          </Link>
        </p>
      </div>
    </div>
  );
}
