import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantDatabaseProvisionerService } from './tenant-database-provisioner.service';
import { TENANT_STATUSES } from './tenant-status';
import type { ControlTenantRecord } from './tenant.types';
import {
  findTenantByAlias,
  findTenantBySchemaName,
  getTenantControlById,
  listAllTenants,
  updateTenantControl,
} from './tenant-control.repository';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabaseProvisioner: TenantDatabaseProvisionerService,
  ) {}

  sanitizeTenant<T extends { databaseUrlEncrypted?: string | null }>(
    tenant: T,
  ): Omit<T, 'databaseUrlEncrypted'> {
    const { databaseUrlEncrypted: _databaseUrlEncrypted, ...safe } = tenant;
    return safe;
  }

  sanitizeTenants<T extends { databaseUrlEncrypted?: string | null }>(
    tenants: T[],
  ): Array<Omit<T, 'databaseUrlEncrypted'>> {
    return tenants.map((tenant) => this.sanitizeTenant(tenant));
  }

  async findByDomain(domain: string): Promise<ControlTenantRecord | null> {
    const record = await this.prisma.domain.findUnique({
      where: { domain: domain.trim().toLowerCase() },
    });
    if (!record) return null;
    const tenant = await getTenantControlById(this.prisma, record.tenantId);
    if (
      !tenant ||
      tenant.status !== 'active' ||
      !tenant.databaseUrlEncrypted?.trim()
    ) {
      return null;
    }
    return tenant;
  }

  async findBySubdomain(subdomain: string): Promise<ControlTenantRecord | null> {
    return findTenantByAlias(this.prisma, subdomain, { activeOnly: true });
  }

  async findBySubdomainAny(subdomain: string): Promise<ControlTenantRecord | null> {
    return findTenantByAlias(this.prisma, subdomain);
  }

  async findBySchemaName(schemaName: string): Promise<ControlTenantRecord | null> {
    return findTenantBySchemaName(this.prisma, schemaName, { activeOnly: true });
  }

  async findBySchemaNameInsensitive(
    schemaName: string,
  ): Promise<ControlTenantRecord | null> {
    return findTenantBySchemaName(this.prisma, schemaName, {
      activeOnly: true,
      caseInsensitive: true,
    });
  }

  async findBySchemaNameAny(schemaName: string): Promise<ControlTenantRecord | null> {
    return findTenantBySchemaName(this.prisma, schemaName);
  }

  private async loadTenantDomains(tenantId: string) {
    return this.prisma.domain.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenant = await getTenantControlById(this.prisma, id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    const domains = await this.loadTenantDomains(id);
    return this.sanitizeTenant({ ...tenant, domains });
  }

  async findAll() {
    const tenants = await listAllTenants(this.prisma);
    const domains = await this.prisma.domain.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const domainsByTenant = new Map<string, typeof domains>();
    for (const domain of domains) {
      const list = domainsByTenant.get(domain.tenantId) ?? [];
      list.push(domain);
      domainsByTenant.set(domain.tenantId, list);
    }
    return this.sanitizeTenants(
      tenants.map((tenant) => ({
        ...tenant,
        domains: domainsByTenant.get(tenant.id) ?? [],
      })),
    );
  }

  /** Create a new tenant in a dedicated PostgreSQL database. */
  async create(input: {
    name: string;
    domain?: string;
    schemaName?: string;
    domains?: string[];
    slug?: string;
    subdomain?: string;
    customDomain?: string;
    ownerName: string;
    ownerEmail: string;
    ownerPassword: string;
  }) {
    const schemaName = this.resolveSchemaName(input);
    const allDomains = this.collectDomains(input);

    const tenant = await this.tenantDatabaseProvisioner.provision({
      name: input.name,
      slug: input.slug ?? schemaName,
      subdomain: input.subdomain ?? schemaName,
      customDomain: input.customDomain ?? input.domain,
      domains: allDomains,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      ownerPassword: input.ownerPassword,
    });
    return this.sanitizeTenant(tenant);
  }

  async update(id: string, input: { name?: string; status?: string }) {
    await this.findOne(id);
    if (
      input.status !== undefined &&
      !TENANT_STATUSES.includes(input.status as never)
    ) {
      throw new BadRequestException(
        `Tenant status must be one of: ${TENANT_STATUSES.join(', ')}`,
      );
    }
    if (input.status === 'active') {
      throw new BadRequestException(
        'Use the admin tenant activation endpoint to activate a tenant',
      );
    }
    await updateTenantControl(this.prisma, id, {
      name: input.name,
      status: input.status,
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    const tenant = await getTenantControlById(this.prisma, id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status !== 'suspended') {
      throw new BadRequestException(
        'Tenant must be suspended before soft delete',
      );
    }

    const now = new Date();
    const scheduledDeleteAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
    await updateTenantControl(this.prisma, id, {
      status: 'inactive',
      deletedAt: now,
      scheduledDeleteAt,
    });
    return { deleted: true, softDeleted: true, scheduledDeleteAt };
  }

  /**
   * Remove a tenant that never became active (pending_setup / failed).
   * Drops orphaned dedicated DB resources when present, then deletes the control row.
   */
  async abandonFailed(id: string): Promise<{ abandoned: true }> {
    const tenant = await getTenantControlById(this.prisma, id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (
      tenant.status !== 'pending_setup' &&
      tenant.status !== 'provisioning_failed' &&
      tenant.status !== 'migration_failed'
    ) {
      throw new BadRequestException(
        'Only pending_setup, provisioning_failed, or migration_failed tenants can be abandoned. Suspend active tenants before marking inactive.',
      );
    }

    const slug = tenant.slug ?? tenant.schemaName;
    const databaseName = tenant.databaseName?.trim();
    if (databaseName) {
      try {
        await this.tenantDatabaseProvisioner.teardownDedicatedDatabase(
          databaseName,
          slug,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Dedicated DB teardown failed for ${databaseName}: ${message}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reconciliationLog.deleteMany({ where: { tenantId: id } });
      await tx.reconciliationRun.deleteMany({ where: { tenantId: id } });
      await tx.domain.deleteMany({ where: { tenantId: id } });
      await tx.posDevice.deleteMany({ where: { tenantId: id } });
      await tx.tenant.delete({ where: { id } });
    });

    this.logger.warn(
      `Abandoned failed tenant ${tenant.name} (${tenant.schemaName})`,
    );
    return { abandoned: true };
  }

  async removeBySchemaName(schemaName: string): Promise<{ deleted: boolean }> {
    const normalized = schemaName.trim().toLowerCase().replace(/\s+/g, '_');
    const tenant = await findTenantBySchemaName(this.prisma, normalized);
    if (!tenant) {
      throw new NotFoundException(
        `Tenant with schema "${normalized}" not found`,
      );
    }
    return this.remove(tenant.id);
  }

  private resolveSchemaName(input: {
    name: string;
    domain?: string;
    schemaName?: string;
  }): string {
    if (input.schemaName) {
      return input.schemaName.toLowerCase().replace(/\s+/g, '_');
    }
    if (input.domain) {
      const subdomain = input.domain.split('.')[0];
      return (
        subdomain
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '') || 'tenant'
      );
    }
    return (
      input.name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'tenant'
    );
  }

  private collectDomains(input: {
    domain?: string;
    domains?: string[];
  }): string[] {
    const list: string[] = [];
    if (input.domain?.trim()) list.push(input.domain.trim());
    if (input.domains?.length) list.push(...input.domains);
    return [...new Set(list)];
  }

  /** Legacy schema-per-tenant patches removed; tenant DDL is Prisma migrate on dedicated DBs. */
  async applyTenantSchemaPatches(
    _schemaName: string,
    _options?: { force?: boolean },
  ): Promise<void> {
    return;
  }

  async addDomain(tenantId: string, domain: string) {
    return this.prisma.domain.create({
      data: { tenantId, domain },
    });
  }
}
