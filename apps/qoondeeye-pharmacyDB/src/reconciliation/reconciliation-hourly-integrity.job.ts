import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class ReconciliationHourlyIntegrityJob {
  private readonly logger = new Logger(ReconciliationHourlyIntegrityJob.name);

  constructor(private readonly reconciliation: ReconciliationService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourly(): Promise<void> {
    this.logger.log('Starting hourly integrity snapshot run');
    await this.reconciliation.runHourlyIntegritySnapshotsForAllTenants();
    this.logger.log('Hourly integrity snapshot run finished');
  }
}
