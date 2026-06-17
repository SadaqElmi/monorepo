import {
  clearPosDeviceBinding,
  getPosDeviceBinding,
  getPosDeviceCredential,
  type PosDeviceBinding,
} from "@/lib/device-client";

export type BindingGateReason =
  | "missing"
  | "revoked"
  | "inactive"
  | "invalid";

export type BindingGateResult =
  | { state: "setup_required"; reason: BindingGateReason }
  | { state: "ready"; credential: string; binding: PosDeviceBinding };

/** Client-side check: credential + binding metadata must exist locally. */
export function evaluateLocalDeviceBinding(): BindingGateResult {
  const credential = getPosDeviceCredential()?.trim();
  if (!credential) {
    return { state: "setup_required", reason: "missing" };
  }

  const binding = getPosDeviceBinding();
  if (!binding?.deviceId || !binding.tenantSlug) {
    return { state: "setup_required", reason: "invalid" };
  }

  if (binding.status && binding.status !== "active") {
    return { state: "setup_required", reason: "inactive" };
  }

  return { state: "ready", credential, binding };
}

export function clearBindingAndRequireSetup(): void {
  clearPosDeviceBinding();
}
