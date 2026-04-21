import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyCleanupJob {
  private readonly logger = new Logger(IdempotencyCleanupJob.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredIdempotencyKeys(): Promise<void> {
    const removed = await this.idempotency.cleanupExpiredAllTenants();
    this.logger.log(`Expired idempotency keys removed: ${removed}`);
  }
}
