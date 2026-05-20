import { PosSessionGate } from "@/features/auth";
import { ZReport } from "@/components/pos/z-report";
import { requireServerSession } from "@/lib/auth-server";
import {
  getCurrentPosSessionServer,
  getZReportServer,
} from "@/lib/services/pos-sessions.server";
import {
  normalizeZReportPayload,
  type ZReportPayload,
} from "@/lib/z-report-payload";

export default async function ZReportPage() {
  await requireServerSession();

  let initialData: ZReportPayload | null = null;
  let serverError: string | null = null;

  try {
    const current = await getCurrentPosSessionServer();
    const sessionId = current?.id ?? null;
    if (!sessionId) {
      serverError =
        "No open or selected session. Open a shift on the register first.";
    } else {
      const raw = await getZReportServer(sessionId);
      const normalized = normalizeZReportPayload(raw);
      if (!normalized) {
        serverError = "Invalid Z-Report response from server.";
      } else {
        initialData = normalized;
      }
    }
  } catch (e) {
    serverError =
      e instanceof Error
        ? e.message
        : "Could not load Z-Report. Check your connection and branch.";
  }

  return (
    <PosSessionGate>
      <ZReport
        initialData={initialData}
        serverPrefetched
        serverError={serverError}
      />
    </PosSessionGate>
  );
}
