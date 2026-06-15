import { resetTenantControlSchemaCache } from '../tenant/tenant-control.schema';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../tenant/tenant-database-url.crypto', () => ({
  decryptTenantDatabaseUrl: jest.fn(),
}));

import * as tenantControlRepo from '../tenant/tenant-control.repository';
import * as tenantSchema from '../tenant/tenant-control.schema';
import { AdminTenantsService } from './admin-tenants.service';

const FORBIDDEN_RESPONSE_KEYS = [
  'databaseUrl',
  'databaseUrlEncrypted',
  'database_url',
  'database_url_encrypted',
  'sales',
  'products',
  'customers',
  'inventory',
  'payments',
  'purchases',
];

const sampleRow = {
  id: 'tenant-1',
  name: 'Hayat Pharmacy',
  schema_name: 'hayat',
  slug: 'hayat',
  status: 'active',
  owner_name: 'Owner',
  owner_email: 'owner@hayat.test',
  provisioning_status: 'active',
  error_message: null,
  created_at: new Date('2026-06-01T00:00:00Z'),
  updated_at: new Date('2026-06-01T00:00:00Z'),
  last_login_at: new Date('2026-06-10T00:00:00Z'),
  database_name: 'tenant_hayat_db',
  database_health_status: 'connected',
  migration_status: 'up_to_date',
  storage_used_bytes: '4096',
  last_backup_at: new Date('2026-06-12T00:00:00Z'),
  has_database_url: true,
  pos_terminal_count: '1',
};

function assertSafeAdminPayload(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toMatch(/postgresql:\/\/[^\s"']+/i);
  for (const key of FORBIDDEN_RESPONSE_KEYS) {
    expect(payload).not.toHaveProperty(key);
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      assertSafeAdminPayload(item);
    }
  } else if (payload && typeof payload === 'object') {
    if ('items' in payload && Array.isArray((payload as { items: unknown }).items)) {
      for (const item of (payload as { items: unknown[] }).items) {
        assertSafeAdminPayload(item);
      }
    }
  }
}

describe('AdminTenantsService response safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetTenantControlSchemaCache();
    jest
      .spyOn(tenantSchema, 'tenantControlFromSql')
      .mockResolvedValue('public."Tenant"');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('never exposes raw or decrypted database URLs in list/get responses', async () => {
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([sampleRow])
        .mockResolvedValueOnce([sampleRow]),
      $executeRawUnsafe: jest.fn(),
    };
    const service = new AdminTenantsService(prisma as never, {
      create: jest.fn(),
    } as never);

    const list = await service.listTenants();
    const tenant = await service.getTenant('tenant-1');

    assertSafeAdminPayload(list);
    assertSafeAdminPayload(tenant);
    expect(list.items[0]).toMatchObject({ hasDatabaseUrl: true });
  });

  it('never exposes business tables in health responses', async () => {
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ requested_at: null }]),
      $executeRawUnsafe: jest.fn(),
    };
    const service = new AdminTenantsService(prisma as never, {
      create: jest.fn(),
    } as never);

    jest.spyOn(tenantControlRepo, 'getTenantControlById').mockResolvedValue({
      id: 'tenant-1',
      name: 'Hayat',
      schemaName: 'hayat',
      slug: 'hayat',
      status: 'active',
      databaseUrlEncrypted: null,
      migrationStatus: 'up_to_date',
      storageUsedBytes: 1024,
      errorMessage: null,
      lastLoginAt: null,
    } as never);

    const health = await service.getHealth('tenant-1');
    assertSafeAdminPayload(health);
    expect(health).not.toHaveProperty('databaseUrlEncrypted');
  });

  it('never exposes business tables in login summary responses', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    const service = new AdminTenantsService(prisma as never, {
      create: jest.fn(),
    } as never);

    jest.spyOn(tenantControlRepo, 'getTenantControlById').mockResolvedValue({
      id: 'tenant-1',
      name: 'Hayat',
      schemaName: 'hayat',
      slug: 'hayat',
      status: 'active',
      databaseUrlEncrypted: 'encrypted-value-not-returned',
      lastLoginAt: new Date('2026-06-10T00:00:00Z'),
    } as never);

    const summary = await service.getLoginSummary('tenant-1');
    assertSafeAdminPayload(summary);
    expect(summary).toEqual({
      tenantId: 'tenant-1',
      lastLoginAt: new Date('2026-06-10T00:00:00Z'),
      status: 'active',
    });
  });
});
