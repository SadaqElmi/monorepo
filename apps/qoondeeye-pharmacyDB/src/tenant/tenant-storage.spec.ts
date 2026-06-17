import {
  resolveTenantStorageMode,
  rewriteSchemaQualifiedSql,
  tenantHasDedicatedDatabase,
  tenantPhysicalSchema,
} from './tenant-storage';

describe('tenant-storage', () => {
  it('detects dedicated database tenants by encrypted URL', () => {
    expect(tenantHasDedicatedDatabase({ databaseUrlEncrypted: 'v1:abc' })).toBe(
      true,
    );
    expect(tenantHasDedicatedDatabase({ usesDedicatedDatabase: true })).toBe(
      true,
    );
    expect(tenantHasDedicatedDatabase({ databaseUrlEncrypted: null })).toBe(
      false,
    );
  });

  it('always resolves database storage mode', () => {
    expect(resolveTenantStorageMode()).toBe('database');
  });

  it('rewrites legacy schema-qualified SQL to public', () => {
    const sql = `SELECT * FROM "pharmacy1"."products" WHERE id = $1`;
    expect(rewriteSchemaQualifiedSql(sql, 'pharmacy1')).toBe(
      `SELECT * FROM "public"."products" WHERE id = $1`,
    );
  });

  it('always uses public schema for tenant ERP tables', () => {
    expect(tenantPhysicalSchema('database', 'pharmacy1', null)).toBe('public');
    expect(
      tenantPhysicalSchema('database', 'pharmacy1', {
        usesDedicatedDatabase: true,
      }),
    ).toBe('public');
  });
});
