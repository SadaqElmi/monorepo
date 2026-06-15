import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { resetTenantControlSchemaCache } from '../tenant/tenant-control.schema';
import * as tenantControlRepo from '../tenant/tenant-control.repository';
import * as tenantSchema from '../tenant/tenant-control.schema';
import { decryptTenantDatabaseUrl } from '../tenant/tenant-database-url.crypto';
import { runTenantPrismaMigrate } from '../tenant/run-tenant-prisma-migrate';
import { AdminTenantsService } from './admin-tenants.service';

jest.mock('../tenant/tenant-database-url.crypto', () => ({
  decryptTenantDatabaseUrl: jest.fn(),
}));

jest.mock('../tenant/run-tenant-prisma-migrate', () => ({
  runTenantPrismaMigrate: jest.fn(),
}));

jest.mock('../tenant/tenant-erp-defaults.seed', () => ({
  seedTenantErpDefaults: jest.fn(),
}));

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

const actor = {
  adminUserId: 'admin-1',
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
};

const sampleRow = {
  id: 'tenant-1',
  name: 'Hayat Pharmacy',
  schema_name: 'hayat',
  slug: 'hayat',
  status: 'pending_setup',
  owner_name: 'Owner',
  owner_email: 'owner@hayat.test',
  provisioning_status: 'migrated',
  error_message: null,
  created_at: new Date('2026-06-01T00:00:00Z'),
  updated_at: new Date('2026-06-01T00:00:00Z'),
  last_login_at: null,
  database_name: 'tenant_hayat_db',
  database_health_status: 'connected',
  migration_status: 'up_to_date',
  storage_used_bytes: '1024',
  last_backup_at: null,
  has_database_url: true,
  pos_terminal_count: '2',
};

function createService() {
  const prisma = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  };
  const tenantService = {
    create: jest.fn(),
  };
  const service = new AdminTenantsService(prisma as never, tenantService as never);
  return { service, prisma, tenantService };
}

function mockAuditInsert(prisma: { $executeRawUnsafe: jest.Mock }) {
  prisma.$executeRawUnsafe.mockImplementation(async (sql: string) => {
    if (typeof sql === 'string' && sql.includes('admin_audit_events')) {
      return 1;
    }
    return 1;
  });
}

function lastAuditErrorMessage(
  prisma: { $executeRawUnsafe: jest.Mock },
): string | null {
  const call = prisma.$executeRawUnsafe.mock.calls.find(([sql]) =>
    String(sql).includes('admin_audit_events'),
  );
  return (call?.[5] as string | null | undefined) ?? null;
}

describe('AdminTenantsService', () => {
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

  describe('listTenants', () => {
    it('maps safe tenant summaries without encrypted database URLs', async () => {
      const { service, prisma } = createService();
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: '1' }])
        .mockResolvedValueOnce([sampleRow]);

      const result = await service.listTenants();

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        id: 'tenant-1',
        hasDatabaseUrl: true,
        databaseHealthStatus: 'connected',
      });
      expect(result.items[0]).not.toHaveProperty('databaseUrlEncrypted');
      expect(result.items[0]).not.toHaveProperty('database_url');
      expect(JSON.stringify(result)).not.toMatch(/postgresql:\/\//);
    });
  });

  describe('createTenant', () => {
    it('returns temporary owner password on success', async () => {
      const { service, prisma, tenantService } = createService();
      mockAuditInsert(prisma);
      tenantService.create.mockResolvedValue({ id: 'tenant-1', slug: 'hayat' });
      prisma.$queryRawUnsafe.mockResolvedValueOnce([sampleRow]);

      const result = await service.createTenant(
        {
          name: 'Hayat Pharmacy',
          ownerName: 'Owner',
          ownerEmail: 'owner@hayat.test',
          slug: 'hayat',
        },
        actor,
      );

      expect(result.temporaryOwnerPassword).toEqual(expect.any(String));
      expect(result.id).toBe('tenant-1');
      expect(tenantService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerEmail: 'owner@hayat.test',
          ownerPassword: result.temporaryOwnerPassword,
        }),
      );
    });

    it('records failure audit with redacted database URLs', async () => {
      const { service, prisma, tenantService } = createService();
      mockAuditInsert(prisma);
      tenantService.create.mockRejectedValue(
        new Error('connect failed postgresql://user:secret@host:5432/db'),
      );

      await expect(
        service.createTenant(
          {
            name: 'Broken',
            ownerName: 'Owner',
            ownerEmail: 'owner@broken.test',
          },
          actor,
        ),
      ).rejects.toThrow('connect failed postgresql://user:secret@host:5432/db');

      expect(lastAuditErrorMessage(prisma)).toBe(
        'connect failed postgresql://***',
      );
    });
  });

  describe('activateTenant readiness', () => {
    it('fails when tenant database URL is not configured', async () => {
      const { service, prisma } = createService();
      mockAuditInsert(prisma);
      jest.spyOn(tenantControlRepo, 'getTenantControlById').mockResolvedValue({
        id: 'tenant-1',
        name: 'Hayat',
        schemaName: 'hayat',
        slug: 'hayat',
        status: 'pending_setup',
        databaseUrlEncrypted: null,
      } as never);

      await expect(
        service.activateTenant('tenant-1', {}, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('runMigration', () => {
    it('marks tenant migration_failed when migrate throws', async () => {
      const { service, prisma } = createService();
      mockAuditInsert(prisma);
      jest.spyOn(tenantControlRepo, 'getTenantControlById').mockResolvedValue({
        id: 'tenant-1',
        name: 'Hayat',
        schemaName: 'hayat',
        slug: 'hayat',
        status: 'active',
        databaseUrlEncrypted: 'enc',
      } as never);
      jest
        .mocked(decryptTenantDatabaseUrl)
        .mockReturnValue('postgresql://user:secret@host/db');
      jest
        .mocked(runTenantPrismaMigrate)
        .mockRejectedValue(new Error('migrate failed postgresql://user:secret@host/db'));
      jest
        .spyOn(tenantControlRepo, 'updateTenantControl')
        .mockResolvedValue(undefined as never);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([sampleRow]);

      await expect(service.runMigration('tenant-1', actor)).rejects.toThrow(
        'migrate failed postgresql://user:secret@host/db',
      );

      expect(tenantControlRepo.updateTenantControl).toHaveBeenCalledWith(
        prisma,
        'tenant-1',
        expect.objectContaining({
          status: 'migration_failed',
          migrationStatus: 'failed',
          errorMessage: 'migrate failed postgresql://***',
        }),
      );
    });
  });

  describe('createBackup', () => {
    it('creates an audit-only accepted backup job', async () => {
      const { service, prisma } = createService();
      mockAuditInsert(prisma);
      jest.spyOn(tenantControlRepo, 'getTenantControlById').mockResolvedValue({
        id: 'tenant-1',
        name: 'Hayat',
        schemaName: 'hayat',
        slug: 'hayat',
        status: 'active',
      } as never);
      jest
        .spyOn(tenantControlRepo, 'updateTenantControl')
        .mockResolvedValue(undefined as never);
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'job-1', requested_at: new Date('2026-06-15T10:00:00Z') },
      ]);

      const result = await service.createBackup('tenant-1', actor);

      expect(result).toEqual({
        jobId: 'job-1',
        tenantId: 'tenant-1',
        status: 'accepted',
        mode: 'audit_only',
        requestedAt: new Date('2026-06-15T10:00:00Z'),
      });
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('tenant_backup_jobs'),
        'tenant-1',
        'admin-1',
        JSON.stringify({ mode: 'audit_only' }),
      );
    });
  });

  describe('getHealth', () => {
    it('returns safe health summary without decrypted database URLs', async () => {
      const { service, prisma } = createService();
      jest.spyOn(tenantControlRepo, 'getTenantControlById').mockResolvedValue({
        id: 'tenant-1',
        name: 'Hayat',
        schemaName: 'hayat',
        slug: 'hayat',
        status: 'active',
        databaseUrlEncrypted: null,
        migrationStatus: 'unknown',
        storageUsedBytes: 0,
        errorMessage: null,
        lastLoginAt: null,
      } as never);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ requested_at: null }]);

      const health = await service.getHealth('tenant-1');
      const serialized = JSON.stringify(health);

      expect(health).toMatchObject({
        tenantId: 'tenant-1',
        hasDatabaseUrl: false,
        databaseConnection: 'not_configured',
      });
      expect(serialized).not.toMatch(/postgresql:\/\//);
      expect(health).not.toHaveProperty('databaseUrl');
      expect(health).not.toHaveProperty('databaseUrlEncrypted');
      expect(health).not.toHaveProperty('sales');
      expect(health).not.toHaveProperty('products');
    });

    it('redacts connection strings in health errors', async () => {
      const { service, prisma } = createService();
      const { Pool } = jest.requireMock('pg') as {
        Pool: jest.Mock;
      };
      const pool = {
        query: jest
          .fn()
          .mockRejectedValue(
            new Error('timeout postgresql://user:secret@host:5432/db'),
          ),
        end: jest.fn().mockResolvedValue(undefined),
      };
      Pool.mockImplementation(() => pool);

      jest.spyOn(tenantControlRepo, 'getTenantControlById').mockResolvedValue({
        id: 'tenant-1',
        name: 'Hayat',
        schemaName: 'hayat',
        slug: 'hayat',
        status: 'active',
        databaseUrlEncrypted: 'enc',
        migrationStatus: 'unknown',
        storageUsedBytes: 0,
        errorMessage: null,
        lastLoginAt: null,
      } as never);
      jest
        .mocked(decryptTenantDatabaseUrl)
        .mockReturnValue('postgresql://user:secret@host:5432/db');
      jest
        .spyOn(tenantControlRepo, 'updateTenantControl')
        .mockResolvedValue(undefined as never);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ requested_at: null }]);

      const health = await service.getHealth('tenant-1');

      expect(health.databaseConnection).toBe('failed');
      expect(health.errors).toContain('timeout postgresql://***');
      expect(JSON.stringify(health)).not.toMatch(/postgresql:\/\/user:secret/);
    });
  });

  describe('getTenant', () => {
    it('throws when tenant is missing', async () => {
      const { service, prisma } = createService();
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);

      await expect(service.getTenant('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
