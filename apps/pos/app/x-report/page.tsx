import { PosSessionGate } from "@/features/auth";
import { XReport } from "@/components/pos/x-report";
import { requireServerSession } from "@/lib/auth-server";
import {
  getCurrentPosSessionServer,
  getXReportServer,
} from "@/lib/services/pos-sessions.server";
import {
  normalizeZReportPayload,
  type ZReportPayload,
} from "@/lib/z-report-payload";

export default async function XReportPage() {
  await requireServerSession();

  let initialData: ZReportPayload | null = null;
  let serverError: string | null = null;

  try {
    const current = await getCurrentPosSessionServer();
    const sessionId = current?.id ?? null;
    if (!sessionId) {
      serverError = "No open shift. Sign in again from the register.";
    } else {
      const raw = await getXReportServer(sessionId);
      const normalized = normalizeZReportPayload(raw);
      if (!normalized) {
        serverError = "Invalid X-Report response from server.";
      } else {
        initialData = normalized;
      }
    }
  } catch (e) {
    serverError =
      e instanceof Error
        ? e.message
        : "Could not load X-Report. Check your connection and branch.";
  }

  return (
    <PosSessionGate>
      <XReport
        initialData={initialData}
        serverPrefetched
        serverError={serverError}
      />
    </PosSessionGate>
  );
}
