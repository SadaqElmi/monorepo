import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SharedRedisClient } from './redis.types';
import { REDIS_CLIENT } from './redis.constants';

const TAG_INDEX_PREFIX = 'pharmcare:v1:cache-tag:';
const DEGRADED_LOG_INTERVAL_MS = 60_000;

@Injectable()
export class TaggedCacheService {
  private readonly logger = new Logger(TaggedCacheService.name);
  /** Fallback tag → cache keys when Redis is unavailable (per-process only). */
  private readonly memoryTagIndex = new Map<string, Set<string>>();
  private cacheGetDegradedLoggedAt = 0;
  private cacheSetDegradedLoggedAt = 0;
  private redisTagDegradedLoggedAt = 0;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(REDIS_CLIENT) private readonly redis: SharedRedisClient | null,
  ) {}

  private tagIndexKey(tag: string): string {
    return `${TAG_INDEX_PREFIX}${tag}`;
  }

  private logDegradedOnce(
    kind: 'get' | 'set' | 'redis-tag',
    message: string,
  ): void {
    const now = Date.now();
    const last =
      kind === 'get'
        ? this.cacheGetDegradedLoggedAt
        : kind === 'set'
          ? this.cacheSetDegradedLoggedAt
          : this.redisTagDegradedLoggedAt;
    if (now - last < DEGRADED_LOG_INTERVAL_MS) return;
    if (kind === 'get') this.cacheGetDegradedLoggedAt = now;
    else if (kind === 'set') this.cacheSetDegradedLoggedAt = now;
    else this.redisTagDegradedLoggedAt = now;
    this.logger.warn(message);
  }

  /**
   * Reads through cache; on miss runs factory, stores with TTL, registers tag index for invalidation.
   * Redis/cache errors never throw — falls back to running the factory (database).
   */
  async getOrSet<T>(
    key: string,
    tags: string[],
    ttlMs: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    try {
      const hit = await this.cache.get<T>(key);
      if (hit !== undefined && hit !== null) {
        return hit as T;
      }
    } catch (e) {
      this.logDegradedOnce(
        'get',
        `Cache read degraded (using database): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const value = await factory();
    try {
      await this.setWithTags(key, value, ttlMs, tags);
    } catch (e) {
      this.logDegradedOnce(
        'set',
        `Cache write skipped after database read: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return value;
  }

  async setWithTags<T>(
    key: string,
    value: T,
    ttlMs: number,
    tags: string[],
  ): Promise<void> {
    await this.cache.set(key, value, ttlMs);
    await this.registerKeyForTags(key, tags);
  }

  private async registerKeyForTags(
    key: string,
    tags: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(tags.filter(Boolean))];
    if (unique.length === 0) return;

    if (this.redis) {
      try {
        for (const t of unique) {
          await this.redis.sAdd(this.tagIndexKey(t), key);
        }
      } catch (e) {
        this.logDegradedOnce(
          'redis-tag',
          `Redis tag index degraded (in-memory fallback): ${e instanceof Error ? e.message : String(e)}`,
        );
        for (const t of unique) {
          this.registerKeyMemory(t, key);
        }
      }
    } else {
      for (const t of unique) {
        this.registerKeyMemory(t, key);
      }
    }
  }

  private registerKeyMemory(tag: string, key: string): void {
    let set = this.memoryTagIndex.get(tag);
    if (!set) {
      set = new Set();
      this.memoryTagIndex.set(tag, set);
    }
    set.add(key);
  }

  /**
   * Deletes all cache entries registered under the given tags (no FLUSHDB).
   */
  async invalidateTags(tags: readonly string[]): Promise<void> {
    const unique = [...new Set(tags.filter(Boolean))];
    for (const tag of unique) {
      await this.invalidateOneTag(tag);
    }
  }

  private async invalidateOneTag(tag: string): Promise<void> {
    const idx = this.tagIndexKey(tag);
    let keys: string[] = [];

    if (this.redis) {
      try {
        keys = await this.redis.sMembers(idx);
      } catch (e) {
        this.logDegradedOnce(
          'redis-tag',
          `Redis SMEMBERS failed for "${tag}": ${e instanceof Error ? e.message : String(e)}`,
        );
        keys = [...(this.memoryTagIndex.get(tag) ?? [])];
      }
    } else {
      keys = [...(this.memoryTagIndex.get(tag) ?? [])];
    }

    const chunkSize = 200;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map((k) =>
          this.cache.del(k).catch((e) => {
            this.logDegradedOnce(
              'get',
              `cache del "${k}": ${e instanceof Error ? e.message : String(e)}`,
            );
          }),
        ),
      );
    }

    if (this.redis) {
      try {
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
        await this.redis.del(idx);
      } catch (e) {
        this.logDegradedOnce(
          'redis-tag',
          `Redis DEL tag index failed for "${tag}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    this.memoryTagIndex.delete(tag);
  }
}
