/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

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
    expect((service as any).isDeviceLoginEnforcedForTenant('pharmacy1')).toBe(
      true,
    );
    expect((service as any).isDeviceLoginEnforcedForTenant('any')).toBe(true);
  });

  it('enforces only listed tenants in dual mode', () => {
    const { service } = createService({
      configGet: (key) => {
        if (key === 'POS_DEVICE_LOGIN_MODE') return 'dual';
        if (key === 'POS_DEVICE_ENFORCED_TENANTS') return 'pharmacy1, pilot_b';
        return '';
      },
    });
    expect((service as any).isDeviceLoginEnforcedForTenant('pharmacy1')).toBe(
      true,
    );
    expect((service as any).isDeviceLoginEnforcedForTenant('pilot_b')).toBe(
      true,
    );
    expect((service as any).isDeviceLoginEnforcedForTenant('pharmacy2')).toBe(
      false,
    );
  });

  it('keeps lockout isolated per device key', () => {
    const { service } = createService();
    const keyA = (service as any).buildStaffLoginLockKey('deviceA', 'staff-1');
    const keyB = (service as any).buildStaffLoginLockKey('deviceB', 'staff-1');

    for (let i = 0; i < 5; i += 1) {
      (service as any).registerStaffLoginFailure(keyA);
    }

    expect(() => (service as any).assertStaffLoginNotLocked(keyA)).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      (service as any).assertStaffLoginNotLocked(keyB),
    ).not.toThrow();
  });

  it('rejects invalid device secret while resolving credential', async () => {
    const { service, prisma } = createService();
    const validSecret = 'abc123';
    const credential = (service as any).encodeDeviceCredential(
      'device-uuid',
      validSecret,
    );
    const hash = (service as any).hashDeviceSecret('different-secret');

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
      (service as any).resolvePosDeviceFromCredential(credential),
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
    const jwt = (service as any).jwtService as { signAsync: jest.Mock };
    const tenantService = (service as any).tenantService as {
      applyTenantSchemaPatches: jest.Mock;
    };
    const deviceSecret = 'device-secret';
    const deviceCredential = (service as any).encodeDeviceCredential(
      'device-id',
      deviceSecret,
    );
    const deviceHash = (service as any).hashDeviceSecret(deviceSecret);
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
