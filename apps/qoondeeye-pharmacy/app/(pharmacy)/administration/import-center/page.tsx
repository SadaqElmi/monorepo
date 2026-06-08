import { redirect } from "next/navigation";

import { requireServerSession } from "@/lib/auth-server";
import { loadImportCenterPageData } from "@/lib/services/api.server";

import ImportCenterClient from "@/components/features/import/import-center-client";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImportCenterPage({ searchParams }: PageProps) {
  const session = await requireServerSession();
  const permissions = session.permissions ?? [];
  const canView =
    permissions.includes("view_import_center") ||
    session.role?.toLowerCase() === "admin";
  if (!canView) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  let initial = null;
  let serverPrefetched = false;

  try {
    initial = await loadImportCenterPageData(session.tenantSlug!, params);
    serverPrefetched = true;
  } catch {
    /* client may refetch via navigation */
  }

  return (
    <ImportCenterClient
      initial={initial}
      serverPrefetched={serverPrefetched}
      permissions={permissions}
      tenantSlug={session.tenantSlug!}
    />
  );
}
