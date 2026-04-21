import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialReportsService } from './financial-reports.service';
import {
  writeBalanceSheetPdf,
  writeBalanceSheetXlsx,
  writeCashFlowPdf,
  writeCashFlowXlsx,
  writeProfitLossPdf,
  writeProfitLossXlsx,
} from './report-export.generator';
import { ReportExportJobsService } from './report-export-jobs.service';

@Injectable()
export class ReportExportWorkerService {
  private readonly logger = new Logger(ReportExportWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: FinancialReportsService,
    private readonly jobs: ReportExportJobsService,
  ) {}

  private exportDir(): string {
    return path.resolve(process.env.REPORT_EXPORT_DIR ?? 'tmp/report-exports');
  }

  /**
   * Drains one pending export job per active tenant schema.
   * Single-instance friendly; use a dedicated worker or queue if you scale horizontally.
   */
  @Cron('*/25 * * * * *')
  async drainExportJobs(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { schemaName: true },
    });
    for (const { schemaName } of tenants) {
      try {
        await this.jobs.releaseStaleProcessingJobs(schemaName);
        await this.processOneJob(schemaName);
      } catch (e) {
        this.logger.warn(
          `Export worker error for schema ${schemaName}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }

  private async processOneJob(schemaName: string): Promise<void> {
    const job = await this.jobs.claimNextPending(schemaName);
    if (!job) return;

    const params = job.params;
    const branchIds = params.branchIds ?? [];
    if (!branchIds.length) {
      await this.jobs.markFailed(
        schemaName,
        job.id,
        'Export job missing branchIds in params',
        { terminal: true },
      );
      return;
    }

    const ext = job.format === 'pdf' ? 'pdf' : 'xlsx';
    const basename = `export-${job.id}.${ext}`;
    const fullPath = path.join(this.exportDir(), basename);

    try {
      if (job.reportType === 'profit_loss') {
        const from = params.from;
        const to = params.to;
        if (!from?.trim() || !to?.trim()) {
          throw new Error('from and to are required for profit_loss export');
        }
        const data = await this.reports.incomeStatement(
          schemaName,
          branchIds,
          from.trim(),
          to.trim(),
          { drilldownPath: '/accounting/journal-lines' },
        );
        const title = `Profit and loss ${from} – ${to}`;
        if (job.format === 'pdf') {
          await writeProfitLossPdf(fullPath, title, data);
        } else {
          await writeProfitLossXlsx(fullPath, title, data);
        }
      } else if (job.reportType === 'balance_sheet') {
        const asOf = params.asOf;
        if (!asOf?.trim()) {
          throw new Error('asOf is required for balance_sheet export');
        }
        const consolidated = Boolean(params.consolidated);
        if (consolidated && branchIds.length <= 1) {
          throw new Error(
            'consolidated balance sheet export requires multiple branches',
          );
        }
        const data = await this.reports.balanceSheet(
          schemaName,
          branchIds,
          asOf.trim(),
          {
            drilldownPath: '/accounting/journal-lines',
            consolidated,
          },
        );
        const title = consolidated
          ? `Consolidated Balance Sheet (inter-branch eliminated) as of ${asOf}`
          : `Balance sheet as of ${asOf}`;
        if (job.format === 'pdf') {
          await writeBalanceSheetPdf(fullPath, title, data);
        } else {
          await writeBalanceSheetXlsx(fullPath, title, data);
        }
      } else if (job.reportType === 'cash_flow') {
        const from = params.from;
        const to = params.to;
        if (!from?.trim() || !to?.trim()) {
          throw new Error('from and to are required for cash_flow export');
        }
        const data = await this.reports.cashFlowStatement(
          schemaName,
          branchIds,
          from.trim(),
          to.trim(),
        );
        const title = `Cash flow ${from} – ${to}`;
        if (job.format === 'pdf') {
          await writeCashFlowPdf(fullPath, title, data);
        } else {
          await writeCashFlowXlsx(fullPath, title, data);
        }
      } else {
        throw new Error(`Unknown report type: ${job.reportType}`);
      }

      await this.jobs.markCompleted(schemaName, job.id, basename);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.jobs.markFailed(schemaName, job.id, msg);
    }
  }
}
