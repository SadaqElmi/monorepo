export type PosDeviceBinding = {
  deviceId: string;
  terminalId: string;
  deviceCode: string;
  tenantId: string;
  tenantSlug: string;
  branchId?: string | null;
  status: string;
  displayName?: string | null;
  enrolledByUserId?: string;
};

const POS_DEVICE_BINDING_KEY = "posDeviceBinding";
const POS_DEVICE_CREDENTIAL_KEY = "posDeviceCredential";
const POS_DEVICE_CODE_KEY = "posDeviceCode";
const POS_SERVER_URL_KEY = "posServerUrl";
const POS_DEVICE_FINGERPRINT_KEY = "posDeviceFingerprint";

function randomDeviceCode() {
  return `POS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getOrCreatePosDeviceCode(): string {
  if (typeof window === "undefined") return "POS-unknown";
  try {
    const existing = localStorage.getItem(POS_DEVICE_CODE_KEY)?.trim();
    if (existing) return existing;
    const generated = randomDeviceCode();
    localStorage.setItem(POS_DEVICE_CODE_KEY, generated);
    return generated;
  } catch {
    return randomDeviceCode();
  }
}

export function getPosServerUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      localStorage.getItem(POS_SERVER_URL_KEY)?.trim() ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_URL_LOCAL ||
      "https://api.qoondeeye.online"
    );
  } catch {
    return "https://api.qoondeeye.online";
  }
}

export function savePosServerUrl(serverUrl: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POS_SERVER_URL_KEY, serverUrl.trim());
  } catch {
    // ignore
  }
}

export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === "undefined") return "pos-unknown";
  try {
    const existing = localStorage.getItem(POS_DEVICE_FINGERPRINT_KEY)?.trim();
    if (existing) return existing;
    const generated = `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(POS_DEVICE_FINGERPRINT_KEY, generated);
    return generated;
  } catch {
    return `fp-${Date.now().toString(36)}`;
  }
}

export function savePosDeviceBinding(
  binding: PosDeviceBinding,
  deviceCredential: string,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POS_DEVICE_BINDING_KEY, JSON.stringify(binding));
    localStorage.setItem(POS_DEVICE_CREDENTIAL_KEY, deviceCredential);
    localStorage.setItem(POS_DEVICE_CODE_KEY, binding.deviceCode);
    localStorage.setItem("posTenantSlug", binding.tenantSlug);
    if (binding.branchId) {
      localStorage.setItem("branchId", binding.branchId);
    }
  } catch {
    // ignore
  }
}

export function getPosDeviceBinding(): PosDeviceBinding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_DEVICE_BINDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PosDeviceBinding;
  } catch {
    return null;
  }
}

export function getPosDeviceCredential(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(POS_DEVICE_CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

export function clearPosDeviceBinding() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(POS_DEVICE_BINDING_KEY);
    localStorage.removeItem(POS_DEVICE_CREDENTIAL_KEY);
  } catch {
    // ignore
  }
}
