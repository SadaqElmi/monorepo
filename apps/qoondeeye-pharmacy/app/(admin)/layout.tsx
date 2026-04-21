import type { ReactNode } from "react";

import { PharmacyAppShell } from "@/components/erp/pharmacy-app-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PharmacyAppShell>{children}</PharmacyAppShell>;
}
