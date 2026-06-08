import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { aggregateImportCenterDashboard } from './import-center-dashboard.util';
import {
  buildImportCenterWhere,
  sanitizeImportCenterFilters,
} from './import-center-query.util';
import type {
  ImportAuditEvent,
  ImportCenterDashboard,
  ImportCenterFilters,
  ImportCenterJobListItem,
  ImportJob,
  ImportJobActor,
  ImportJobListItem,
  ImportJobRow,
  ImportJobRowCounts,
  ImportJobStatus,
  ImportJobSummary,
  ImportRowValidationResult,
  ParsedImportRow,
} from './types/import.types';

function mapActor(
  id: string | null,
  name: string | null,
  email: string | null,
): ImportJobActor | null {
  if (!id) return null;
  return { id, name: name ?? null, email: email ?? null };
}

function mapJob(r: {
  id: string;
  import_type: string;
  status: string;
  file_name: string | null;
  file_sha256: string | null;
  policy_snapshot: unknown;
  summary: unknown;
  total_rows: number;
  processed_rows: number;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  committed_at: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  updated_at: string;
}): ImportJob {
  return {
    id: r.id,
    importType: r.import_type,
    status: r.status as ImportJobStatus,
    fileName: r.file_name,
    fileSha256: r.file_sha256,
    policySnapshot: (r.policy_snapshot ?? {}) as Record<string, unknown>,
    summary: (r.summary ?? null) as ImportJobSummary | null,
    totalRows: Number(r.total_rows ?? 0),
    processedRows: Number(r.processed_rows ?? 0),
    errorMessage: r.error_message,
    retryCount: Number(r.retry_count ?? 0),
    maxRetries: Number(r.max_retries ?? 3),
    createdBy: r.created_by,
    confirmedBy: r.confirmed_by,
    confirmedAt: r.confirmed_at,
    committedAt: r.committed_at,
    reversedAt: r.reversed_at,
    reversedBy: r.reversed_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

@Injectable()
export class ImportJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraftJob(
    schemaName: string,
    input: {
      importType: string;
      fileName: string;
      fileStoragePath: string;
      fileSha256: string;
      createdBy: string | null;
      policySnapshot?: Record<string, unknown>;
    },
  ): Promise<{ id: string }> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO import_jobs (
           import_type, status, file_name, file_storage_path, file_sha256,
           policy_snapshot, created_by
         )
         VALUES ($1, 'draft', $2, $3, $4, $5::jsonb, $6::uuid)
         RETURNING id::text AS id`,
        input.importType,
        input.fileName,
        input.fileStoragePath,
        input.fileSha256,
        JSON.stringify(input.policySnapshot ?? {}),
        input.createdBy,
      );
      if (!row) throw new Error('Failed to create import job');
      return { id: row.id };
    });
  }

  async getJob(schemaName: string, jobId: string): Promise<ImportJob | null> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          import_type: string;
          status: string;
          file_name: string | null;
          file_sha256: string | null;
          policy_snapshot: unknown;
          summary: unknown;
          total_rows: number;
          processed_rows: number;
          error_message: string | null;
          retry_count: number;
          max_retries: number;
          created_by: string | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          committed_at: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          created_at: string;
          updated_at: string;
        }>
      >(
        `SELECT id::text, import_type, status, file_name, file_sha256,
                policy_snapshot, summary,
                COALESCE(total_rows, 0)::int AS total_rows,
                COALESCE(processed_rows, 0)::int AS processed_rows,
                error_message,
                COALESCE(retry_count, 0)::int AS retry_count,
                COALESCE(max_retries, 3)::int AS max_retries,
                created_by::text, confirmed_by::text,
                confirmed_at::text, committed_at::text,
                reversed_at::text, reversed_by::text,
                created_at::text, updated_at::text
         FROM import_jobs WHERE id = $1::uuid`,
        jobId,
      );
      const r = rows[0];
      return r ? mapJob(r) : null;
    });
  }

  async listJobs(
    schemaName: string,
    importType: string,
    limit = 20,
    offset = 0,
  ): Promise<{ jobs: ImportJob[]; total: number }> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM import_jobs WHERE import_type = $1`,
        importType,
      );
      const rows = await tx.$queryRawUnsafe<Parameters<typeof mapJob>[0][]>(
        `SELECT id::text, import_type, status, file_name, file_sha256,
                policy_snapshot, summary,
                COALESCE(total_rows, 0)::int AS total_rows,
                COALESCE(processed_rows, 0)::int AS processed_rows,
                error_message,
                COALESCE(retry_count, 0)::int AS retry_count,
                COALESCE(max_retries, 3)::int AS max_retries,
                created_by::text, confirmed_by::text,
                confirmed_at::text, committed_at::text,
                reversed_at::text, reversed_by::text,
                created_at::text, updated_at::text
         FROM import_jobs
         WHERE import_type = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        importType,
        limit,
        offset,
      );
      return {
        jobs: rows.map(mapJob),
        total: Number(countRow?.c ?? 0),
      };
    });
  }

  async updateStatus(
    schemaName: string,
    jobId: string,
    status: ImportJobStatus,
    extra?: {
      errorMessage?: string;
      summary?: ImportJobSummary;
      processedRows?: number;
      totalRows?: number;
      committedAt?: boolean;
    },
  ): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE import_jobs SET
           status = $2,
           error_message = COALESCE($3, error_message),
           summary = COALESCE($4::jsonb, summary),
           processed_rows = COALESCE($5, processed_rows),
           total_rows = COALESCE($6, total_rows),
           committed_at = CASE WHEN $7 THEN CURRENT_TIMESTAMP ELSE committed_at END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        jobId,
        status,
        extra?.errorMessage ?? null,
        extra?.summary ? JSON.stringify(extra.summary) : null,
        extra?.processedRows ?? null,
        extra?.totalRows ?? null,
        extra?.committedAt ?? false,
      );
    });
  }

  async confirmJob(
    schemaName: string,
    jobId: string,
    userId: string | null,
  ): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM import_jobs WHERE id = $1::uuid FOR UPDATE`,
        jobId,
      );
      if (!row) throw new NotFoundException('Import job not found');
      if (row.status !== 'preview') {
        throw new Error(`Job must be in preview status, got ${row.status}`);
      }
      await tx.$executeRawUnsafe(
        `UPDATE import_jobs SET
           status = 'confirmed',
           confirmed_by = $2::uuid,
           confirmed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        jobId,
        userId,
      );
    });
  }

  async bulkInsertRows(
    schemaName: string,
    jobId: string,
    rows: Array<{ rowNumber: number; rawData: Record<string, unknown> }>,
  ): Promise<void> {
    if (!rows.length) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const json = JSON.stringify(
        slice.map((r) => ({
          row_number: r.rowNumber,
          raw_data: r.rawData,
        })),
      );
      await this.prisma.withTenantSchema(schemaName, async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO import_job_rows (job_id, row_number, raw_data)
           SELECT $1::uuid, x.row_number, x.raw_data::jsonb
           FROM jsonb_to_recordset($2::jsonb) AS x(
             row_number int,
             raw_data jsonb
           )`,
          jobId,
          json,
        );
      });
    }
  }

  async updateRowValidation(
    schemaName: string,
    rowId: string,
    parsedData: ParsedImportRow | null,
    validationResult: ImportRowValidationResult,
  ): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE import_job_rows SET
           parsed_data = $2::jsonb,
           validation_result = $3::jsonb
         WHERE id = $1::uuid`,
        rowId,
        parsedData ? JSON.stringify(parsedData) : null,
        JSON.stringify(validationResult),
      );
    });
  }

  async updatePreviewRowsRawData(
    schemaName: string,
    jobId: string,
    rows: Array<{ id: string; rawData: Record<string, unknown> }>,
  ): Promise<void> {
    if (!rows.length) return;
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [job] = await tx.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT status FROM import_jobs WHERE id = $1::uuid FOR UPDATE`,
        jobId,
      );
      if (!job) throw new NotFoundException('Import job not found');
      if (job.status !== 'preview' && job.status !== 'failed') {
        throw new BadRequestException(
          `Only preview or failed imports can be edited (status: ${job.status})`,
        );
      }

      for (const row of rows) {
        await tx.$executeRawUnsafe(
          `UPDATE import_job_rows SET
             raw_data = $3::jsonb,
             parsed_data = NULL,
             validation_result = NULL,
             commit_status = 'pending',
             commit_error = NULL,
             resolved_product_id = NULL,
             resolved_batch_id = NULL,
             opening_stock_record_id = NULL
           WHERE id = $1::uuid
             AND job_id = $2::uuid`,
          row.id,
          jobId,
          JSON.stringify(row.rawData),
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE import_jobs SET
           status = 'draft',
           summary = NULL,
           processed_rows = 0,
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::uuid`,
        jobId,
      );
    });
  }

  async getJobRows(
    schemaName: string,
    jobId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: ImportJobRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM import_job_rows WHERE job_id = $1::uuid`,
        jobId,
      );
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          job_id: string;
          row_number: number;
          raw_data: unknown;
          parsed_data: unknown;
          validation_result: unknown;
          commit_status: string;
          commit_error: string | null;
          resolved_product_id: string | null;
          resolved_batch_id: string | null;
          opening_stock_record_id: string | null;
        }>
      >(
        `SELECT id::text, job_id::text, row_number,
                raw_data, parsed_data, validation_result,
                commit_status, commit_error,
                resolved_product_id::text,
                resolved_batch_id::text,
                opening_stock_record_id::text
         FROM import_job_rows
         WHERE job_id = $1::uuid
         ORDER BY row_number ASC
         LIMIT $2 OFFSET $3`,
        jobId,
        pageSize,
        offset,
      );
      return {
        total: Number(countRow?.c ?? 0),
        rows: rows.map((r) => ({
          id: r.id,
          jobId: r.job_id,
          rowNumber: r.row_number,
          rawData: (r.raw_data ?? {}) as Record<string, unknown>,
          parsedData: (r.parsed_data ?? null) as ParsedImportRow | null,
          validationResult: (r.validation_result ??
            null) as ImportRowValidationResult | null,
          commitStatus: r.commit_status as ImportJobRow['commitStatus'],
          commitError: r.commit_error,
          resolvedProductId: r.resolved_product_id,
          resolvedBatchId: r.resolved_batch_id,
          openingStockRecordId: r.opening_stock_record_id,
        })),
      };
    });
  }

  async getAllJobRowsForCommit(
    schemaName: string,
    jobId: string,
    offset: number,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      rowNumber: number;
      parsedData: ParsedImportRow;
      validationResult: ImportRowValidationResult;
      commitStatus: string;
    }>
  > {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          row_number: number;
          parsed_data: unknown;
          validation_result: unknown;
          commit_status: string;
        }>
      >(
        `SELECT id::text, row_number, parsed_data, validation_result, commit_status
         FROM import_job_rows
         WHERE job_id = $1::uuid
           AND commit_status = 'pending'
           AND parsed_data IS NOT NULL
           AND validation_result IS NOT NULL
         ORDER BY row_number ASC
         OFFSET $2 LIMIT $3`,
        jobId,
        offset,
        limit,
      );
      return rows
        .filter((r) => {
          const vr = r.validation_result as ImportRowValidationResult | null;
          return vr && (!vr.errors || vr.errors.length === 0);
        })
        .map((r) => ({
          id: r.id,
          rowNumber: r.row_number,
          parsedData: r.parsed_data as ParsedImportRow,
          validationResult: r.validation_result as ImportRowValidationResult,
          commitStatus: r.commit_status,
        }));
    });
  }

  async markRowCommitted(
    schemaName: string,
    rowId: string,
    productId: string | null,
    batchId: string | null,
    openingStockId: string | null,
  ): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE import_job_rows SET
           commit_status = 'committed',
           resolved_product_id = $2::uuid,
           resolved_batch_id = $3::uuid,
           opening_stock_record_id = $4::uuid
         WHERE id = $1::uuid`,
        rowId,
        productId,
        batchId,
        openingStockId,
      );
    });
  }

  async markRowFailed(
    schemaName: string,
    rowId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE import_job_rows SET
           commit_status = 'failed',
           commit_error = $2
         WHERE id = $1::uuid`,
        rowId,
        message.slice(0, 4000),
      );
    });
  }

  async claimCommittingJob(schemaName: string): Promise<ImportJob | null> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Parameters<typeof mapJob>[0][]>(
        `WITH picked AS (
           SELECT id FROM import_jobs
           WHERE status = 'committing'
           ORDER BY created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE import_jobs j SET
           updated_at = CURRENT_TIMESTAMP
         FROM picked
         WHERE j.id = picked.id
         RETURNING j.id::text, j.import_type, j.status, j.file_name, j.file_sha256,
                   j.policy_snapshot, j.summary,
                   COALESCE(j.total_rows, 0)::int AS total_rows,
                   COALESCE(j.processed_rows, 0)::int AS processed_rows,
                   j.error_message,
                   COALESCE(j.retry_count, 0)::int AS retry_count,
                   COALESCE(j.max_retries, 3)::int AS max_retries,
                   j.created_by::text, j.confirmed_by::text,
                   j.confirmed_at::text, j.committed_at::text,
                   j.reversed_at::text, j.reversed_by::text,
                   j.created_at::text, j.updated_at::text`,
      );
      const r = rows[0];
      return r ? mapJob(r) : null;
    });
  }

  async releaseStaleCommittingJobs(schemaName: string): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE import_jobs SET
           retry_count = retry_count + 1,
           status = CASE
             WHEN retry_count + 1 >= COALESCE(NULLIF(max_retries, 0), 3)
             THEN 'failed'::varchar
             ELSE 'confirmed'::varchar
           END,
           error_message = LEFT(COALESCE(error_message, '') || ' [released stale committing]', 4000),
           updated_at = CURRENT_TIMESTAMP
         WHERE status = 'committing'
           AND updated_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'`,
      );
    });
  }

  async countPendingCommitRows(
    schemaName: string,
    jobId: string,
  ): Promise<number> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM import_job_rows
         WHERE job_id = $1::uuid AND commit_status = 'pending'
           AND parsed_data IS NOT NULL
           AND (validation_result->'errors' IS NULL
                OR jsonb_array_length(validation_result->'errors') = 0)`,
        jobId,
      );
      return Number(row?.c ?? 0);
    });
  }

  async getFileStoragePath(
    schemaName: string,
    jobId: string,
  ): Promise<string | null> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ path: string | null }>>(
        `SELECT file_storage_path AS path FROM import_jobs WHERE id = $1::uuid`,
        jobId,
      );
      return row?.path ?? null;
    });
  }

  async getJobRowCounts(
    schemaName: string,
    jobId: string,
  ): Promise<ImportJobRowCounts> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{ commit_status: string; c: number }>
      >(
        `SELECT commit_status, COUNT(*)::int AS c
         FROM import_job_rows
         WHERE job_id = $1::uuid
         GROUP BY commit_status`,
        jobId,
      );
      const counts: ImportJobRowCounts = {
        committed: 0,
        failed: 0,
        skipped: 0,
        reversed: 0,
        pending: 0,
      };
      for (const r of rows) {
        const key = r.commit_status as keyof ImportJobRowCounts;
        if (key in counts) {
          counts[key] = Number(r.c);
        }
      }
      return counts;
    });
  }

  async getJobRowsFiltered(
    schemaName: string,
    jobId: string,
    page: number,
    pageSize: number,
    filter: 'all' | 'errors' | 'committed' = 'all',
  ): Promise<{ rows: ImportJobRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const filterClause =
      filter === 'errors'
        ? `AND (
             commit_status = 'failed'
             OR (
               validation_result IS NOT NULL
               AND validation_result->'errors' IS NOT NULL
               AND jsonb_array_length(validation_result->'errors') > 0
             )
             OR (
               validation_result IS NOT NULL
               AND validation_result->'warnings' IS NOT NULL
               AND jsonb_array_length(validation_result->'warnings') > 0
             )
           )`
        : filter === 'committed'
          ? `AND commit_status IN ('committed', 'reversed')`
          : '';

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM import_job_rows
         WHERE job_id = $1::uuid ${filterClause}`,
        jobId,
      );
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          job_id: string;
          row_number: number;
          raw_data: unknown;
          parsed_data: unknown;
          validation_result: unknown;
          commit_status: string;
          commit_error: string | null;
          resolved_product_id: string | null;
          resolved_batch_id: string | null;
          opening_stock_record_id: string | null;
        }>
      >(
        `SELECT id::text, job_id::text, row_number,
                raw_data, parsed_data, validation_result,
                commit_status, commit_error,
                resolved_product_id::text,
                resolved_batch_id::text,
                opening_stock_record_id::text
         FROM import_job_rows
         WHERE job_id = $1::uuid ${filterClause}
         ORDER BY row_number ASC
         LIMIT $2 OFFSET $3`,
        jobId,
        pageSize,
        offset,
      );
      return {
        total: Number(countRow?.c ?? 0),
        rows: rows.map((r) => ({
          id: r.id,
          jobId: r.job_id,
          rowNumber: r.row_number,
          rawData: (r.raw_data ?? {}) as Record<string, unknown>,
          parsedData: (r.parsed_data ?? null) as ParsedImportRow | null,
          validationResult: (r.validation_result ??
            null) as ImportRowValidationResult | null,
          commitStatus: r.commit_status as ImportJobRow['commitStatus'],
          commitError: r.commit_error,
          resolvedProductId: r.resolved_product_id,
          resolvedBatchId: r.resolved_batch_id,
          openingStockRecordId: r.opening_stock_record_id,
        })),
      };
    });
  }

  async hasDownloadableErrors(
    schemaName: string,
    jobId: string,
    summary: ImportJobSummary | null,
  ): Promise<boolean> {
    if ((summary?.errorRows ?? 0) > 0 || (summary?.warningRows ?? 0) > 0) {
      return true;
    }
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM import_job_rows
         WHERE job_id = $1::uuid
           AND (
             commit_status = 'failed'
             OR (
               validation_result IS NOT NULL
               AND validation_result->'errors' IS NOT NULL
               AND jsonb_array_length(validation_result->'errors') > 0
             )
             OR (
               validation_result IS NOT NULL
               AND validation_result->'warnings' IS NOT NULL
               AND jsonb_array_length(validation_result->'warnings') > 0
             )
           )`,
        jobId,
      );
      return Number(row?.c ?? 0) > 0;
    });
  }

  async listJobsEnriched(
    schemaName: string,
    importType: string,
    limit = 20,
    offset = 0,
  ): Promise<{ jobs: ImportJobListItem[]; total: number }> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM import_jobs WHERE import_type = $1`,
        importType,
      );
      const rows = await tx.$queryRawUnsafe<
        Array<
          Parameters<typeof mapJob>[0] & {
            created_by_name: string | null;
            created_by_email: string | null;
            confirmed_by_name: string | null;
            confirmed_by_email: string | null;
            reversed_by_name: string | null;
            reversed_by_email: string | null;
          }
        >
      >(
        `SELECT j.id::text, j.import_type, j.status, j.file_name, j.file_sha256,
                j.policy_snapshot, j.summary,
                COALESCE(j.total_rows, 0)::int AS total_rows,
                COALESCE(j.processed_rows, 0)::int AS processed_rows,
                j.error_message,
                COALESCE(j.retry_count, 0)::int AS retry_count,
                COALESCE(j.max_retries, 3)::int AS max_retries,
                j.created_by::text, j.confirmed_by::text,
                j.confirmed_at::text, j.committed_at::text,
                j.reversed_at::text, j.reversed_by::text,
                j.created_at::text, j.updated_at::text,
                cu.name AS created_by_name, cu.email AS created_by_email,
                cf.name AS confirmed_by_name, cf.email AS confirmed_by_email,
                ru.name AS reversed_by_name, ru.email AS reversed_by_email
         FROM import_jobs j
         LEFT JOIN users cu ON cu.id = j.created_by
         LEFT JOIN users cf ON cf.id = j.confirmed_by
         LEFT JOIN users ru ON ru.id = j.reversed_by
         WHERE j.import_type = $1
         ORDER BY j.created_at DESC
         LIMIT $2 OFFSET $3`,
        importType,
        limit,
        offset,
      );
      return {
        jobs: rows.map((r) => ({
          ...mapJob(r),
          createdByUser: mapActor(
            r.created_by,
            r.created_by_name,
            r.created_by_email,
          ),
          confirmedByUser: mapActor(
            r.confirmed_by,
            r.confirmed_by_name,
            r.confirmed_by_email,
          ),
          reversedByUser: mapActor(
            r.reversed_by,
            r.reversed_by_name,
            r.reversed_by_email,
          ),
        })),
        total: Number(countRow?.c ?? 0),
      };
    });
  }

  async getJobActors(
    schemaName: string,
    jobId: string,
  ): Promise<{
    createdByUser: ImportJobActor | null;
    confirmedByUser: ImportJobActor | null;
    reversedByUser: ImportJobActor | null;
  }> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<
        Array<{
          created_by: string | null;
          confirmed_by: string | null;
          reversed_by: string | null;
          created_by_name: string | null;
          created_by_email: string | null;
          confirmed_by_name: string | null;
          confirmed_by_email: string | null;
          reversed_by_name: string | null;
          reversed_by_email: string | null;
        }>
      >(
        `SELECT j.created_by::text, j.confirmed_by::text, j.reversed_by::text,
                cu.name AS created_by_name, cu.email AS created_by_email,
                cf.name AS confirmed_by_name, cf.email AS confirmed_by_email,
                ru.name AS reversed_by_name, ru.email AS reversed_by_email
         FROM import_jobs j
         LEFT JOIN users cu ON cu.id = j.created_by
         LEFT JOIN users cf ON cf.id = j.confirmed_by
         LEFT JOIN users ru ON ru.id = j.reversed_by
         WHERE j.id = $1::uuid`,
        jobId,
      );
      if (!row) {
        return {
          createdByUser: null,
          confirmedByUser: null,
          reversedByUser: null,
        };
      }
      return {
        createdByUser: mapActor(
          row.created_by,
          row.created_by_name,
          row.created_by_email,
        ),
        confirmedByUser: mapActor(
          row.confirmed_by,
          row.confirmed_by_name,
          row.confirmed_by_email,
        ),
        reversedByUser: mapActor(
          row.reversed_by,
          row.reversed_by_name,
          row.reversed_by_email,
        ),
      };
    });
  }

  async getImportJobAudit(
    schemaName: string,
    jobId: string,
    limit = 500,
  ): Promise<ImportAuditEvent[]> {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          event_ts: string;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          branch_id: string | null;
          user_id: string | null;
          user_name: string | null;
          user_email: string | null;
          after_json: unknown;
          row_number: number | null;
          item_no: string | null;
          product_name: string | null;
        }>
      >(
        `WITH job_products AS (
           SELECT resolved_product_id::text AS product_id
           FROM import_job_rows
           WHERE job_id = $1::uuid AND resolved_product_id IS NOT NULL
         ),
         job_opening AS (
           SELECT id::text AS entry_id
           FROM opening_stock_entries
           WHERE import_job_id = $1::uuid
         )
         SELECT al.id::text AS id,
                al.event_ts::text AS event_ts,
                al.action,
                al.entity_type,
                al.entity_id,
                al.branch_id::text AS branch_id,
                al.user_id::text AS user_id,
                u.name AS user_name,
                u.email AS user_email,
                al.after_json,
                ijr.row_number,
                COALESCE(
                  ijr.parsed_data->>'itemNo',
                  ijr.raw_data->>'item_no'
                ) AS item_no,
                COALESCE(
                  ijr.parsed_data->>'name',
                  ijr.raw_data->>'name'
                ) AS product_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN import_job_rows ijr ON (
           (al.entity_type = 'product' AND ijr.resolved_product_id::text = al.entity_id)
           OR (al.entity_type = 'opening_stock_entry' AND ijr.opening_stock_record_id::text = al.entity_id)
         ) AND ijr.job_id = $1::uuid
         WHERE (
           (al.entity_type = 'import_job' AND al.entity_id = $1::text)
           OR (al.entity_type = 'product' AND al.entity_id IN (SELECT product_id FROM job_products))
           OR (al.entity_type = 'opening_stock_entry' AND al.entity_id IN (SELECT entry_id FROM job_opening))
         )
         ORDER BY al.event_ts ASC, al.id ASC
         LIMIT $2`,
        jobId,
        Math.min(1000, Math.max(1, limit)),
      );

      return rows.map((r) => ({
        id: r.id,
        eventAt: r.event_ts,
        action: r.action,
        entityType: r.entity_type ?? 'unknown',
        entityId: r.entity_id ?? r.id,
        actor: mapActor(r.user_id, r.user_name, r.user_email),
        branchId: r.branch_id,
        details:
          r.after_json && typeof r.after_json === 'object'
            ? (r.after_json as Record<string, unknown>)
            : null,
        rowNumber: r.row_number != null ? Number(r.row_number) : null,
        itemNo: r.item_no,
        productName: r.product_name,
      }));
    });
  }

  async getImportCenterDashboard(
    schemaName: string,
    rawFilters: Partial<ImportCenterFilters>,
  ): Promise<ImportCenterDashboard> {
    const filters = sanitizeImportCenterFilters({
      ...rawFilters,
      limit: undefined,
      offset: undefined,
      status: undefined,
    });
    const { whereSql, params } = buildImportCenterWhere(filters, 'j');

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const statusRows = await tx.$queryRawUnsafe<
        Array<{ status: string; c: number }>
      >(
        `SELECT j.status, COUNT(*)::int AS c
         FROM import_jobs j
         ${whereSql}
         GROUP BY j.status`,
        ...params,
      );

      const typeRows = await tx.$queryRawUnsafe<
        Array<{ import_type: string; c: number }>
      >(
        `SELECT j.import_type, COUNT(*)::int AS c
         FROM import_jobs j
         ${whereSql}
         GROUP BY j.import_type`,
        ...params,
      );

      return aggregateImportCenterDashboard(statusRows, typeRows);
    });
  }

  async listImportCenterJobs(
    schemaName: string,
    rawFilters: Partial<ImportCenterFilters>,
  ): Promise<{ jobs: ImportCenterJobListItem[]; total: number }> {
    const filters = sanitizeImportCenterFilters(rawFilters);
    const { whereSql, params, nextParam } = buildImportCenterWhere(
      filters,
      'j',
    );
    const limitIdx = nextParam;
    const offsetIdx = nextParam + 1;
    const listParams = [...params, filters.limit!, filters.offset!];

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM import_jobs j ${whereSql}`,
        ...params,
      );

      const rows = await tx.$queryRawUnsafe<
        Array<
          Parameters<typeof mapJob>[0] & {
            created_by_name: string | null;
            created_by_email: string | null;
            confirmed_by_name: string | null;
            confirmed_by_email: string | null;
            reversed_by_name: string | null;
            reversed_by_email: string | null;
            duration_seconds: number | null;
          }
        >
      >(
        `SELECT j.id::text, j.import_type, j.status, j.file_name, j.file_sha256,
                j.policy_snapshot, j.summary,
                COALESCE(j.total_rows, 0)::int AS total_rows,
                COALESCE(j.processed_rows, 0)::int AS processed_rows,
                j.error_message,
                COALESCE(j.retry_count, 0)::int AS retry_count,
                COALESCE(j.max_retries, 3)::int AS max_retries,
                j.created_by::text, j.confirmed_by::text,
                j.confirmed_at::text, j.committed_at::text,
                j.reversed_at::text, j.reversed_by::text,
                j.created_at::text, j.updated_at::text,
                cu.name AS created_by_name, cu.email AS created_by_email,
                cf.name AS confirmed_by_name, cf.email AS confirmed_by_email,
                ru.name AS reversed_by_name, ru.email AS reversed_by_email,
                EXTRACT(EPOCH FROM (
                  COALESCE(j.committed_at, j.updated_at) - j.created_at
                ))::float AS duration_seconds
         FROM import_jobs j
         LEFT JOIN users cu ON cu.id = j.created_by
         LEFT JOIN users cf ON cf.id = j.confirmed_by
         LEFT JOIN users ru ON ru.id = j.reversed_by
         ${whereSql}
         ORDER BY j.created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        ...listParams,
      );

      return {
        jobs: rows.map((r) => ({
          ...mapJob(r),
          createdByUser: mapActor(
            r.created_by,
            r.created_by_name,
            r.created_by_email,
          ),
          confirmedByUser: mapActor(
            r.confirmed_by,
            r.confirmed_by_name,
            r.confirmed_by_email,
          ),
          reversedByUser: mapActor(
            r.reversed_by,
            r.reversed_by_name,
            r.reversed_by_email,
          ),
          durationSeconds:
            r.duration_seconds != null && Number.isFinite(r.duration_seconds)
              ? Math.round(Number(r.duration_seconds))
              : null,
        })),
        total: Number(countRow?.c ?? 0),
      };
    });
  }

  async listRunningImportJobs(
    schemaName: string,
    limit = 20,
  ): Promise<ImportJobListItem[]> {
    const cap = Math.min(50, Math.max(1, limit));
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<
          Parameters<typeof mapJob>[0] & {
            created_by_name: string | null;
            created_by_email: string | null;
            confirmed_by_name: string | null;
            confirmed_by_email: string | null;
            reversed_by_name: string | null;
            reversed_by_email: string | null;
          }
        >
      >(
        `SELECT j.id::text, j.import_type, j.status, j.file_name, j.file_sha256,
                j.policy_snapshot, j.summary,
                COALESCE(j.total_rows, 0)::int AS total_rows,
                COALESCE(j.processed_rows, 0)::int AS processed_rows,
                j.error_message,
                COALESCE(j.retry_count, 0)::int AS retry_count,
                COALESCE(j.max_retries, 3)::int AS max_retries,
                j.created_by::text, j.confirmed_by::text,
                j.confirmed_at::text, j.committed_at::text,
                j.reversed_at::text, j.reversed_by::text,
                j.created_at::text, j.updated_at::text,
                cu.name AS created_by_name, cu.email AS created_by_email,
                cf.name AS confirmed_by_name, cf.email AS confirmed_by_email,
                ru.name AS reversed_by_name, ru.email AS reversed_by_email
         FROM import_jobs j
         LEFT JOIN users cu ON cu.id = j.created_by
         LEFT JOIN users cf ON cf.id = j.confirmed_by
         LEFT JOIN users ru ON ru.id = j.reversed_by
         WHERE j.status IN ('validating', 'committing')
         ORDER BY j.updated_at DESC
         LIMIT $1`,
        cap,
      );
      return rows.map((r) => ({
        ...mapJob(r),
        createdByUser: mapActor(
          r.created_by,
          r.created_by_name,
          r.created_by_email,
        ),
        confirmedByUser: mapActor(
          r.confirmed_by,
          r.confirmed_by_name,
          r.confirmed_by_email,
        ),
        reversedByUser: mapActor(
          r.reversed_by,
          r.reversed_by_name,
          r.reversed_by_email,
        ),
      }));
    });
  }

  async listFailedImportJobs(
    schemaName: string,
    limit = 10,
    offset = 0,
  ): Promise<{ jobs: ImportJobListItem[]; total: number }> {
    const cap = Math.min(50, Math.max(1, limit));
    const off = Math.max(0, offset);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT COUNT(*)::int AS c FROM import_jobs WHERE status = 'failed'`,
      );
      const rows = await tx.$queryRawUnsafe<
        Array<
          Parameters<typeof mapJob>[0] & {
            created_by_name: string | null;
            created_by_email: string | null;
            confirmed_by_name: string | null;
            confirmed_by_email: string | null;
            reversed_by_name: string | null;
            reversed_by_email: string | null;
          }
        >
      >(
        `SELECT j.id::text, j.import_type, j.status, j.file_name, j.file_sha256,
                j.policy_snapshot, j.summary,
                COALESCE(j.total_rows, 0)::int AS total_rows,
                COALESCE(j.processed_rows, 0)::int AS processed_rows,
                j.error_message,
                COALESCE(j.retry_count, 0)::int AS retry_count,
                COALESCE(j.max_retries, 3)::int AS max_retries,
                j.created_by::text, j.confirmed_by::text,
                j.confirmed_at::text, j.committed_at::text,
                j.reversed_at::text, j.reversed_by::text,
                j.created_at::text, j.updated_at::text,
                cu.name AS created_by_name, cu.email AS created_by_email,
                cf.name AS confirmed_by_name, cf.email AS confirmed_by_email,
                ru.name AS reversed_by_name, ru.email AS reversed_by_email
         FROM import_jobs j
         LEFT JOIN users cu ON cu.id = j.created_by
         LEFT JOIN users cf ON cf.id = j.confirmed_by
         LEFT JOIN users ru ON ru.id = j.reversed_by
         WHERE j.status = 'failed'
         ORDER BY j.created_at DESC
         LIMIT $1 OFFSET $2`,
        cap,
        off,
      );
      return {
        jobs: rows.map((r) => ({
          ...mapJob(r),
          createdByUser: mapActor(
            r.created_by,
            r.created_by_name,
            r.created_by_email,
          ),
          confirmedByUser: mapActor(
            r.confirmed_by,
            r.confirmed_by_name,
            r.confirmed_by_email,
          ),
          reversedByUser: mapActor(
            r.reversed_by,
            r.reversed_by_name,
            r.reversed_by_email,
          ),
        })),
        total: Number(countRow?.c ?? 0),
      };
    });
  }
}
