"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Keyboard } from "lucide-react";

import { setAuthToken, type StoredUser } from "@/lib/auth-client";
import { usePos } from "@/components/pos-context";
import { getPosDeviceCredential } from "@/lib/device-client";
import { staffLogin, pinLogin } from "@/lib/services/auth";
import {
  pinLoginSchema,
  staffLoginSchema,
  validateForSubmit,
} from "@/lib/validation";
import { prefetchPosRegisterData } from "@/lib/prefetch-register-data";

const POS_LOGIN_MODE = (
  process.env.NEXT_PUBLIC_POS_DEVICE_LOGIN_MODE ?? "dual"
).toLowerCase();

export function StaffLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setManagerPrivilegesSuspended } = usePos();

  const [staffId, setStaffId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [activeField, setActiveField] = React.useState<"staffId" | "password">(
    "password",
  );

  React.useEffect(() => {
    try {
      setStaffId((localStorage.getItem("posLastStaffId") ?? "").trim());
    } catch {
      /* ignore */
    }
  }, []);

  const append = (d: string) => {
    setError("");
    if (activeField === "staffId") {
      setStaffId((v) => (v.length >= 24 ? v : v + d));
      return;
    }
    setPin((p) => (p.length >= 12 ? p : p + d));
  };

  const backspace = () => {
    setError("");
    if (activeField === "staffId") {
      setStaffId((v) => v.slice(0, -1));
      return;
    }
    setPin((p) => p.slice(0, -1));
  };

  const submit = async () => {
    setError("");
    const id = staffId.trim();
    setLoading(true);
    try {
      let branchId: string | undefined;
      try {
        const b = localStorage.getItem("branchId");
        if (b) branchId = b;
      } catch {
        /* ignore */
      }

      const deviceCredential = getPosDeviceCredential();
      if (!deviceCredential && POS_LOGIN_MODE === "device") {
        setError("Device is not enrolled. Rebind this POS terminal.");
        return;
      }

      const fallbackTenant = (
        localStorage.getItem("posTenantSlug") ??
        process.env.NEXT_PUBLIC_DEFAULT_TENANT ??
        ""
      ).trim();
      if (!deviceCredential && !fallbackTenant) {
        setError("Device is not enrolled. Rebind this POS terminal.");
        return;
      }

      let res: Awaited<ReturnType<typeof staffLogin>>;
      if (deviceCredential && POS_LOGIN_MODE !== "legacy") {
        const validated = validateForSubmit(staffLoginSchema, {
          staffId: id,
          pin,
          deviceCredential,
          ...(branchId ? { branchId } : {}),
        });
        if (!validated.ok) {
          setError(validated.message);
          return;
        }
        res = await staffLogin(
          validated.data.staffId,
          validated.data.pin,
          validated.data.deviceCredential,
          validated.data.branchId,
        );
      } else {
        const validated = validateForSubmit(pinLoginSchema, {
          pin,
          tenant: fallbackTenant,
          ...(branchId ? { branchId } : {}),
          ...(id ? { staffId: id } : {}),
        });
        if (!validated.ok) {
          setError(validated.message);
          return;
        }
        res = await pinLogin(
          validated.data.pin,
          validated.data.tenant,
          validated.data.branchId,
          validated.data.staffId,
        );
      }

      const user: StoredUser = {
        id: res.user.id,
        email: res.user.email ?? "",
        name: res.user.name,
        ...(id.trim() ? { staffId: id.trim() } : {}),
        userType: "tenant",
        role: res.role,
        tenantId: res.tenantId ?? undefined,
        tenantSlug: res.tenantSlug ?? undefined,
        assignedBranchId: res.assignedBranchId,
        allowedBranchIds: res.allowedBranchIds,
      };

      setAuthToken(res.token, user);
      setManagerPrivilegesSuspended(false);
      try {
        localStorage.setItem("posLastStaffId", id);
        if (res.tenantSlug)
          localStorage.setItem("posTenantSlug", res.tenantSlug);
        const initialBranchId = res.assignedBranchId ?? res.defaultBranchId;
        if (initialBranchId) {
          localStorage.setItem("branchId", initialBranchId);
        }
      } catch {
        /* ignore */
      }

      const slug = res.tenantSlug?.trim();
      if (slug) {
        prefetchPosRegisterData(queryClient, slug);
      }

      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const keypad: Array<{ label: string; value: string; className?: string }> = [
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "4", value: "4" },
    { label: "5", value: "5" },
    { label: "6", value: "6" },
    { label: "7", value: "7" },
    { label: "8", value: "8" },
    { label: "9", value: "9" },
    { label: "0", value: "0", className: "col-span-2" },
    { label: "00", value: "00" },
    { label: ".", value: "." },
    { label: ",", value: "," },
    { label: "-", value: "-" },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-4xl gap-4 rounded-md py-0">
        <div className="space-y-4 px-6 pt-6 mb-10">
          <div className="flex items-center gap-3">
            <Label
              htmlFor="pos-staff-id"
              className="w-28 shrink-0 text-sm font-bold text-slate-900"
            >
              Staff ID:
            </Label>
            <div className="relative flex-1">
              <Input
                id="pos-staff-id"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder="Staff ID"
                className="h-11 rounded-md bg-sky-50 pr-10 font-sans"
                autoComplete="off"
                onFocus={() => setActiveField("staffId")}
              />
              <Keyboard className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Label
              htmlFor="pos-password"
              className="w-28 shrink-0 text-sm font-bold text-slate-900"
            >
              Password:
            </Label>
            <div className="relative flex-1">
              <Input
                id="pos-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Password"
                type="password"
                className="h-11 rounded-md bg-sky-50 pr-10 font-sans"
                autoComplete="current-password"
                onFocus={() => setActiveField("password")}
              />
              <Keyboard className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
          </div>

          {error ? (
            <p className="text-center text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-px border-t bg-slate-700 mt-10 p-4">
          {keypad.map((k) => (
            <Button
              key={k.label}
              type="button"
              variant="secondary"
              className={[
                "h-22 rounded-none bg-sky-100 font-mono text-lg font-semibold text-slate-900",
                "hover:opacity-90 active:scale-[0.99]",
                k.className ?? "",
              ].join(" ")}
              disabled={loading}
              onClick={() => {
                if (k.value === "backspace") backspace();
                else append(k.value);
              }}
            >
              {k.label}
            </Button>
          ))}

          <div className="col-start-4 row-start-1 row-span-5 flex h-full flex-col gap-px bg-slate-700">
            <Button
              type="button"
              className="h-full flex-1 rounded-none bg-emerald-500 font-sans text-lg font-bold text-slate-900 hover:opacity-90 active:scale-[0.99]"
              disabled={loading}
              onClick={() => void submit()}
            >
              OK
            </Button>
            <Button
              type="button"
              className="h-full flex-1 rounded-none bg-rose-400 font-sans text-lg font-bold text-slate-900 hover:opacity-90 active:scale-[0.99]"
              disabled={loading}
              onClick={() => router.push("/")}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
