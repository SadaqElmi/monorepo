import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { DomainsService } from '../../domains/domains.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

function normalizeHost(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/:\d+$/, '');
}

function isSystemHost(host: string): boolean {
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  const parts = host.split('.');
  // No subdomain: yourdomain.com
  if (parts.length <= 2) return true;
  // Reserved system-level subdomains
  const sub = parts[0];
  return sub === 'www' || sub === 'admin' || sub === 'api';
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly domainsService: DomainsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Create an isolated per-request context for the duration of this request.
    await this.tenantContext.runWithContext(async () => {
      const host = normalizeHost(req.headers.host);

      // System-level hosts (no tenant): yourdomain.com, www, admin
      if (isSystemHost(host)) {
        req.isSystem = true;
        this.tenantContext.setSystem(true);
        return next();
      }

      // Full wildcard domain resolution: pharmacy1.yourdomain.com -> domains.domain
      const resolved = await this.domainsService.findByDomain(host);

      if (!resolved) {
        throw new NotFoundException('Tenant not found');
      }
      if (resolved.status !== 'active') {
        throw new ForbiddenException('Tenant is inactive');
      }

      req.tenant = {
        id: resolved.id,
        schema_name: resolved.schemaName,
        name: resolved.name,
      };
      req.isSystem = false;

      // Keep existing service/controller patterns working (TenantContextService.getSchemaName()).
      // The object shape matches the Prisma Tenant model fields we rely on.
      this.tenantContext.setTenant(resolved);

      return next();
    });
  }
}
