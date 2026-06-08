/** Base URL for the standalone platform admin app (`apps/admin-dashboard`). */
export function getAdminDashboardUrl(path = ""): string {
  const base = (
    process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL ?? "http://localhost:3002"
  ).replace(/\/$/, "");
  const segment = path.replace(/^\//, "");
  return segment ? `${base}/${segment}` : base;
}
