import { DeviceBindingRequired } from "@/features/auth/ui/device-binding-required";
import { StaffLoginPage } from "@/features/auth/ui/staff-login-page";

export default function StaffLoginRoutePage() {
  return (
    <DeviceBindingRequired>
      <StaffLoginPage />
    </DeviceBindingRequired>
  );
}
