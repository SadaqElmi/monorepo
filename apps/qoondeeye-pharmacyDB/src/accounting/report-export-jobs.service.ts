import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ReportExportJobParams = {
  branchIds: string[];
  from?: string;
  to?: string;
  asOf?: string;
  scopeHash?: string;
  consolidated?: boolean;
};

export type ReportExportJobRow = {
  id: string;
  reportType: string;
  format: string;
  params: ReportExportJobParams;
  status: string;
  storagePath: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

@Injectable()
export class ReportExportJobsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Re-queue or fail jobs stuck in `processing` (e.g. worker crash). */
  async releaseStaleProcessingJobs(schemaName: string): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE report_export_jobs
         SET
           retry_count = retry_count + 1,
           error_message = LEFT(
             COALESCE(error_message, '') || ' [released stale processing]',
             4000
           ),
           status = CASE
             WHEN retry_count + 1 >= COALESCE(NULLIF(max_retries, 0), 3)
             THEN 'failed'::varchar
             ELSE 'pending'::varchar
           END,
           updated_at = CURRENT_TIMESTAMP
         WHERE status = 'processing'
           AND updated_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'`,
      );
    });
  }

  async createPendingJob(
    schemaName: string,
    input: {
      reportType: string;
      format: string;
      params: ReportExportJobParams;
      createdBy: string | null;
      ttlHours?: number;
    },
  ): Promise<{ id: string }> {
    const ttlHours = input.ttlHours ?? 24;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO report_export_jobs (
           report_type, format, params, status, expires_at, created_by
         )
         VALUES (
           $1::varchar,
           $2::varchar,
           $3::jsonb,
           'pending',
           CURRENT_TIMESTAMP + ($4::int * INTERVAL '1 hour'),
           $5::uuid
         )
         RETURNING id::text AS id`,
        input.reportType,
        input.format,
        JSON.stringify(input.params),
        ttlHours,
        input.createdBy,
      );
      if (!row) {
        throw new Error('Failed to create export job');
      }
      return { id: row.id };
    });
  }

  async getJob(
    schemaName: string,
    jobId: string,
  ): Promise<ReportExportJobRow | null> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          report_type: string;
          format: string;
          params: unknown;
          status: string;
          storage_path: string | null;
          error_message: string | null;
          retry_count: number;
          max_retries: number;
          created_at: string;
          updated_at: string;
          expires_at: string;
        }>
      >(
        `SELECT id::text,
                report_type,
                format,
                params,
                status,
                storage_path,
                error_message,
                COALESCE(retry_count, 0)::int AS retry_count,
                COALESCE(max_retries, 3)::int AS max_retries,
                created_at::text,
                updated_at::text,
                expires_at::text
         FROM report_export_jobs
         WHERE id = $1::uuid`,
        jobId,
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        reportType: r.report_type,
        format: r.format,
        params: (r.params ?? {}) as ReportExportJobParams,
        status: r.status,
        storagePath: r.storage_path,
        errorMessage: r.error_message,
        retryCount: Number(r.retry_count ?? 0),
        maxRetries: Number(r.max_retries ?? 3),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        expiresAt: r.expires_at,
      };
    });
  }

  async claimNextPending(schemaName: string): Promise<{
    id: string;
    reportType: string;
    format: string;
    params: ReportExportJobParams;
  } | null> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          report_type: string;
          format: string;
          params: unknown;
        }>
      >(
        `WITH picked AS (
           SELECT id
           FROM report_export_jobs
           WHERE status = 'pending'
             AND expires_at > CURRENT_TIMESTAMP
           ORDER BY created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE report_export_jobs j
         SET status = 'processing',
             updated_at = CURRENT_TIMESTAMP
         FROM picked
         WHERE j.id = picked.id
         RETURNING j.id::text,
                   j.report_type,
                   j.format,
                   j.params`,
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        reportType: r.report_type,
        format: r.format,
        params: (r.params ?? {}) as ReportExportJobParams,
      };
    });
  }

  async markCompleted(
    schemaName: string,
    jobId: string,
    storageBasename: string,
  ): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE report_export_jobs
         SET status = 'completed',
             storage_path = $2::text,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
           AND status = 'processing'`,
        jobId,
        storageBasename,
      );
    });
  }

  /**
   * After a failed processing attempt: re-queue until max_retries, or terminal fail.
   */
  async markFailed(
    schemaName: string,
    jobId: string,
    message: string,
    opts?: { terminal?: boolean },
  ): Promise<void> {
    const msg = message.slice(0, 4000);
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      if (opts?.terminal) {
        await tx.$executeRawUnsafe(
          `UPDATE report_export_jobs
           SET status = 'failed',
               error_message = $2::text,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1::uuid`,
          jobId,
          msg,
        );
        return;
      }
      await tx.$executeRawUnsafe(
        `UPDATE report_export_jobs
         SET
           retry_count = retry_count + 1,
           error_message = $2::text,
           status = CASE
             WHEN retry_count + 1 >= COALESCE(NULLIF(max_retries, 0), 3)
             THEN 'failed'::varchar
             ELSE 'pending'::varchar
           END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid
           AND status = 'processing'`,
        jobId,
        msg,
      );
    });
  }
}
