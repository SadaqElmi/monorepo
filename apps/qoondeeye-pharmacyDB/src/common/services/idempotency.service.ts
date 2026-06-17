import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantService } from '../../tenant/tenant.service';
import { OpsMonitoringService } from './ops-monitoring.service';

type ReplayResult =
  | {
      kind: 'proceed';
    }
  | {
      kind: 'replay';
      statusCode: number;
      responseBody: unknown;
    };

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly ensuredSchemas = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly monitoring: OpsMonitoringService,
  ) {}

  private async ensureTable(schemaName: string): Promise<void> {
    if (this.ensuredSchemas.has(schemaName)) return;
    await this.prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "api_idempotency" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        method VARCHAR(12) NOT NULL,
        path TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
        response_status_code INTEGER,
        response_body JSONB,
        error_message TEXT,
        expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_api_idempotency_key ON "api_idempotency"(idempotency_key)`,
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires_at ON "api_idempotency"(expires_at)`,
    );
    this.ensuredSchemas.add(schemaName);
  }

  async beginOrReplay(
    schemaName: string,
    params: {
      idempotencyKey: string;
      requestFingerprint: string;
      method: string;
      path: string;
    },
  ): Promise<ReplayResult> {
    await this.ensureTable(schemaName);
    const { idempotencyKey, requestFingerprint, method, path } = params;
    await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$executeRawUnsafe(
        `DELETE FROM api_idempotency
         WHERE idempotency_key = $1
           AND expires_at < CURRENT_TIMESTAMP`,
        idempotencyKey,
      ),
    );
    const [inserted] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO api_idempotency (idempotency_key, request_fingerprint, method, path, status, expires_at)
         VALUES ($1, $2, $3, $4, 'in_progress', CURRENT_TIMESTAMP + INTERVAL '24 hours')
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        idempotencyKey,
        requestFingerprint,
        method,
        path,
      ),
    );
    if (inserted?.id) {
      return { kind: 'proceed' };
    }

    const [row] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<
        {
          request_fingerprint: string;
          status: string;
          response_status_code: number | null;
          response_body: unknown;
          error_message: string | null;
          expires_at: Date | null;
        }[]
      >(
        `SELECT request_fingerprint, status, response_status_code, response_body, error_message, expires_at
         FROM api_idempotency
         WHERE idempotency_key = $1`,
        idempotencyKey,
      ),
    );
    if (!row) {
      return { kind: 'proceed' };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      await this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$executeRawUnsafe(
          `DELETE FROM api_idempotency WHERE idempotency_key = $1`,
          idempotencyKey,
        ),
      );
      return { kind: 'proceed' };
    }
    if (row.request_fingerprint !== requestFingerprint) {
      await this.monitoring.increment(schemaName, 'idempotency', 'conflict', {
        reason: 'fingerprint_mismatch',
        method,
        path,
      });
      throw new ConflictException(
        'Idempotency key already used for a different request',
      );
    }
    if (row.status === 'in_progress') {
      await this.monitoring.increment(schemaName, 'idempotency', 'conflict', {
        reason: 'still_in_progress',
        method,
        path,
      });
      throw new ConflictException(
        'Request with this idempotency key is already in progress',
      );
    }
    if (row.response_status_code == null) {
      await this.monitoring.increment(schemaName, 'idempotency', 'conflict', {
        reason: 'missing_response_payload',
        method,
        path,
      });
      throw new ConflictException('Missing idempotent response payload');
    }

    await this.monitoring.increment(schemaName, 'idempotency', 'replay', {
      method,
      path,
    });

    return {
      kind: 'replay',
      statusCode: Number(row.response_status_code),
      responseBody: row.response_body,
    };
  }

  async complete(
    schemaName: string,
    idempotencyKey: string,
    statusCode: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.ensureTable(schemaName);
    await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$executeRawUnsafe(
        `UPDATE api_idempotency
         SET status = 'completed',
             response_status_code = $2,
             response_body = $3::jsonb,
             error_message = NULL,
             completed_at = CURRENT_TIMESTAMP
         WHERE idempotency_key = $1`,
        idempotencyKey,
        statusCode,
        JSON.stringify(responseBody ?? null),
      ),
    );
  }

  async fail(
    schemaName: string,
    idempotencyKey: string,
    statusCode: number,
    errorMessage: string,
  ): Promise<void> {
    await this.ensureTable(schemaName);
    await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$executeRawUnsafe(
        `UPDATE api_idempotency
         SET status = 'failed',
             response_status_code = $2,
             response_body = $3::jsonb,
             error_message = $4,
             completed_at = CURRENT_TIMESTAMP
         WHERE idempotency_key = $1`,
        idempotencyKey,
        statusCode,
        JSON.stringify({ message: errorMessage }),
        errorMessage,
      ),
    );
  }

  async cleanupExpired(schemaName: string): Promise<number> {
    await this.ensureTable(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const deleted = await tx.$executeRawUnsafe(
        `DELETE FROM api_idempotency WHERE expires_at < CURRENT_TIMESTAMP`,
      );
      return Number(deleted ?? 0);
    });
  }

  async cleanupExpiredAllTenants(): Promise<number> {
    const tenants = await this.tenantService.findAll();
    let totalDeleted = 0;
    for (const tenant of tenants) {
      if (tenant.status !== 'active') continue;
      const removed = await this.cleanupExpired(tenant.schemaName);
      totalDeleted += removed;
    }
    this.logger.log(
      `Idempotency cleanup removed ${totalDeleted} expired rows across tenants`,
    );
    return totalDeleted;
  }
}
