import { resetTenantControlSchemaCache } from '../tenant/tenant-control.schema';
import { AdminPosOpsService } from './admin-pos-ops.service';

describe('AdminPosOpsService', () => {
  beforeEach(() => {
    resetTenantControlSchemaCache();
  });

  it('maps retail overview aggregates', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ relname: 'Tenant' }])
      .mockResolvedValueOnce([
        {
          id: 'tenant-1',
          name: 'Hayat Pharmacy',
          slug: 'hayat',
          status: 'active',
          device_count: BigInt(4),
          bound_devices: BigInt(3),
          offline_devices: BigInt(1),
        },
      ])
      .mockResolvedValueOnce([{ cnt: BigInt(42) }])
      .mockResolvedValueOnce([{ cnt: BigInt(5) }])
      .mockResolvedValueOnce([{ cnt: BigInt(2) }])
      .mockResolvedValueOnce([
        {
          id: 'audit-1',
          action: 'pos_staff_login_success',
          tenant_id: 'tenant-1',
          device_id: 'dev-1',
          created_at: new Date('2026-06-11T10:00:00Z'),
          payload: {},
        },
      ])
      .mockResolvedValueOnce([
        { action: 'pos_staff_login_success', cnt: BigInt(10) },
      ])
      .mockResolvedValueOnce([
        { pending_outbox_total: BigInt(7), devices_reporting: BigInt(3) },
      ]);

    const prisma = { $queryRawUnsafe: queryRaw };
    const service = new AdminPosOpsService(prisma as never);

    const overview = await service.getRetailOverview();

    expect(queryRaw).toHaveBeenCalledTimes(8);
    expect(overview).toEqual({
      tenantCount: 1,
      controlAuditEvents24h: 42,
      failedLogins24h: 5,
      forceLogouts24h: 2,
      pendingOutboxTotal: 7,
      devicesReporting: 3,
      auditByAction24h: [{ action: 'pos_staff_login_success', count: 10 }],
      recentAuditEvents: [
        {
          id: 'audit-1',
          action: 'pos_staff_login_success',
          tenantId: 'tenant-1',
          deviceId: 'dev-1',
          createdAt: new Date('2026-06-11T10:00:00Z'),
          payload: {},
        },
      ],
      tenants: [
        {
          id: 'tenant-1',
          name: 'Hayat Pharmacy',
          slug: 'hayat',
          status: 'active',
          deviceCount: 4,
          boundDevices: 3,
          offlineDevices: 1,
        },
      ],
    });
  });

  it('scopes overview to a tenant when tenantId is provided', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ relname: 'Tenant' }])
      .mockResolvedValueOnce([
        {
          id: 'tenant-1',
          name: 'Hayat Pharmacy',
          slug: 'hayat',
          status: 'active',
          device_count: BigInt(2),
          bound_devices: BigInt(2),
          offline_devices: BigInt(0),
        },
      ])
      .mockResolvedValueOnce([{ cnt: BigInt(3) }])
      .mockResolvedValueOnce([{ cnt: BigInt(1) }])
      .mockResolvedValueOnce([{ cnt: BigInt(0) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { pending_outbox_total: BigInt(2), devices_reporting: BigInt(2) },
      ]);

    const prisma = { $queryRawUnsafe: queryRaw };
    const service = new AdminPosOpsService(prisma as never);

    const overview = await service.getRetailOverview('tenant-1');

    expect(overview.tenantCount).toBe(1);
    expect(overview.controlAuditEvents24h).toBe(3);
    expect(queryRaw).toHaveBeenCalledTimes(8);
    for (const call of queryRaw.mock.calls.slice(1)) {
      expect(call[1]).toBe('tenant-1');
      expect(String(call[0])).toContain('$1::uuid');
    }
  });
});
