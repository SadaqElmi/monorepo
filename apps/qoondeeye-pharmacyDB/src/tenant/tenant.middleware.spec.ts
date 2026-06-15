import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantService } from './tenant.service';

function req(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    method: 'GET',
    headers: {},
    ...overrides,
  } as FastifyRequest;
}

describe('TenantMiddleware', () => {
  const tenant = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Demo',
    schemaName: 'pharmacy1',
    slug: 'pharmacy1',
    subdomain: 'pharmacy1',
    customDomain: null,
    databaseName: 'tenant_pharmacy1_db',
    databaseUrlEncrypted: 'v1:abc',
    status: 'active',
    provisioningStatus: 'active',
    provisioningLockId: null,
    provisioningStartedAt: null,
    planId: null,
    ownerUserId: null,
    errorMessage: null,
    deletedAt: null,
    scheduledDeleteAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let middleware: TenantMiddleware;
  let tenantService: jest.Mocked<
    Pick<
      TenantService,
      | 'findBySubdomain'
      | 'findBySchemaNameInsensitive'
      | 'findBySubdomainAny'
      | 'findBySchemaNameAny'
      | 'applyTenantSchemaPatches'
    >
  >;
  let tenantContext: TenantContextService;

  beforeEach(() => {
    tenantService = {
      findBySubdomain: jest.fn(),
      findBySchemaNameInsensitive: jest.fn(),
      findBySubdomainAny: jest.fn(),
      findBySchemaNameAny: jest.fn(),
      applyTenantSchemaPatches: jest.fn().mockResolvedValue(undefined),
    };
    tenantContext = new TenantContextService();
    middleware = new TenantMiddleware(
      tenantService as unknown as TenantService,
      tenantContext,
      { get: () => 'test-secret' } as unknown as ConfigService,
    );
  });

  async function runMiddleware(request: FastifyRequest): Promise<unknown> {
    return new Promise((resolve) => {
      void middleware.use(request, {}, (err?: unknown) => resolve(err));
    });
  }

  it('rejects reserved tenant subdomains from X-Tenant header', async () => {
    const err = await runMiddleware(
      req({ headers: { 'x-tenant': 'admin', host: 'api.example.com' } }),
    );
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('returns TENANT_NOT_FOUND for unknown active tenant slug', async () => {
    tenantService.findBySubdomain.mockResolvedValue(null);
    tenantService.findBySchemaNameInsensitive.mockResolvedValue(null);
    tenantService.findBySubdomainAny.mockResolvedValue(null);
    tenantService.findBySchemaNameAny.mockResolvedValue(null);

    const err = await runMiddleware(
      req({ headers: { 'x-tenant': 'missing', host: 'api.example.com' } }),
    );
    expect(err).toBeInstanceOf(NotFoundException);
  });

  it('returns TENANT_SUSPENDED for inactive tenant slug', async () => {
    tenantService.findBySubdomain.mockResolvedValue(null);
    tenantService.findBySchemaNameInsensitive.mockResolvedValue(null);
    tenantService.findBySubdomainAny.mockResolvedValue({
      ...tenant,
      status: 'suspended',
    });

    const err = await runMiddleware(
      req({ headers: { 'x-tenant': 'pharmacy1', host: 'api.example.com' } }),
    );
    expect(err).toBeInstanceOf(ForbiddenException);
  });

  it('sets dedicated-database context for hybrid tenants', async () => {
    tenantService.findBySubdomain.mockResolvedValue(tenant);

    const err = await runMiddleware(
      req({
        headers: { 'x-tenant': 'pharmacy1', host: 'api.example.com' },
      }),
    );
    expect(err).toBeUndefined();
    expect(tenantContext.getTenant()?.usesDedicatedDatabase).toBe(true);
    expect(tenantService.applyTenantSchemaPatches).toHaveBeenCalledWith(
      'pharmacy1',
    );
  });
});
