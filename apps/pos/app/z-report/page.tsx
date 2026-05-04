import { PosSessionGate } from "@/features/auth";
import { ZReport } from "@/components/pos/z-report";

export default function ZReportPage() {
  return (
    <PosSessionGate>
      <ZReport />
    </PosSessionGate>
  );
}
