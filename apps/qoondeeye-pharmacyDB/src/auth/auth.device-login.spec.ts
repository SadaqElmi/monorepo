import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

/** Narrow view of `AuthService` private helpers used only in these tests. */
type AuthDeviceLoginInternals = {
  isDeviceLoginEnforcedForTenant(schemaName: string): boolean;
  buildStaffLoginLockKey(deviceId: string, staffId: string): string;
  registerStaffLoginFailure(lockKey: string): void;
  assertStaffLoginNotLocked(lockKey: string): void;
  encodeDeviceCredential(deviceId: string, plainSecret: string): string;
  hashDeviceSecret(plainSecret: string): string;
  resolvePosDeviceFromCredential(credential: string): Promise<unknown>;
  jwtService: Pick<JwtService, 'signAsync'> & { signAsync: jest.Mock };
  tenantService: { applyTenantSchemaPatches: jest.Mock };
};

function authDeviceHooks(service: AuthService): AuthDeviceLoginInternals {
  return service as unknown as AuthDeviceLoginInternals;
}

function createService(overrides?: {
  configGet?: (key: string) => string | undefined;
  queryRows?: unknown[];
}) {
  const prisma = {
    $queryRawUnsafe: jest
      .fn()
      .mockResolvedValue(overrides?.queryRows ? [...overrides.queryRows] : []),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    withTenantSchema: jest.fn(),
    queryRawUnsafe: jest.fn(),
    systemUser: { findUnique: jest.fn() },
  };
  const jwtService = { signAsync: jest.fn() };
  const config = {
    get: jest
      .fn()
      .mockImplementation((key: string) => overrides?.configGet?.(key)),
  };
  const tenantContext = { getTenant: jest.fn(), getSchemaName: jest.fn() };
  const tenantService = {
    findBySchemaNameAny: jest.fn(),
    applyTenantSchemaPatches: jest.fn(),
    findAll: jest.fn(),
  };

  const service = new AuthService(
    prisma as never,
    jwtService as never,
    config as never,
    tenantContext as never,
    tenantService as never,
  );
  return { service, prisma, config };
}

describe('AuthService device-bound login helpers', () => {
  it('enforces device mode for all tenants when POS_DEVICE_LOGIN_MODE=device', () => {
    const { service } = createService({
      configGet: (key) => (key === 'POS_DEVICE_LOGIN_MODE' ? 'device' : ''),
    });
    const a = authDeviceHooks(service);
    expect(a.isDeviceLoginEnforcedForTenant('pharmacy1')).toBe(true);
    expect(a.isDeviceLoginEnforcedForTenant('any')).toBe(true);
  });

  it('enforces only listed tenants in dual mode', () => {
    const { service } = createService({
      configGet: (key) => {
        if (key === 'POS_DEVICE_LOGIN_MODE') return 'dual';
        if (key === 'POS_DEVICE_ENFORCED_TENANTS') return 'pharmacy1, pilot_b';
        return '';
      },
    });
    const a = authDeviceHooks(service);
    expect(a.isDeviceLoginEnforcedForTenant('pharmacy1')).toBe(true);
    expect(a.isDeviceLoginEnforcedForTenant('pilot_b')).toBe(true);
    expect(a.isDeviceLoginEnforcedForTenant('pharmacy2')).toBe(false);
  });

  it('keeps lockout isolated per device key', () => {
    const { service } = createService();
    const a = authDeviceHooks(service);
    const keyA = a.buildStaffLoginLockKey('deviceA', 'staff-1');
    const keyB = a.buildStaffLoginLockKey('deviceB', 'staff-1');

    for (let i = 0; i < 5; i += 1) {
      a.registerStaffLoginFailure(keyA);
    }

    expect(() => a.assertStaffLoginNotLocked(keyA)).toThrow(
      UnauthorizedException,
    );
    expect(() => a.assertStaffLoginNotLocked(keyB)).not.toThrow();
  });

  it('rejects invalid device secret while resolving credential', async () => {
    const { service, prisma } = createService();
    const a = authDeviceHooks(service);
    const validSecret = 'abc123';
    const credential = a.encodeDeviceCredential('device-uuid', validSecret);
    const hash = a.hashDeviceSecret('different-secret');

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'device-uuid',
        tenant_id: 'tenant-id',
        device_code: 'POS-1',
        status: 'active',
        device_secret_hash: hash,
        branch_id: null,
        tenant_schema_name: 'pharmacy1',
        tenant_status: 'active',
      },
    ]);

    await expect(
      a.resolvePosDeviceFromCredential(credential),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokePosDevice marks a tenant device as revoked', async () => {
    const { service, prisma } = createService();
    jest.spyOn(service, 'login').mockResolvedValue({
      user: { id: 'u1', email: 'm@example.com', name: 'Manager' },
      token: 't',
      userId: 'u1',
      role: 'admin',
      tenantId: 'tenant-1',
      tenantSlug: 'pharmacy1',
      userType: 'tenant',
      defaultBranchId: null,
      assignedBranchId: null,
      allowedBranchIds: [],
      canViewAllBranches: true,
      permissions: [],
    });
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: 'device-1', status: 'revoked' },
    ]);

    const result = await service.revokePosDevice({
      tenant: 'pharmacy1',
      email: 'm@example.com',
      password: 'secret123',
      deviceCode: 'POS-1',
    });

    expect(result.revoked).toBe(true);
    expect(result.deviceCode).toBe('POS-1');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
  });

  it('staffLogin resolves tenant from device and scopes query to that tenant', async () => {
    const { service, prisma } = createService();
    const a = authDeviceHooks(service);
    const jwt = a.jwtService;
    const tenantService = a.tenantService;
    const deviceSecret = 'device-secret';
    const deviceCredential = a.encodeDeviceCredential(
      'device-id',
      deviceSecret,
    );
    const deviceHash = a.hashDeviceSecret(deviceSecret);
    const pinHash = await bcrypt.hash('1234', 4);

    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: 'device-id',
        tenant_id: 'tenant-id',
        device_code: 'POS-1',
        status: 'active',
        device_secret_hash: deviceHash,
        branch_id: null,
        tenant_schema_name: 'pharmacy_alpha',
        tenant_status: 'active',
      },
    ]);
    prisma.withTenantSchema.mockImplementation(
      async (
        _schemaName: string,
        cb: (tx: { $queryRawUnsafe: jest.Mock }) => Promise<unknown>,
      ) =>
        cb({
          $queryRawUnsafe: jest.fn().mockResolvedValue([
            {
              id: 'cashier-id',
              email: 'cashier@example.com',
              name: 'Cashier',
              pin_hash: pinHash,
              branch_id: 'branch-1',
              role_name: 'cashier',
            },
          ]),
        }),
    );
    jwt.signAsync.mockResolvedValue('signed-token');

    const res = await service.staffLogin({
      staffId: 'cashier@example.com',
      pin: '1234',
      deviceCredential,
    });

    expect(tenantService.applyTenantSchemaPatches).toHaveBeenCalledWith(
      'pharmacy_alpha',
    );
    expect(prisma.withTenantSchema).toHaveBeenCalledWith(
      'pharmacy_alpha',
      expect.any(Function),
    );
    expect(res.tenantSlug).toBe('pharmacy_alpha');
    expect(res.token).toBe('signed-token');
    expect(res.role).toBe('cashier');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'cashier' }),
      expect.anything(),
    );
  });
});
