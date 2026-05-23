import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppRedisModule } from '../../cache/redis.module';
import { REDIS_CLIENT } from '../../cache/redis.constants';
import type { SharedRedisClient } from '../../cache/redis.types';
import { TenantModule } from '../../tenant/tenant.module';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Global()
@Module({
  imports: [
    TenantModule,
    AppRedisModule,
    ThrottlerModule.forRootAsync({
      imports: [AppRedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: SharedRedisClient | null) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 200,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
  ],
  providers: [
    AppThrottlerGuard,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
  exports: [AppThrottlerGuard],
})
export class RateLimitModule {}
