import { POS_PREFIX } from "./endpoints";
import { getPosDeviceCredential } from "@/lib/device-client";
import { jsonFetch } from "./http";

const APP_VERSION = "0.1.0";

export async function sendPosHeartbeat(
  tenantSlug: string,
  pendingOutboxCount = 0,
) {
  const credential = getPosDeviceCredential();
  if (!credential) return;

  await jsonFetch(`${POS_PREFIX}/devices/heartbeat`, {
    method: "POST",
    tenantSlug,
    headers: {
      "Content-Type": "application/json",
      "X-Pos-Device-Credential": credential,
    },
    body: JSON.stringify({
      deviceName:
        typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 120)
          : undefined,
      osVersion:
        typeof navigator !== "undefined" ? navigator.platform : undefined,
      browserVersion:
        typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 64)
          : undefined,
      appVersion: APP_VERSION,
      pendingOutboxCount,
    }),
  });
}
