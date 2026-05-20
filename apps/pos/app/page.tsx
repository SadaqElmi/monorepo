/** Register stays client-heavy: PosSessionGate + RegisterScreen. */
import { PosSessionGate } from "@/features/auth";
import { RegisterScreen } from "@/features/register";

export default function Page() {
  return (
    <PosSessionGate>
      <RegisterScreen />
    </PosSessionGate>
  );
}
