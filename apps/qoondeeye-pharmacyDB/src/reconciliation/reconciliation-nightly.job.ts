import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

@Injectable()
export class ReconciliationNightlyJob {
  private readonly logger = new Logger(ReconciliationNightlyJob.name);

  constructor(private readonly reconciliation: ReconciliationService) {}

  @Cron('0 2 * * *')
  async runNightly(): Promise<void> {
    this.logger.log('Starting nightly full reconciliation for all tenants');
    await this.reconciliation.runFullReconciliationForAllTenants();
    this.logger.log('Nightly full reconciliation finished');
  }
}
