import {
  buildTenantControlSelect,
  resetTenantControlSchemaCache,
} from './tenant-control.schema';
import type { TenantDbExecutor } from './tenant-control.repository';

function mockTenantControlDb(
  columns: string[],
  tableName: 'Tenant' | 'tenants' = 'Tenant',
): TenantDbExecutor {
  return {
    $queryRawUnsafe: jest.fn((sql: string) => {
      if (sql.includes('pg_catalog.pg_class')) {
        return Promise.resolve([{ relname: tableName }]);
      }
      if (sql.includes('information_schema.columns')) {
        return Promise.resolve(columns.map((column_name) => ({ column_name })));
      }
      return Promise.resolve([{ schemaName: 'pharmacy1' }]);
    }),
  } as unknown as TenantDbExecutor;
}

describe('tenant-control.schema', () => {
  beforeEach(() => {
    resetTenantControlSchemaCache();
  });

  it('buildTenantControlSelect omits slug when column is missing on Tenant table', async () => {
    const db = mockTenantControlDb(['id', 'name', 'schema_name', 'status']);

    const select = await buildTenantControlSelect(db);

    expect(select).not.toContain('slug');
    expect(select).toContain('schema_name AS "schemaName"');
  });
});
