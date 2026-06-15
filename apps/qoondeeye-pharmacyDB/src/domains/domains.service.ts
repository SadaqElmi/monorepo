import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { listTenantsByIds } from '../tenant/tenant-control.repository';
import { TenantService } from '../tenant/tenant.service';
import type { TenantContextPayload } from '../tenant/tenant.types';
import { toTenantContextPayload } from '../tenant/tenant.types';
import type { ControlTenantRecord } from '../tenant/tenant.types';

type DomainRow = {
  id: string;
  tenantId: string;
  domain: string;
  createdAt: Date;
};

type DomainWithTenant = DomainRow & {
  tenant: Omit<ControlTenantRecord, 'databaseUrlEncrypted'>;
};

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private readonly domainCache = new Map<
    string,
    { value: TenantContextPayload; expiresAt: number }
  >();

  private getCached(domain: string) {
    const key = domain.trim().toLowerCase();
    const entry = this.domainCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.domainCache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCached(domain: string, value: TenantContextPayload) {
    const key = domain.trim().toLowerCase();
    const ttlMs = 60_000;
    this.domainCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  private async attachTenants(rows: DomainRow[]): Promise<DomainWithTenant[]> {
    const tenantIds = [...new Set(rows.map((row) => row.tenantId))];
    const tenants = await listTenantsByIds(this.prisma, tenantIds);
    const tenantMap = new Map(
      tenants.map((tenant) => [
        tenant.id,
        this.tenantService.sanitizeTenant(tenant),
      ]),
    );

    return rows.map((row) => ({
      ...row,
      tenant:
        tenantMap.get(row.tenantId) ??
        ({
          id: row.tenantId,
          name: '',
          schemaName: '',
          status: 'unknown',
        } as Omit<ControlTenantRecord, 'databaseUrlEncrypted'>),
    }));
  }

  async findAll() {
    const rows = await this.prisma.domain.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return this.attachTenants(rows);
  }

  async findOne(id: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id },
    });
    if (!domain) throw new NotFoundException('Domain not found');
    const [mapped] = await this.attachTenants([domain]);
    return mapped;
  }

  async findByTenant(tenantId: string) {
    const rows = await this.prisma.domain.findMany({
      where: { tenantId },
    });
    return this.attachTenants(rows);
  }

  /**
   * Resolve a tenant by full domain/host (e.g. pharmacy1.yourdomain.com).
   * Returns the tenant fields needed for multi-tenant schema resolution.
   */
  async findByDomain(domain: string): Promise<TenantContextPayload | null> {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) return null;

    const cached = this.getCached(normalized);
    if (cached) return cached;

    const tenant = await this.tenantService.findByDomain(normalized);
    if (!tenant) return null;

    const resolved = toTenantContextPayload(tenant);
    this.setCached(normalized, resolved);
    return resolved;
  }

  async create(dto: { tenantId: string; domain: string }) {
    const created = await this.prisma.domain.create({
      data: { tenantId: dto.tenantId, domain: dto.domain },
    });
    const [mapped] = await this.attachTenants([created]);
    return mapped;
  }

  async update(id: string, dto: { domain?: string }) {
    const updated = await this.prisma.domain.update({
      where: { id },
      data: { domain: dto.domain },
    });
    const [mapped] = await this.attachTenants([updated]);
    return mapped;
  }

  async remove(id: string) {
    await this.prisma.domain.delete({ where: { id } });
    return { deleted: true };
  }
}
