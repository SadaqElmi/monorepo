import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantDatabaseProvisionerService } from './tenant-database-provisioner.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TenantDatabaseProvisionerService', () => {
  const service = new TenantDatabaseProvisionerService(
    {} as PrismaService,
    { get: () => undefined } as unknown as ConfigService,
  );

  it('enforces slug charset and naming rules', () => {
    expect(service.assertSafeSlug('hayat_pharmacy')).toBe('hayat_pharmacy');
    expect(service.databaseNameForSlug('hayat_pharmacy')).toBe(
      'tenant_hayat_pharmacy_db',
    );
    expect(service.databaseUserForSlug('hayat_pharmacy')).toBe(
      'tenant_hayat_pharmacy_user',
    );
    expect(() => service.assertSafeSlug('Hayat-Pharmacy')).toThrow(
      BadRequestException,
    );
  });
});
