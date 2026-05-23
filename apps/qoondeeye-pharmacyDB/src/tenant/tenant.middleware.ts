import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Tenant } from '@prisma/client';
import { requestPathname } from '../common/http/request-pathname';
import { TenantService } from './tenant.service';
import { TenantContextService } from './tenant-context.service';

function isPublicTenantRoute(path: string): boolean {
  return (
    path.startsWith('/api/auth') ||
    path.startsWith('/api/tenants') ||
    path.startsWith('/api/domains') ||
    path.startsWith('/api/system-users') ||
    path === '/api'
  );
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async use(req: FastifyRequest, _res: unknown, next: () => void): Promise<void> {
    if ((req.method ?? '').toUpperCase() === 'OPTIONS') {
      next();
      return;
    }

    try {
      await this.resolveTenantForRequest(req);
      next();
    } catch (err) {
      (next as (error?: unknown) => void)(err);
    }
  }

  private async resolveTenantForRequest(req: FastifyRequest): Promise<void> {
    const path = requestPathname(req);
    if (isPublicTenantRoute(path)) {
      return;
    }

    const headerTenant = req.headers['x-tenant'] as string | undefined;
    if (headerTenant) {
      const slug = headerTenant.trim();
      const tenant = await this.tenantService.findBySchemaNameInsensitive(slug);
      if (tenant) {
        await this.applyTenantToRequest(req, tenant);
        return;
      }

      const anyTenant = await this.tenantService.findBySchemaNameAny(slug);
      if (anyTenant && anyTenant.status !== 'active') {
        throw new ForbiddenException('Tenant is inactive');
      }

      throw new NotFoundException(`Tenant not found for X-Tenant: ${slug}`);
    }

    const host = req.headers.host ?? req.hostname ?? '';
    const parts = host.replace(/:\d+$/, '').split('.');
    const subdomain = parts.length >= 2 ? parts[0] : null;

    if (!subdomain || subdomain === 'www' || subdomain === 'api') {
      this.tenantContext.clear();
      return;
    }

    const tenant =
      (await this.tenantService.findByDomain(host)) ??
      (await this.tenantService.findBySchemaName(subdomain));

    if (!tenant) {
      const anyTenant = await this.tenantService.findBySchemaNameAny(subdomain);
      if (anyTenant && anyTenant.status !== 'active') {
        throw new ForbiddenException('Tenant is inactive');
      }
      throw new NotFoundException(`Tenant not found for: ${host}`);
    }

    await this.applyTenantToRequest(req, tenant);
  }

  private async applyTenantToRequest(
    req: FastifyRequest,
    tenant: Tenant,
  ): Promise<void> {
    this.tenantContext.setTenant(tenant);
    req.tenant = {
      id: tenant.id,
      schema_name: tenant.schemaName,
      name: tenant.name,
    };
    await this.tenantService.applyTenantSchemaPatches(tenant.schemaName);
  }
}
