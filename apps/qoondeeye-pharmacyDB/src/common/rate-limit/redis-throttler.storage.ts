import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};
import { REDIS_CLIENT } from '../../cache/redis.constants';
import type { SharedRedisClient } from '../../cache/redis.types';

type MemoryEntry = {
  totalHits: number;
  expiresAt: number;
  isBlocked: boolean;
  blockExpiresAt: number;
};

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private warnedRedisFallback = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: SharedRedisClient | null,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      if (this.redis?.isOpen) {
        return await this.incrementRedis(key, ttl, limit, blockDuration);
      }
    } catch (e) {
      this.warnRedisFallbackOnce(e);
    }
    return this.incrementMemory(key, ttl, limit, blockDuration, throttlerName);
  }

  private warnRedisFallbackOnce(e: unknown): void {
    if (this.warnedRedisFallback) return;
    this.warnedRedisFallback = true;
    const msg = e instanceof Error ? e.message : String(e);
    this.logger.warn(
      `Rate limit Redis unavailable (${msg}) — using in-memory counters per process.`,
    );
  }

  private async incrementRedis(
    key: string,
    ttlMs: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redis!;
    const hits = await client.incr(key);
    if (hits === 1) {
      await client.pExpire(key, ttlMs);
    }
    let timeToExpire = Math.ceil((await client.pTTL(key)) / 1000);
    if (timeToExpire < 0) {
      await client.pExpire(key, ttlMs);
      timeToExpire = Math.ceil(ttlMs / 1000);
    }
    const isBlocked = hits > limit;
    const timeToBlockExpire = isBlocked ? Math.ceil(blockDuration / 1000) : 0;
    return {
      totalHits: hits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }

  private incrementMemory(
    key: string,
    ttlMs: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    let entry = this.memory.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = {
        totalHits: 0,
        expiresAt: now + ttlMs,
        isBlocked: false,
        blockExpiresAt: 0,
      };
      this.memory.set(key, entry);
    }

    if (!entry.isBlocked) {
      entry.totalHits += 1;
    }

    if (entry.totalHits > limit && !entry.isBlocked) {
      entry.isBlocked = true;
      entry.blockExpiresAt = now + blockDuration;
    }

    let timeToBlockExpire = Math.ceil((entry.blockExpiresAt - now) / 1000);
    if (entry.isBlocked && timeToBlockExpire <= 0) {
      entry.isBlocked = false;
      entry.totalHits = 1;
      entry.expiresAt = now + ttlMs;
      entry.blockExpiresAt = 0;
      timeToBlockExpire = 0;
    }

    const timeToExpire = Math.max(
      0,
      Math.ceil((entry.expiresAt - now) / 1000),
    );

    void throttlerName;

    return {
      totalHits: entry.totalHits,
      timeToExpire,
      isBlocked: entry.isBlocked,
      timeToBlockExpire: Math.max(0, timeToBlockExpire),
    };
  }
}
