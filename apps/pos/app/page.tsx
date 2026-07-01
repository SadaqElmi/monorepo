/** Register stays client-heavy: PosSessionGate + RegisterScreen. */
import { ShiftBanner } from "@/components/shift-banner";
import { ShiftPausedOverlay } from "@/components/shift-paused-overlay";
import { PosSessionGate } from "@/features/auth";
import { RegisterScreen } from "@/features/register";

export default function Page() {
  return (
    <PosSessionGate>
      <ShiftBanner />
      <div className="relative min-h-0 flex-1">
        <ShiftPausedOverlay />
        <RegisterScreen />
      </div>
    </PosSessionGate>
  );
}
