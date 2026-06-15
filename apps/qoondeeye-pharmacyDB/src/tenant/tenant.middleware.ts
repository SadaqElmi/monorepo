import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { requestPathname } from '../common/http/request-pathname';
import { getAuthTokenFromHeaders } from '../common/security/auth-token.util';
import { TenantService } from './tenant.service';
import { TenantContextService } from './tenant-context.service';
import {
  RESERVED_TENANT_SUBDOMAINS,
  isActiveTenantStatus,
} from './tenant-status';
import { tenantHasDedicatedDatabase } from './tenant-storage';
import type { ControlTenantRecord } from './tenant.types';
import { toTenantContextPayload } from './tenant.types';

type TenantJwtPayload = {
  type?: string;
  tenantId?: string;
  tenantSchema?: string;
};

function isPublicTenantRoute(path: string): boolean {
  return (
    path.startsWith('/api/auth') ||
    path.startsWith('/api/health') ||
    path.startsWith('/api/tenants') ||
    path.startsWith('/api/domains') ||
    path.startsWith('/api/system-users') ||
    path.startsWith('/api/admin/') ||
    path === '/api'
  );
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
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

    const headerTenant = this.firstHeaderValue(
      req.headers['x-tenant-subdomain'],
    ) ?? this.firstHeaderValue(req.headers['x-tenant']);
    if (headerTenant) {
      const slug = headerTenant.trim().toLowerCase();
      this.assertAllowedTenantSubdomain(slug);
      const tenant =
        (await this.tenantService.findBySubdomain(slug)) ??
        (await this.tenantService.findBySchemaNameInsensitive(slug));
      if (tenant) {
        await this.applyTenantToRequest(req, tenant);
        return;
      }

      const anyTenant =
        (await this.tenantService.findBySubdomainAny(slug)) ??
        (await this.tenantService.findBySchemaNameAny(slug));
      if (anyTenant && !isActiveTenantStatus(anyTenant.status)) {
        throw new ForbiddenException('TENANT_SUSPENDED');
      }

      throw new NotFoundException('TENANT_NOT_FOUND');
    }

    const host = req.headers.host ?? req.hostname ?? '';
    const hostname = host.replace(/:\d+$/, '').toLowerCase();
    const parts = hostname.split('.');
    const subdomain = parts.length >= 2 ? parts[0] : null;

    if (!subdomain || RESERVED_TENANT_SUBDOMAINS.has(subdomain)) {
      this.tenantContext.clear();
      return;
    }

    const tenant =
      (await this.tenantService.findByDomain(hostname)) ??
      (await this.tenantService.findBySubdomain(subdomain)) ??
      (await this.tenantService.findBySchemaName(subdomain));

    if (!tenant) {
      const anyTenant =
        (await this.tenantService.findBySubdomainAny(subdomain)) ??
        (await this.tenantService.findBySchemaNameAny(subdomain));
      if (anyTenant && !isActiveTenantStatus(anyTenant.status)) {
        throw new ForbiddenException('TENANT_SUSPENDED');
      }
      throw new NotFoundException('TENANT_NOT_FOUND');
    }

    await this.applyTenantToRequest(req, tenant);
  }

  private async applyTenantToRequest(
    req: FastifyRequest,
    tenant: ControlTenantRecord,
  ): Promise<void> {
    this.assertJwtTenantMatch(req, tenant);
    const usesDedicatedDatabase = tenantHasDedicatedDatabase(tenant);
    this.tenantContext.setTenant(
      toTenantContextPayload({ ...tenant, usesDedicatedDatabase }),
    );
    req.tenant = {
      id: tenant.id,
      schema_name: tenant.schemaName,
      name: tenant.name,
      slug: tenant.slug,
      subdomain: tenant.subdomain,
      database_name: tenant.databaseName,
      status: tenant.status,
    };
    req.tenantId = tenant.id;
    req.tenantSlug = tenant.slug ?? tenant.schemaName;
    req.tenantName = tenant.name;
    req.tenantDatabaseName = tenant.databaseName;
    await this.tenantService.applyTenantSchemaPatches(tenant.schemaName);
  }

  private firstHeaderValue(
    value: string | string[] | undefined,
  ): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  private assertAllowedTenantSubdomain(subdomain: string): void {
    if (!subdomain || RESERVED_TENANT_SUBDOMAINS.has(subdomain)) {
      throw new BadRequestException('RESERVED_TENANT_SUBDOMAIN');
    }
  }

  private assertJwtTenantMatch(
    req: FastifyRequest,
    tenant: ControlTenantRecord,
  ): void {
    const token = getAuthTokenFromHeaders(req.headers);
    if (!token) return;

    const jwtSecret = this.config.get<string>('JWT_SECRET') ?? 'changeme';
    let payload: TenantJwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as TenantJwtPayload;
    } catch {
      return;
    }

    if (payload.type !== 'tenant_user') return;
    if (payload.tenantId && payload.tenantId !== tenant.id) {
      throw new ForbiddenException('TENANT_MISMATCH');
    }
    if (
      payload.tenantSchema &&
      payload.tenantSchema.toLowerCase() !== tenant.schemaName.toLowerCase()
    ) {
      throw new ForbiddenException('TENANT_MISMATCH');
    }
  }
}
