import {
  ADMIN_PERMISSIONS,
  roleHasAdminPermissions,
} from './admin-permissions';

describe('admin tenant control permissions', () => {
  it('defines only platform tenant-control permissions', () => {
    expect(ADMIN_PERMISSIONS).toEqual([
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
    ]);
    expect(ADMIN_PERMISSIONS).not.toContain('manage_subscriptions');
    expect(ADMIN_PERMISSIONS).not.toContain('manage_payments');
    expect(ADMIN_PERMISSIONS).not.toContain('manage_billing');
    expect(ADMIN_PERMISSIONS).not.toContain('manage_plans');
  });

  it('allows existing platform roles and denies tenant/business roles', () => {
    expect(
      roleHasAdminPermissions('super_admin', [
        'view_tenants',
        'create_tenant_backup',
      ]),
    ).toBe(true);
    expect(roleHasAdminPermissions('admin', ['run_tenant_migration'])).toBe(
      true,
    );
    expect(roleHasAdminPermissions('manager', ['view_tenants'])).toBe(false);
    expect(roleHasAdminPermissions('cashier', ['view_tenants'])).toBe(false);
  });
});
