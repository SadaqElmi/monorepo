import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContextPayload } from '../tenant/tenant-context.service';

@Injectable()
export class DomainsService {
  constructor(private readonly prisma: PrismaService) {}

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
    // small TTL to avoid stale tenant/domain changes while still preventing a DB hit per request
    const ttlMs = 60_000;
    this.domainCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async findAll() {
    return this.prisma.domain.findMany({
      include: { tenant: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!domain) throw new NotFoundException('Domain not found');
    return domain;
  }

  async findByTenant(tenantId: string) {
    return this.prisma.domain.findMany({
      where: { tenantId },
      include: { tenant: true },
    });
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

    const record = await this.prisma.domain.findUnique({
      where: { domain: normalized },
      select: {
        tenant: {
          select: {
            id: true,
            name: true,
            schemaName: true,
            status: true,
          },
        },
      },
    });

    if (!record?.tenant) return null;

    const resolved = {
      id: record.tenant.id,
      name: record.tenant.name,
      schemaName: record.tenant.schemaName,
      status: record.tenant.status,
    };
    this.setCached(normalized, resolved);
    return resolved;
  }

  async create(dto: { tenantId: string; domain: string }) {
    return this.prisma.domain.create({
      data: { tenantId: dto.tenantId, domain: dto.domain },
      include: { tenant: true },
    });
  }

  async update(id: string, dto: { domain?: string }) {
    return this.prisma.domain.update({
      where: { id },
      data: { domain: dto.domain },
      include: { tenant: true },
    });
  }

  async remove(id: string) {
    await this.prisma.domain.delete({ where: { id } });
    return { deleted: true };
  }
}
