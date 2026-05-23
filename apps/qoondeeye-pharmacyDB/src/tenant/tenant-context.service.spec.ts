import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(() => {
    service = new TenantContextService();
  });

  it('isolates tenant context across concurrent runWithContext calls', async () => {
    const tenantA = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      name: 'A',
      schemaName: 'tenant_a',
      status: 'active',
    };
    const tenantB = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'B',
      schemaName: 'tenant_b',
      status: 'active',
    };

    const [schemaA, schemaB] = await Promise.all([
      service.runWithContext(
        () =>
          new Promise<string>((resolve) => {
            service.setTenant(tenantA);
            setTimeout(() => resolve(service.getSchemaName()!), 20);
          }),
        { tenant: null, isSystem: false },
      ),
      service.runWithContext(
        () =>
          new Promise<string>((resolve) => {
            service.setTenant(tenantB);
            setTimeout(() => resolve(service.getSchemaName()!), 5);
          }),
        { tenant: null, isSystem: false },
      ),
    ]);

    expect(schemaA).toBe('tenant_a');
    expect(schemaB).toBe('tenant_b');
    expect(service.getTenant()).toBeNull();
  });
});
