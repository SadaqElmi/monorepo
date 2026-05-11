import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { REDIS_CLIENT } from './redis.constants';
import type { SharedRedisClient } from './redis.types';

@Injectable()
class RedisShutdownService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisShutdownService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: SharedRedisClient | null,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      if (typeof this.client.quit === 'function') {
        await this.client.quit();
      } else if (typeof this.client.disconnect === 'function') {
        await this.client.disconnect();
      }
    } catch (e) {
      this.logger.warn(
        `Redis shutdown: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async (
        config: ConfigService,
      ): Promise<SharedRedisClient | null> => {
        const logger = new Logger('RedisClient');
        const url = config.get<string>('REDIS_URL')?.trim();
        if (!url) {
          logger.log(
            'REDIS_URL not set — using in-memory cache only (OK for local dev).',
          );
          return null;
        }
        const client = createClient({ url });
        client.on('error', (err) =>
          logger.error(`Redis client error: ${err.message}`),
        );
        try {
          await client.connect();
          logger.log('Redis connected (shared client for cache + tag index).');
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.warn(
            `Redis connection failed (${msg}) — falling back to in-memory cache; API will continue.`,
          );
          try {
            await client.disconnect();
          } catch {
            /* ignore */
          }
          return null;
        }
        return client as SharedRedisClient;
      },
      inject: [ConfigService],
    },
    RedisShutdownService,
  ],
  exports: [REDIS_CLIENT],
})
export class AppRedisModule {}
