import {

  createProvisioningTenant,

  findTenantByAlias,

  findTenantConflict,

  listActiveDedicatedTenants,

  type TenantDbExecutor,

} from './tenant-control.repository';

import { resetTenantControlSchemaCache } from './tenant-control.schema';



function mockTenantControlDb(columns: string[]): TenantDbExecutor {

  return {

    $queryRawUnsafe: jest.fn(),

    $executeRawUnsafe: jest.fn(),

  } as unknown as TenantDbExecutor;

}



function mockColumns(db: TenantDbExecutor, columns: string[]): void {

  (db.$queryRawUnsafe as jest.Mock).mockImplementation((sql: string) => {

    if (sql.includes('pg_catalog.pg_class')) {

      return Promise.resolve([{ relname: 'Tenant' }]);

    }

    if (sql.includes('information_schema.columns')) {

      return Promise.resolve(columns.map((column_name) => ({ column_name })));

    }

    return Promise.resolve([]);

  });

}



describe('tenant-control.repository', () => {

  let db: TenantDbExecutor;



  beforeEach(() => {

    resetTenantControlSchemaCache();

    db = mockTenantControlDb([

      'id',

      'name',

      'schema_name',

      'status',

      'slug',

      'subdomain',

      'database_name',

      'database_url_encrypted',

    ]);

    mockColumns(db, [

      'id',

      'name',

      'schema_name',

      'status',

      'slug',

      'subdomain',

      'database_name',

      'database_url_encrypted',

    ]);

  });



  it('findTenantConflict queries slug, subdomain, schema, and database name', async () => {

    await findTenantConflict(db, {

      schemaName: 'demo',

      slug: 'demo',

      subdomain: 'demo',

      databaseName: 'tenant_demo_db',

    });



    const conflictCall = (db.$queryRawUnsafe as jest.Mock).mock.calls.find(

      ([sql]) => typeof sql === 'string' && sql.includes('FROM "public"."Tenant"'),

    );

    expect(conflictCall?.[0]).toContain('subdomain = $3');

    expect(conflictCall?.slice(1)).toEqual([

      'demo',

      'demo',

      'demo',

      'tenant_demo_db',

    ]);

  });



  it('createProvisioningTenant inserts provisioning row', async () => {

    (db.$queryRawUnsafe as jest.Mock).mockImplementation((sql: string) => {

      if (sql.includes('pg_catalog.pg_class')) {

        return Promise.resolve([{ relname: 'Tenant' }]);

      }

      if (sql.includes('information_schema.columns')) {

        return Promise.resolve([

          { column_name: 'id' },

          { column_name: 'name' },

          { column_name: 'schema_name' },

          { column_name: 'status' },

          { column_name: 'slug' },

          { column_name: 'subdomain' },

          { column_name: 'database_name' },

          { column_name: 'database_url_encrypted' },

        ]);

      }

      return Promise.resolve([

        {

          id: '11111111-1111-1111-1111-111111111111',

          name: 'Demo',

          schemaName: 'demo',

          slug: 'demo',

          subdomain: 'demo',

          status: 'pending_setup',

        },

      ]);

    });



    const row = await createProvisioningTenant(db, {

      name: 'Demo',

      schemaName: 'demo',

      slug: 'demo',

      subdomain: 'demo',

      databaseName: 'tenant_demo_db',

      status: 'pending_setup',

      provisioningStatus: 'pending_setup',

      provisioningLockId: '22222222-2222-2222-2222-222222222222',

      provisioningStartedAt: new Date('2026-06-10T00:00:00.000Z'),

    });



    expect(row.schemaName).toBe('demo');

    const insertCall = (db.$queryRawUnsafe as jest.Mock).mock.calls.find(

      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO "public"."Tenant"'),

    );

    expect(insertCall?.[0]).toContain('INSERT INTO "public"."Tenant"');

  });

  it('listActiveDedicatedTenants requires active status and encrypted DB URL', async () => {
    await listActiveDedicatedTenants(db);

    const listCall = (db.$queryRawUnsafe as jest.Mock).mock.calls.find(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.includes('SELECT id, schema_name AS "schemaName", name'),
    );

    expect(listCall?.[0]).toContain("WHERE status = 'active'");
    expect(listCall?.[0]).toContain('database_url_encrypted IS NOT NULL');
    expect(listCall?.[0]).toContain("btrim(database_url_encrypted) <> ''");
  });



  it('findTenantByAlias supports active-only filter', async () => {

    await findTenantByAlias(db, 'demo', { activeOnly: true });



    const aliasCall = (db.$queryRawUnsafe as jest.Mock).mock.calls.find(

      ([sql]) => typeof sql === 'string' && sql.includes('lower(schema_name)'),

    );

    expect(aliasCall?.[0]).toContain("AND status = 'active'");

    expect(aliasCall?.[1]).toBe('demo');

  });



  it('findTenantByAlias omits slug match when column is missing', async () => {

    resetTenantControlSchemaCache();

    mockColumns(db, ['id', 'name', 'schema_name', 'status']);



    await findTenantByAlias(db, 'wakiil');



    const aliasCall = (db.$queryRawUnsafe as jest.Mock).mock.calls.find(

      ([sql]) => typeof sql === 'string' && sql.includes('lower(schema_name)'),

    );

    expect(aliasCall?.[0]).not.toContain('slug');

    expect(aliasCall?.[0]).not.toContain('subdomain');

  });

});


