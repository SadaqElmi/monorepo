import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationHourlyIntegrityJob } from './reconciliation-hourly-integrity.job';
import { ReconciliationDailyIntegrityJob } from './reconciliation-daily-integrity.job';
import { ReconciliationNightlyJob } from './reconciliation-nightly.job';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [PrismaModule, TenantModule, AccountingModule],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    ReconciliationNightlyJob,
    ReconciliationHourlyIntegrityJob,
    ReconciliationDailyIntegrityJob,
  ],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
