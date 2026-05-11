import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisInsStore } from 'cache-manager-redis-yet';
import type { SharedRedisClient } from './redis.types';
import { REDIS_CLIENT } from './redis.constants';
import { AppRedisModule } from './redis.module';
import { TaggedCacheService } from './tagged-cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';
const DEFAULT_TTL_MS = 60_000;

@Global()
@Module({
  imports: [
    ConfigModule,
    AppRedisModule,
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule, AppRedisModule],
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: async (
        config: ConfigService,
        redis: SharedRedisClient | null,
      ) => {
        const raw = Number(config.get<string>('CACHE_DEFAULT_TTL_MS'));
        const ttlMs =
          Number.isFinite(raw) && raw > 0 ? Math.min(raw, 600_000) : DEFAULT_TTL_MS;

        if (redis) {
          return {
            stores: [
              redisInsStore(redis as never, {
                ttl: ttlMs,
              }),
            ],
            ttl: ttlMs,
          };
        }
        return { ttl: ttlMs };
      },
    }),
  ],
  providers: [TaggedCacheService, CacheInvalidationService],
  exports: [
    CacheModule,
    TaggedCacheService,
    CacheInvalidationService,
    AppRedisModule,
  ],
})
export class AppCacheModule {}
