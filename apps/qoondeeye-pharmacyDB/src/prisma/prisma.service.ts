import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const useLocal =
      process.env.NODE_ENV !== 'production' &&
      (config.get<string>('DATABASE_URL_LOCAL') ??
        process.env.DATABASE_URL_LOCAL);
    const url = useLocal
      ? useLocal
      : (config.get<string>('DATABASE_URL_STAGING') ??
        process.env.DATABASE_URL_STAGING);
    if (!url) {
      throw new Error(
        'Database URL required: set DATABASE_URL_LOCAL (dev) or DATABASE_URL_STAGING',
      );
    }
    const adapter = new PrismaPg({ connectionString: url });
    super({
      adapter,
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
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
