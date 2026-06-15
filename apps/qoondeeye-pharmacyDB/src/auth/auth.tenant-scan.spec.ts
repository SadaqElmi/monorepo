import { AuthService } from './auth.service';
import { listActiveDedicatedTenants } from '../tenant/tenant-control.repository';

jest.mock('../tenant/tenant-control.repository', () => ({
  getTenantControlById: jest.fn(),
  listActiveDedicatedTenants: jest.fn(),
}));

const listActiveDedicatedTenantsMock =
  listActiveDedicatedTenants as jest.MockedFunction<
    typeof listActiveDedicatedTenants
  >;

type AuthTenantScanInternals = {
  findTenantByUserEmail(
    email: string,
  ): Promise<{ id: string; schemaName: string; name: string } | null>;
  logger: { warn: jest.Mock };
};

function authTenantScanHooks(service: AuthService): AuthTenantScanInternals {
  return service as unknown as AuthTenantScanInternals;
}

function createService() {
  const prisma = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    withTenantSchema: jest.fn(),
    systemUser: { findUnique: jest.fn() },
    posDevice: { findUnique: jest.fn() },
  };
  const service = new AuthService(
    prisma as never,
    { signAsync: jest.fn() } as never,
    { get: jest.fn() } as never,
    { getTenant: jest.fn(), getSchemaName: jest.fn() } as never,
    {
      findBySchemaNameAny: jest.fn(),
      findBySubdomainAny: jest.fn(),
      applyTenantSchemaPatches: jest.fn(),
      create: jest.fn(),
    } as never,
    {
      assertNotLocked: jest.fn(),
      registerFailure: jest.fn(),
      clearFailures: jest.fn(),
    } as never,
    { record: jest.fn() } as never,
    {
      issuePair: jest.fn(),
      rotateRefreshToken: jest.fn(),
    } as never,
  );
  authTenantScanHooks(service).logger.warn = jest.fn();
  return { service, prisma };
}

describe('AuthService tenant email scanning', () => {
  beforeEach(() => {
    listActiveDedicatedTenantsMock.mockReset();
  });

  it('continues scanning when one active tenant database fails', async () => {
    const { service, prisma } = createService();
    listActiveDedicatedTenantsMock.mockResolvedValue([
      { id: 'tenant-broken', schemaName: 'broken', name: 'Broken' },
      { id: 'tenant-empty', schemaName: 'empty', name: 'Empty' },
      { id: 'tenant-good', schemaName: 'good', name: 'Good' },
    ]);
    prisma.withTenantSchema.mockImplementation(
      async (
        schemaName: string,
        cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
      ) => {
        if (schemaName === 'broken') {
          throw new Error(
            'connect ECONNREFUSED postgresql://user:secret@db.example/app',
          );
        }
        const rows =
          schemaName === 'good' ? [{ id: 'user-good' }] : [];
        return cb({ $queryRawUnsafe: jest.fn().mockResolvedValue(rows) });
      },
    );

    const result = await authTenantScanHooks(service).findTenantByUserEmail(
      'owner@example.com',
    );

    expect(result).toEqual({
      id: 'tenant-good',
      schemaName: 'good',
      name: 'Good',
    });
    expect(prisma.withTenantSchema).toHaveBeenCalledTimes(3);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('database_health_status = $2'),
      'tenant-broken',
      'failed',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('database_health_status = $2'),
      'tenant-empty',
      'connected',
    );
    expect(authTenantScanHooks(service).logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('postgresql://***'),
    );
  });

  it('returns null only after all valid tenant scans miss or fail', async () => {
    const { service, prisma } = createService();
    listActiveDedicatedTenantsMock.mockResolvedValue([
      { id: 'tenant-broken', schemaName: 'broken', name: 'Broken' },
      { id: 'tenant-empty', schemaName: 'empty', name: 'Empty' },
    ]);
    prisma.withTenantSchema.mockImplementation(
      async (
        schemaName: string,
        cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
      ) => {
        if (schemaName === 'broken') {
          throw new Error('connection failed');
        }
        return cb({ $queryRawUnsafe: jest.fn().mockResolvedValue([]) });
      },
    );

    await expect(
      authTenantScanHooks(service).findTenantByUserEmail('missing@example.com'),
    ).resolves.toBeNull();
    expect(prisma.withTenantSchema).toHaveBeenCalledTimes(2);
  });
});
