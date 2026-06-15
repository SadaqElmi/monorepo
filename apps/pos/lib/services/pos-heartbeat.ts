import { POS_PREFIX } from "./endpoints";
import { getPosDeviceCredential } from "@/lib/device-client";
import { authPost } from "./http";

const APP_VERSION = "0.1.0";

export async function sendPosHeartbeat(pendingOutboxCount = 0) {
  const credential = getPosDeviceCredential();
  if (!credential) return;

  await authPost(
    `${POS_PREFIX}/devices/heartbeat`,
    {
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
    },
    { "X-Pos-Device-Credential": credential },
  );
}
