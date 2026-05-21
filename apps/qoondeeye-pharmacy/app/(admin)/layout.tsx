import type { ReactNode } from "react";

import { AdminRouteProgress } from "@/components/admin/admin-route-progress";
import { PharmacyAppShell } from "@/components/erp/pharmacy-app-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <PharmacyAppShell>
      <AdminRouteProgress />
      {children}
    </PharmacyAppShell>
  );
}
