"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  clearBindingAndRequireSetup,
  evaluateLocalDeviceBinding,
  type BindingGateReason,
} from "@/features/auth/model/device-binding-guard";
import { checkPosDeviceStatus } from "@/lib/services/auth";
import {
  clearPosDeviceBinding,
  getPosDeviceCredential,
  savePosDeviceBinding,
} from "@/lib/device-client";

const SETUP_MESSAGES: Record<BindingGateReason, string> = {
  missing: "This terminal is not configured. Complete setup to continue.",
  revoked:
    "This terminal was reset by your administrator. Re-enter setup credentials.",
  inactive: "This terminal is inactive. Contact your manager.",
  invalid: "Terminal binding is invalid. Reconfigure this POS terminal.",
};

type Props = {
  children: React.ReactNode;
  redirectTo?: string;
};

/**
 * Ensures a valid device credential exists before rendering PIN login or protected flows.
 * Optionally validates binding against the API (revoked/inactive terminals).
 */
export function DeviceBindingRequired({ children, redirectTo = "/" }: Props) {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const local = evaluateLocalDeviceBinding();
      if (local.state === "setup_required") {
        if (!cancelled) {
          router.replace(redirectTo);
        }
        return;
      }

      try {
        const status = await checkPosDeviceStatus(local.credential);
        if (cancelled) return;

        if (!status.ok) {
          clearPosDeviceBinding();
          router.replace(redirectTo);
          return;
        }

        savePosDeviceBinding(
          {
            ...local.binding,
            status: status.status,
            branchId: status.branchId ?? local.binding.branchId,
            displayName: status.displayName ?? local.binding.displayName,
          },
          local.credential,
        );
        setReady(true);
      } catch {
        if (cancelled) return;
        const credential = getPosDeviceCredential();
        if (!credential) {
          router.replace(redirectTo);
          return;
        }
        setReady(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, redirectTo]);

  if (checking || !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking terminal…
      </div>
    );
  }

  return <>{children}</>;
}

export function getSetupRequiredMessage(reason: BindingGateReason): string {
  return SETUP_MESSAGES[reason];
}

export { clearBindingAndRequireSetup };
