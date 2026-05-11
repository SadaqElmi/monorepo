import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Pool } from 'pg';
import {
  createPgPool,
  createPrismaPgFromPool,
  resolveDatabaseUrl,
} from './create-pg-adapter';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pgPool: Pool;

  constructor(config: ConfigService) {
    const url = resolveDatabaseUrl(config);
    if (!url) {
      throw new Error(
        'Database URL required: set DATABASE_URL (production) or DATABASE_URL_STAGING / DATABASE_URL_LOCAL',
      );
    }
    const pool = createPgPool(url);
    const adapter = createPrismaPgFromPool(pool);
    super({
      adapter,
      log: ['error', 'warn'],
    });
    this.pgPool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensurePublicPosDevicesTable();
    this.logger.log('Database connected');
  }

  /**
   * Idempotent: matches prisma/migrations/20260422101500_pos_device_binding/migration.sql.
   * Heals dev DBs that never ran `prisma migrate deploy`.
   */
  private async ensurePublicPosDevicesTable(): Promise<void> {
    await this.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "public"."pos_devices" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" UUID NOT NULL,
        "device_code" VARCHAR(128) NOT NULL,
        "display_name" VARCHAR(255),
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "device_secret_hash" VARCHAR(128) NOT NULL,
        "branch_id" UUID,
        "bound_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "last_seen_at" TIMESTAMP(6),
        "revoked_at" TIMESTAMP(6),
        "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "pos_devices_tenant_id_fkey"
          FOREIGN KEY ("tenant_id")
          REFERENCES "public"."tenants"("id")
          ON DELETE CASCADE
          ON UPDATE CASCADE
      )`,
    );
    await this.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "pos_devices_device_code_key"
       ON "public"."pos_devices"("device_code")`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_status_idx"
       ON "public"."pos_devices"("tenant_id", "status")`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_devices_tenant_id_device_code_idx"
       ON "public"."pos_devices"("tenant_id", "device_code")`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pgPool.end();
    this.logger.log('Database disconnected');
  }

  /**
   * Execute raw SQL with schema context (for tenant operations).
   * Sets search_path to the tenant schema before running the callback.
   */
  async withTenantSchema<T>(
    schemaName: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // Important: search_path is connection-local. Prisma can use different
    // pooled connections for successive queries, so we must run tenant-scoped
    // work inside a single transaction to guarantee the same connection.
    // COA seed + sale flow can run many statements; default 5s interactive tx limit is too low.
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT set_config('search_path', ${schemaName + ',public'}, true)`,
        );
        return fn(tx);
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  }

  /**
   * Clean search path - call after tenant-scoped operations
   */
  async resetSearchPath() {
    await this.$executeRaw(
      Prisma.sql`SELECT set_config('search_path', 'public', true)`,
    );
  }

  /** Tenant-scoped raw query (SELECT). Use inside withTenantSchema or after set_config. */
  queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) {
    return (this as unknown as PrismaClient).$queryRaw<T>(query, ...values);
  }

  /** Tenant-scoped raw query (unsafe). Use inside withTenantSchema or after set_config. */
  queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]) {
    return (this as unknown as PrismaClient).$queryRawUnsafe<T>(
      query,
      ...values,
    );
  }
}
