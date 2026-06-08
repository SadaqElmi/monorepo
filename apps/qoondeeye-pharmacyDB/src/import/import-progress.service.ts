import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '../cache/redis.constants';
import type { SharedRedisClient } from '../cache/redis.types';
import { clampImportProgress } from './import-progress.util';
import type { ImportProgress } from './types/import.types';

@Injectable()
export class ImportProgressService {
  private readonly memory = new Map<string, ImportProgress>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: SharedRedisClient | null,
  ) {}

  private key(jobId: string): string {
    return `pharmcare:v1:import:progress:${jobId}`;
  }

  async set(jobId: string, progress: ImportProgress): Promise<void> {
    const clamped = clampImportProgress(progress.processed, progress.total);
    const safe: ImportProgress = {
      ...progress,
      processed: clamped.processed,
      total: clamped.total,
    };
    this.memory.set(jobId, safe);
    if (!this.redis) return;
    try {
      await this.redis.hSet(this.key(jobId), {
        phase: safe.phase,
        processed: String(safe.processed),
        total: String(safe.total),
        message: safe.message ?? '',
      });
      await this.redis.expire(this.key(jobId), 86_400);
    } catch {
      /* fallback to memory only */
    }
  }

  async get(jobId: string): Promise<ImportProgress | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.hGetAll(this.key(jobId));
        if (raw && Object.keys(raw).length > 0) {
          return {
            phase: raw.phase ?? 'unknown',
            processed: Number(raw.processed ?? 0),
            total: Number(raw.total ?? 0),
            message: raw.message || undefined,
          };
        }
      } catch {
        /* fall through */
      }
    }
    return this.memory.get(jobId) ?? null;
  }

  async clear(jobId: string): Promise<void> {
    this.memory.delete(jobId);
    if (!this.redis) return;
    try {
      await this.redis.del(this.key(jobId));
    } catch {
      /* ignore */
    }
  }
}
