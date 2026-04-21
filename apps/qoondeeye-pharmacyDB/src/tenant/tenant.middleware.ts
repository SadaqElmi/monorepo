import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService } from './tenant.service';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip tenant resolution for public routes (auth, tenants, system users)
    const isPublicRoute =
      req.path.startsWith('/api/auth') ||
      req.path.startsWith('/api/tenants') ||
      req.path.startsWith('/api/domains') ||
      req.path.startsWith('/api/system-users') ||
      req.path === '/api';
    if (isPublicRoute) {
      return next();
    }

    // 1. Local dev: resolve from X-Tenant header (e.g. X-Tenant: pharmacy1)
    const headerTenant = req.headers['x-tenant'] as string | undefined;
    if (headerTenant) {
      const slug = headerTenant.trim();
      const tenant = await this.tenantService.findBySchemaName(slug);
      if (tenant) {
        this.tenantContext.setTenant(tenant);
        return next();
      }
      const anyTenant = await this.tenantService.findBySchemaNameAny(slug);
      if (anyTenant && anyTenant.status !== 'active') {
        throw new ForbiddenException('Tenant is inactive');
      }
    }

    // 2. Resolve from subdomain: pharmacy1.yourapp.com -> pharmacy1
    const host = req.headers.host ?? req.hostname ?? '';
    const parts = host.replace(/:\d+$/, '').split('.'); // strip port
    const subdomain = parts.length >= 2 ? parts[0] : null;

    if (!subdomain || subdomain === 'www' || subdomain === 'api') {
      this.tenantContext.clear();
      return next();
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

    this.tenantContext.setTenant(tenant);
    next();
  }
}
