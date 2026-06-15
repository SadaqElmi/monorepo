import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Pool } from 'pg';
import {
  createPgPool,
  createPrismaPgFromPool,
  resolveDatabaseUrl,
  resolveTenantPoolMax,
} from '../prisma/create-pg-adapter';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';
import {
  findTenantByAlias,
  getTenantControlById,
  type TenantDbExecutor,
} from './tenant-control.repository';
import { decryptTenantDatabaseUrl } from './tenant-database-url.crypto';
import {
  rewriteSchemaQualifiedSql,
  tenantHasDedicatedDatabase,
} from './tenant-storage';
import type { ControlTenantRecord } from './tenant.types';

type TenantDatabaseRow = {
  id: string;
  name: string;
  schema_name: string;
  slug: string | null;
  database_name: string | null;
  database_url_encrypted: string | null;
  status: string;
};

type TenantClientEntry = {
  tenantId: string;
  schemaName: string;
  databaseName: string | null;
  client: PrismaClient;
  pool: Pool;
  createdAt: number;
  lastUsedAt: number;
  activeRequests: number;
};

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

@Injectable()
export class TenantPrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantPrismaService.name);
  private readonly tenantClients = new Map<string, TenantClientEntry>();
  private readonly controlPrisma: PrismaClient;
  private readonly controlPool: Pool;
  private readonly maxClients: number;
  private readonly idleMs: number;
  private readonly cleanupMs: number;
  private readonly tenantPoolMax: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    config: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {
    const controlUrl = resolveDatabaseUrl(config);
    if (!controlUrl) {
      throw new Error('Control database URL is required for TenantPrismaService');
    }

    this.controlPool = createPgPool(controlUrl, { max: 3 });
    this.controlPrisma = new PrismaClient({
      adapter: createPrismaPgFromPool(this.controlPool),
      log: [
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
    this.maxClients = envInt('TENANT_PRISMA_MAX_CLIENTS', 20);
    this.idleMs = envInt('TENANT_PRISMA_IDLE_MS', 5 * 60_000);
    this.cleanupMs = envInt('TENANT_PRISMA_CLEANUP_MS', 60_000);
    this.tenantPoolMax = resolveTenantPoolMax(config);
  }

  async onModuleInit(): Promise<void> {
    PrismaService.setTenantDatabaseDelegate(this);
    PrismaService.setActiveTenantSchemaResolver(() =>
      this.tenantContext.getSchemaName(),
    );
    this.cleanupTimer = setInterval(() => {
      void this.cleanupIdleClients().catch((err) => {
        this.logger.warn(
          `Tenant Prisma cleanup failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }, this.cleanupMs);
    this.cleanupTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    await Promise.all(
      [...this.tenantClients.values()].map((entry) =>
        this.disconnectEntry(entry),
      ),
    );
    this.tenantClients.clear();
    await this.controlPrisma.$disconnect();
    await this.controlPool.end();
  }

  async withTenantDatabase<T>(
    schemaName: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const entry = await this.getEntryBySchemaName(schemaName);
    entry.lastUsedAt = Date.now();
    entry.activeRequests++;
    try {
      return await entry.client.$transaction(
        async (tx) =>
          fn(
            this.wrapTenantTransactionClient(
              tx as unknown as Prisma.TransactionClient,
              entry.schemaName,
            ),
          ),
        { timeout: 60_000, maxWait: 15_000 },
      );
    } finally {
      entry.activeRequests = Math.max(0, entry.activeRequests - 1);
      entry.lastUsedAt = Date.now();
    }
  }

  async getTenantClientById(tenantId: string): Promise<PrismaClient> {
    return (await this.getEntryByTenantId(tenantId)).client;
  }

  async getTenantClientBySchemaName(schemaName: string): Promise<PrismaClient> {
    return (await this.getEntryBySchemaName(schemaName)).client;
  }

  async shouldUseDedicatedDatabase(_schemaName: string): Promise<boolean> {
    return true;
  }

  activeClientSnapshot(): Array<{
    tenantId: string;
    schemaName: string;
    databaseName: string | null;
    activeRequests: number;
    idleMs: number;
  }> {
    const now = Date.now();
    return [...this.tenantClients.values()].map((entry) => ({
      tenantId: entry.tenantId,
      schemaName: entry.schemaName,
      databaseName: entry.databaseName,
      activeRequests: entry.activeRequests,
      idleMs: now - entry.lastUsedAt,
    }));
  }

  private controlDb(): TenantDbExecutor {
    return this.controlPrisma as unknown as TenantDbExecutor;
  }

  private toTenantDatabaseRow(record: ControlTenantRecord): TenantDatabaseRow {
    return {
      id: record.id,
      name: record.name,
      schema_name: record.schemaName,
      slug: record.slug ?? null,
      database_name: record.databaseName ?? null,
      database_url_encrypted: record.databaseUrlEncrypted ?? null,
      status: record.status,
    };
  }

  private async getEntryByTenantId(tenantId: string): Promise<TenantClientEntry> {
    const cached = this.tenantClients.get(tenantId);
    if (cached) return cached;
    const row = await this.resolveTenantById(tenantId);
    return this.getOrCreateEntry(row);
  }

  private async getEntryBySchemaName(
    schemaName: string,
  ): Promise<TenantClientEntry> {
    const cached = [...this.tenantClients.values()].find(
      (entry) => entry.schemaName.toLowerCase() === schemaName.toLowerCase(),
    );
    if (cached) return cached;
    const row = await this.resolveTenantBySchemaName(schemaName);
    return this.getOrCreateEntry(row);
  }

  private async getOrCreateEntry(
    row: TenantDatabaseRow,
  ): Promise<TenantClientEntry> {
    const cached = this.tenantClients.get(row.id);
    if (cached) return cached;
    if (row.status !== 'active') {
      throw new ServiceUnavailableException('Tenant database is not active');
    }
    if (!row.database_url_encrypted) {
      throw new ServiceUnavailableException(
        'Tenant database URL is not configured',
      );
    }

    await this.ensureCapacity();
    const databaseUrl = decryptTenantDatabaseUrl(row.database_url_encrypted);
    const pool = createPgPool(databaseUrl, { max: this.tenantPoolMax });
    const client = new PrismaClient({
      adapter: createPrismaPgFromPool(pool),
      log: [
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
    await client.$connect();

    const entry: TenantClientEntry = {
      tenantId: row.id,
      schemaName: row.schema_name,
      databaseName: row.database_name,
      client,
      pool,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      activeRequests: 0,
    };
    this.tenantClients.set(row.id, entry);
    this.logger.log(
      JSON.stringify({
        kind: 'tenant_prisma_client_created',
        tenantId: row.id,
        schemaName: row.schema_name,
        databaseName: row.database_name,
        poolMax: this.tenantPoolMax,
        activeClients: this.tenantClients.size,
      }),
    );
    return entry;
  }

  private async ensureCapacity(): Promise<void> {
    if (this.tenantClients.size < this.maxClients) return;
    const idleEntries = [...this.tenantClients.values()]
      .filter((entry) => entry.activeRequests === 0)
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    const evict = idleEntries[0];
    if (!evict) {
      throw new ServiceUnavailableException(
        'No idle tenant database clients available for eviction',
      );
    }
    await this.disconnectEntry(evict);
    this.tenantClients.delete(evict.tenantId);
  }

  private async cleanupIdleClients(): Promise<void> {
    const now = Date.now();
    const stale = [...this.tenantClients.values()].filter(
      (entry) =>
        entry.activeRequests === 0 && now - entry.lastUsedAt >= this.idleMs,
    );
    for (const entry of stale) {
      await this.disconnectEntry(entry);
      this.tenantClients.delete(entry.tenantId);
    }
    if (stale.length > 0) {
      this.logger.log(
        JSON.stringify({
          kind: 'tenant_prisma_idle_cleanup',
          disconnected: stale.length,
          activeClients: this.tenantClients.size,
        }),
      );
    }
  }

  private async disconnectEntry(entry: TenantClientEntry): Promise<void> {
    await entry.client.$disconnect().catch(() => undefined);
    await entry.pool.end().catch(() => undefined);
  }

  private wrapTenantTransactionClient(
    tx: Prisma.TransactionClient,
    schemaName: string,
  ): Prisma.TransactionClient {
    const rewrite = (query: unknown): unknown => {
      if (typeof query !== 'string') return query;
      return rewriteSchemaQualifiedSql(query, schemaName);
    };

    return new Proxy(tx, {
      get(target, property, receiver) {
        if (
          property === '$queryRawUnsafe' ||
          property === '$executeRawUnsafe' ||
          property === '$queryRaw' ||
          property === '$executeRaw'
        ) {
          const fn = Reflect.get(target, property, receiver) as (
            query: unknown,
            ...values: unknown[]
          ) => unknown;
          return (query: unknown, ...values: unknown[]) =>
            fn.call(target, rewrite(query), ...values);
        }
        return Reflect.get(target, property, receiver);
      },
    }) as Prisma.TransactionClient;
  }

  private async resolveTenantById(tenantId: string): Promise<TenantDatabaseRow> {
    const record = await getTenantControlById(this.controlDb(), tenantId);
    if (!record) {
      throw new ServiceUnavailableException('Tenant not found');
    }
    return this.toTenantDatabaseRow(record);
  }

  private async resolveTenantBySchemaName(
    schemaName: string,
  ): Promise<TenantDatabaseRow> {
    const record = await findTenantByAlias(this.controlDb(), schemaName);
    if (!record) {
      throw new ServiceUnavailableException('Tenant not found');
    }
    return this.toTenantDatabaseRow(record);
  }
}
