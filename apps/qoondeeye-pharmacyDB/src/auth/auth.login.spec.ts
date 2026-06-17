import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { listActiveDedicatedTenants } from '../tenant/tenant-control.repository';

jest.mock('bcrypt');
jest.mock('../tenant/tenant-control.repository', () => ({
  listActiveDedicatedTenants: jest.fn(),
}));

const listActiveDedicatedTenantsMock =
  listActiveDedicatedTenants as jest.MockedFunction<
    typeof listActiveDedicatedTenants
  >;
const bcryptCompare = bcrypt.compare as jest.MockedFunction<
  typeof bcrypt.compare
>;

const tenantUser = {
  id: 'user-1',
  email: 'jacar@gmail.com',
  name: 'Owner',
  password: 'tenant-hash',
  role_name: 'admin',
  branch_id: 'branch-1',
};

function mockTenantQueryRaw(sql: string) {
  if (sql.includes('FROM permissions')) {
    return [];
  }
  if (sql.includes('FROM "branches"')) {
    return [{ id: 'branch-1' }];
  }
  if (sql.includes('FROM "users"') && sql.includes('role_name')) {
    return [tenantUser];
  }
  if (sql.includes('FROM "users"')) {
    return [{ id: 'user-1' }];
  }
  return [];
}

function createLoginService() {
  const prisma = {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    withTenantSchema: jest.fn(),
    systemUser: { findUnique: jest.fn() },
  };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('tenant-jwt') };
  const tenantService = {
    findBySchemaNameAny: jest.fn(),
    findBySubdomainAny: jest.fn(),
    applyTenantSchemaPatches: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(),
  };

  const service = new AuthService(
    prisma as never,
    jwtService as never,
    { get: jest.fn() } as never,
    { getTenant: jest.fn(), getSchemaName: jest.fn() } as never,
    tenantService as never,
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

  prisma.withTenantSchema.mockImplementation(
    async (
      _schemaName: string,
      cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
    ) => {
      return cb({
        $queryRawUnsafe: jest
          .fn()
          .mockImplementation((sql: string) => mockTenantQueryRaw(sql)),
      });
    },
  );

  return { service, prisma, jwtService, tenantService };
}

describe('AuthService.login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listActiveDedicatedTenantsMock.mockReset();
    bcryptCompare.mockReset();
  });

  it('falls through to tenant login when super_admin email exists but password differs', async () => {
    const { service, prisma } = createLoginService();
    prisma.systemUser.findUnique.mockResolvedValue({
      id: 'sys-1',
      email: 'jacar@gmail.com',
      password: 'super-hash',
      role: 'super_admin',
      name: 'Super',
    });
    bcryptCompare
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    listActiveDedicatedTenantsMock.mockResolvedValue([
      { id: 'tenant-1', schemaName: 'jacar', name: 'Jacar Pharmacy' },
    ]);

    const result = await service.login({
      email: 'jacar@gmail.com',
      password: 'tenant-temp-password',
    });

    expect(result.userType).toBe('tenant');
    expect(result.tenantSlug).toBe('jacar');
    expect(result.userId).toBe('user-1');
    expect(bcryptCompare).toHaveBeenCalledTimes(2);
  });

  it('returns super_admin session when super_admin password matches', async () => {
    const { service, prisma } = createLoginService();
    prisma.systemUser.findUnique.mockResolvedValue({
      id: 'sys-1',
      email: 'jacar@gmail.com',
      password: 'super-hash',
      role: 'super_admin',
      name: 'Super',
    });
    bcryptCompare.mockResolvedValueOnce(true);

    const result = await service.login({
      email: 'jacar@gmail.com',
      password: 'super-password',
    });

    expect(result.userType).toBe('system');
    expect(result.role).toBe('super_admin');
    expect(prisma.withTenantSchema).not.toHaveBeenCalled();
  });

  it('rejects when super_admin email exists and neither password matches', async () => {
    const { service, prisma } = createLoginService();
    prisma.systemUser.findUnique.mockResolvedValue({
      id: 'sys-1',
      email: 'jacar@gmail.com',
      password: 'super-hash',
      role: 'super_admin',
      name: 'Super',
    });
    bcryptCompare.mockResolvedValue(false);

    listActiveDedicatedTenantsMock.mockResolvedValue([
      { id: 'tenant-1', schemaName: 'jacar', name: 'Jacar Pharmacy' },
    ]);

    await expect(
      service.login({
        email: 'jacar@gmail.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
