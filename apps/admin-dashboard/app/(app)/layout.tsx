import type { ReactNode } from "react";

import { AdminRouteProgress } from "@/components/admin/admin-route-progress";
import { AdminAppShell } from "@/components/erp/admin-app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAppShell>
      <AdminRouteProgress />
      {children}
    </AdminAppShell>
  );
}
