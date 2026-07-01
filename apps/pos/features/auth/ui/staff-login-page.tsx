"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Keyboard } from "lucide-react";

import { reconcileClientBranchSelection } from "@/lib/branch-reconcile";
import { syncActiveBranchCookie } from "@/lib/branch-cookie";
import { setAuthToken, type StoredUser } from "@/lib/auth-client";
import { formatApiErrorForUser } from "@/lib/services/http";
import { usePos } from "@/components/pos-context";
import { getPosDeviceCredential } from "@/lib/device-client";
import { staffLogin } from "@/lib/services/auth";
import { staffLoginSchema, validateForSubmit } from "@/lib/validation";
import { prefetchPosRegisterData } from "@/lib/prefetch-register-data";
import { POS_BRAND_COLOR } from "@/features/register/model/constants";

export function StaffLoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setManagerPrivilegesSuspended, applyPosSessionFromLogin } = usePos();

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
        const b = localStorage.getItem("branchId")?.trim();
        if (b && b.toLowerCase() !== "all") branchId = b;
      } catch {
        /* ignore */
      }

      const deviceCredential = getPosDeviceCredential();
      if (!deviceCredential) {
        setError("Terminal is not configured. Reconfigure this POS terminal.");
        return;
      }

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

      const res = await staffLogin(
        validated.data.staffId,
        validated.data.pin,
        validated.data.deviceCredential,
        validated.data.branchId,
      );

      const user: StoredUser = {
        id: res.user.id,
        email: res.user.email ?? "",
        name: res.user.name,
        ...(res.staffId?.trim() || res.user.staffId?.trim() || id.trim()
          ? { staffId: (res.staffId ?? res.user.staffId ?? id).trim() }
          : {}),
        userType: "tenant",
        role: res.role,
        tenantId: res.tenantId ?? undefined,
        tenantSlug: res.tenantSlug ?? undefined,
        assignedBranchId: res.assignedBranchId,
        allowedBranchIds: res.allowedBranchIds,
        canViewAllBranches: res.canViewAllBranches,
      };

      setAuthToken(res.token, user, res.refreshToken);
      setManagerPrivilegesSuspended(false);

      if (res.posSession?.id) {
        applyPosSessionFromLogin({
          id: res.posSession.id,
          branch_id: res.posSession.branch_id,
          device_id: res.posSession.device_id,
          staff_user_id: res.posSession.staff_user_id,
          status: res.posSession.status,
          opened_at: res.posSession.opened_at,
          closed_at: res.posSession.closed_at,
          opening_cash: res.posSession.opening_cash,
        });
      }
      try {
        localStorage.setItem("posLastStaffId", id);
        if (res.tenantSlug)
          localStorage.setItem("posTenantSlug", res.tenantSlug);
        const initialBranchId = res.assignedBranchId ?? res.defaultBranchId;
        if (initialBranchId) {
          localStorage.setItem("branchId", initialBranchId);
          syncActiveBranchCookie(initialBranchId);
        }
        reconcileClientBranchSelection(res.allowedBranchIds);
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
      setError(formatApiErrorForUser(e));
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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto bg-background p-6">
      <Card className="w-full max-w-4xl gap-4 rounded-md py-0">
        <div className="space-y-4 px-6 pt-6">
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

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-xs">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to terminal
        </Link>
        <Link
          href="/setup"
          className="font-medium underline underline-offset-3"
          style={{ color: POS_BRAND_COLOR }}
        >
          Terminal setup (server URL)
        </Link>
      </div>
    </div>
  );
}
