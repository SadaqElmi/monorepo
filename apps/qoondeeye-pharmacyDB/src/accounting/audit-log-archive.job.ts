import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

/**
 * Moves cold audit rows into `audit_log_archive` to keep `audit_logs` smaller.
 * Retention window is configurable via `AUDIT_LOG_RETENTION_HOT_DAYS` (default 730).
 */
@Injectable()
export class AuditLogArchiveJob {
  private readonly logger = new Logger(AuditLogArchiveJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  @Cron('15 4 * * 0')
  async archiveWeekly(): Promise<void> {
    const days = Math.max(
      30,
      Number(process.env.AUDIT_LOG_RETENTION_HOT_DAYS ?? 730) || 730,
    );
    const tenants = await this.tenantService.findAll();
    for (const tenant of tenants) {
      if (tenant.status !== 'active') continue;
      try {
        await this.prisma.withTenantSchema(tenant.schemaName, async (tx) => {
          await tx.$executeRawUnsafe(
            `WITH picked AS (
               SELECT id FROM audit_logs
               WHERE created_at < (CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day'))
               ORDER BY created_at ASC
               LIMIT 2000
             ),
             ins AS (
               INSERT INTO audit_log_archive (id, archived_at, row_data)
               SELECT al.id, CURRENT_TIMESTAMP, to_jsonb(al.*)
               FROM audit_logs al
               INNER JOIN picked p ON p.id = al.id
               RETURNING id
             )
             DELETE FROM audit_logs al
             USING ins WHERE al.id = ins.id`,
            days,
          );
        });
      } catch (err) {
        this.logger.warn(
          `Audit archive skipped for ${tenant.schemaName}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
