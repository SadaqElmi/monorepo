import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../cache/redis.constants';
import type { SharedRedisClient } from '../cache/redis.types';

type LockState = {
  failures: number;
  lockUntil: number;
  lastFailedAt: number;
};

@Injectable()
export class PosAuthRateLimitService {
  private readonly logger = new Logger(PosAuthRateLimitService.name);
  private readonly memory = new Map<string, LockState>();
  private warnedRedisFallback = false;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: SharedRedisClient | null,
    private readonly config: ConfigService,
  ) {}

  private redisRequired(): boolean {
    const raw = this.config.get<string>('POS_RATE_LIMIT_REDIS_REQUIRED');
    return raw === 'true' || raw === '1';
  }

  private ensureRedisAvailable(): void {
    if (!this.redisRequired()) return;
    if (this.redis?.isOpen) return;
    throw new ServiceUnavailableException(
      'POS authentication rate limiting is temporarily unavailable.',
    );
  }

  async assertNotLocked(
    lockKey: string,
    lockWindowMs: number,
    lockedMessage: string,
    vector = 'generic',
  ): Promise<void> {
    this.ensureRedisAvailable();
    const existing = await this.getState(lockKey);
    if (!existing) return;

    const now = Date.now();
    if (existing.lockUntil > now) {
      this.logger.warn(
        JSON.stringify({
          kind: 'pos_auth_lockout_active',
          vector,
          lockKey,
          failures: existing.failures,
          lockUntil: new Date(existing.lockUntil).toISOString(),
        }),
      );
      throw new UnauthorizedException(lockedMessage);
    }
    if (now - existing.lastFailedAt > lockWindowMs) {
      await this.deleteState(lockKey);
    }
  }

  async registerFailure(
    lockKey: string,
    maxFailures: number,
    lockWindowMs: number,
    vector = 'generic',
  ): Promise<void> {
    this.ensureRedisAvailable();
    const now = Date.now();
    const existing = await this.getState(lockKey);
    const shouldResetWindow =
      !existing || now - existing.lastFailedAt > lockWindowMs;
    const failures = shouldResetWindow ? 1 : existing.failures + 1;
    const lockUntil =
      failures >= maxFailures ? now + lockWindowMs : 0;

    if (failures >= maxFailures) {
      this.logger.warn(
        JSON.stringify({
          kind: 'pos_auth_lockout_triggered',
          vector,
          lockKey,
          failures,
          lockUntil: lockUntil ? new Date(lockUntil).toISOString() : null,
        }),
      );
    }

    await this.setState(
      lockKey,
      { failures, lockUntil, lastFailedAt: now },
      lockWindowMs,
    );
  }

  async clearFailures(lockKey: string): Promise<void> {
    await this.deleteState(lockKey);
  }

  private redisKey(lockKey: string): string {
    return `pos:auth:lock:${lockKey}`;
  }

  private async getState(lockKey: string): Promise<LockState | null> {
    try {
      if (this.redis?.isOpen) {
        const raw = await this.redis.get(this.redisKey(lockKey));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as LockState;
        if (
          typeof parsed.failures === 'number' &&
          typeof parsed.lockUntil === 'number' &&
          typeof parsed.lastFailedAt === 'number'
        ) {
          return parsed;
        }
        return null;
      }
    } catch (e) {
      this.warnRedisFallbackOnce(e);
    }
    return this.memory.get(lockKey) ?? null;
  }

  private async setState(
    lockKey: string,
    state: LockState,
    ttlMs: number,
  ): Promise<void> {
    try {
      if (this.redis?.isOpen) {
        await this.redis.set(this.redisKey(lockKey), JSON.stringify(state), {
          PX: ttlMs,
        });
        return;
      }
    } catch (e) {
      this.warnRedisFallbackOnce(e);
    }
    this.memory.set(lockKey, state);
  }

  private async deleteState(lockKey: string): Promise<void> {
    try {
      if (this.redis?.isOpen) {
        await this.redis.del(this.redisKey(lockKey));
        return;
      }
    } catch (e) {
      this.warnRedisFallbackOnce(e);
    }
    this.memory.delete(lockKey);
  }

  private warnRedisFallbackOnce(e: unknown): void {
    if (this.warnedRedisFallback) return;
    this.warnedRedisFallback = true;
    const msg = e instanceof Error ? e.message : String(e);
    this.logger.warn(
      `POS auth rate limit Redis unavailable (${msg}) — using in-memory counters per process.`,
    );
  }
}
