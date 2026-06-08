import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { UomsModule } from '../uoms/uoms.module';
import { AccountingController } from './accounting.controller';
import { AuditController } from './audit.controller';
import { FinancialReportsController } from './financial-reports.controller';
import { ReportsV1Controller } from './reports-v1.controller';
import { AccountingPostingService } from './accounting-posting.service';
import { ChartOfAccountsSeedService } from './chart-of-accounts-seed.service';
import { JournalService } from './journal.service';
import { FinancialReportsService } from './financial-reports.service';
import { SupplierPaymentsService } from './supplier-payments.service';
import { CustomerPaymentsService } from './customer-payments.service';
import { AccountingLockDateService } from './accounting-lock-date.service';
import { JournalBooksSeedService } from './journal-books-seed.service';
import { AuditLogService } from './audit-log.service';
import { ReportExportJobsService } from './report-export-jobs.service';
import { ReportExportWorkerService } from './report-export-worker.service';
import { ChartOfAccountsMergeService } from './chart-of-accounts-merge.service';
import { ConsolidationEngineService } from './consolidation-engine.service';
import { EntityHierarchyService } from './entity-hierarchy.service';
import { ConsolidationEnterpriseService } from './consolidation-enterprise.service';
import { PermissionGuard } from '../common/security/permission.guard';
import { AuditLogArchiveJob } from './audit-log-archive.job';
import { BranchSecurityMetricsService } from './branch-security-metrics.service';

@Module({
  imports: [PrismaModule, TenantModule, NotificationsModule, UomsModule],
  controllers: [
    AccountingController,
    FinancialReportsController,
    ReportsV1Controller,
    AuditController,
  ],
  providers: [
    ChartOfAccountsMergeService,
    ChartOfAccountsSeedService,
    AccountingLockDateService,
    JournalService,
    AccountingPostingService,
    FinancialReportsService,
    ReportExportJobsService,
    ReportExportWorkerService,
    SupplierPaymentsService,
    CustomerPaymentsService,
    JournalBooksSeedService,
    AuditLogService,
    ConsolidationEngineService,
    EntityHierarchyService,
    ConsolidationEnterpriseService,
    PermissionGuard,
    AuditLogArchiveJob,
    BranchSecurityMetricsService,
  ],
  exports: [
    ChartOfAccountsMergeService,
    ChartOfAccountsSeedService,
    AccountingLockDateService,
    AccountingPostingService,
    JournalService,
    FinancialReportsService,
    SupplierPaymentsService,
    CustomerPaymentsService,
    JournalBooksSeedService,
    AuditLogService,
    ConsolidationEngineService,
    EntityHierarchyService,
    ConsolidationEnterpriseService,
    BranchSecurityMetricsService,
  ],
})
export class AccountingModule {}
