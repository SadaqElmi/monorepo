import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class ReconciliationDailyIntegrityJob {
  private readonly logger = new Logger(ReconciliationDailyIntegrityJob.name);

  constructor(private readonly reconciliation: ReconciliationService) {}

  @Cron('0 3 * * *')
  async runDaily(): Promise<void> {
    this.logger.log('Starting daily integrity snapshot run');
    await this.reconciliation.runDailyIntegritySnapshotsForAllTenants();
    this.logger.log('Daily integrity snapshot run finished');
  }
}
