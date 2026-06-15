export const ADMIN_PERMISSIONS = [
  'view_tenants',
  'create_tenant',
  'update_tenant_status',
  'run_tenant_migration',
  'view_tenant_health',
  'create_tenant_backup',
  'view_storage_usage',
  'view_login_summary',
  'manage_pos_terminals',
  'view_admin_audit_logs',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const ALL_ADMIN_PERMISSIONS = new Set<AdminPermission>(ADMIN_PERMISSIONS);

const ROLE_PERMISSIONS: Record<string, ReadonlySet<AdminPermission>> = {
  super_admin: ALL_ADMIN_PERMISSIONS,
  admin: ALL_ADMIN_PERMISSIONS,
};

export function roleHasAdminPermissions(
  role: string | null | undefined,
  required: readonly AdminPermission[],
): boolean {
  if (!required.length) return true;
  const permissions = ROLE_PERMISSIONS[(role ?? '').trim().toLowerCase()];
  if (!permissions) return false;
  return required.every((permission) => permissions.has(permission));
}
