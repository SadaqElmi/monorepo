import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type AuditPayload = Record<string, unknown> | null;
export type AuditVerifyIssue = {
  id: string;
  eventTs: string;
  entityType: string;
  entityId: string;
  reason:
    | 'missing_hash'
    | 'broken_prev_hash'
    | 'invalid_hash'
    | 'missing_prev_hash';
  expectedPrevHash: string | null;
  actualPrevHash: string | null;
  expectedAuditHash: string | null;
  actualAuditHash: string | null;
};

export type AuditVerifyResult = {
  valid: boolean;
  checkedRows: number;
  lastHash: string | null;
  issues: AuditVerifyIssue[];
};

export type AuditChainRow = {
  id: string;
  branchId: string | null;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  eventTs: string;
  prevHash: string | null;
  auditHash: string | null;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  private hashChainEnforced(): boolean {
    const raw = (process.env.AUDIT_HASH_CHAIN_ENFORCED ?? 'true')
      .trim()
      .toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  private canonicalJson(value: unknown): string {
    const normalize = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map((v) => normalize(v));
      if (input && typeof input === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(input).sort()) {
          out[key] = normalize((input as Record<string, unknown>)[key]);
        }
        return out;
      }
      return input ?? null;
    };
    return JSON.stringify(normalize(value));
  }

  private computeAuditHash(params: {
    prevHash: string | null;
    entityType: string;
    entityId: string;
    action: string;
    branchId: string | null;
    userId: string | null;
    eventTs: string;
    before: AuditPayload;
    after: AuditPayload;
  }): string {
    const payload = [
      params.prevHash ?? '',
      params.entityType,
      params.entityId,
      params.action,
      params.branchId ?? '',
      params.userId ?? '',
      params.eventTs,
      this.canonicalJson(params.before),
      this.canonicalJson(params.after),
    ].join('|');
    return createHash('sha256').update(payload).digest('hex');
  }

  async append(
    tx: Prisma.TransactionClient,
    params: {
      branchId?: string | null;
      actorUserId?: string | null;
      tableName: string;
      recordId: string;
      action: string;
      oldPayload?: AuditPayload;
      newPayload?: AuditPayload;
      entityType?: string;
      entityId?: string;
      eventTs?: string;
    },
  ): Promise<void> {
    const [prev] = await tx.$queryRawUnsafe<
      Array<{ audit_hash: string | null }>
    >(
      `SELECT audit_hash
       FROM audit_logs
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    );
    const prevHash = prev?.audit_hash ?? null;
    const eventTs = params.eventTs ?? new Date().toISOString();
    const entityType = params.entityType ?? params.tableName;
    const entityId = params.entityId ?? params.recordId;
    const auditHash = this.hashChainEnforced()
      ? this.computeAuditHash({
          prevHash,
          entityType,
          entityId,
          action: params.action,
          branchId: params.branchId ?? null,
          userId: params.actorUserId ?? null,
          eventTs,
          before: params.oldPayload ?? null,
          after: params.newPayload ?? null,
        })
      : null;

    await tx.$queryRawUnsafe(
      `INSERT INTO audit_logs (
         branch_id, actor_user_id, table_name, record_id, action, old_payload, new_payload,
         entity_type, entity_id, user_id, before_json, after_json, event_ts, prev_hash, audit_hash
       )
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::jsonb, $7::jsonb, $8, $9, $10::uuid, $11::jsonb, $12::jsonb, $13::timestamptz, $14, $15)`,
      params.branchId ?? null,
      params.actorUserId ?? null,
      params.tableName,
      params.recordId,
      params.action,
      params.oldPayload != null ? JSON.stringify(params.oldPayload) : null,
      params.newPayload != null ? JSON.stringify(params.newPayload) : null,
      entityType,
      entityId,
      params.actorUserId ?? null,
      params.oldPayload != null ? JSON.stringify(params.oldPayload) : null,
      params.newPayload != null ? JSON.stringify(params.newPayload) : null,
      eventTs,
      prevHash,
      auditHash,
    );
  }

  async appendInSchema(
    schemaName: string,
    params: {
      branchId?: string | null;
      actorUserId?: string | null;
      tableName: string;
      recordId: string;
      action: string;
      oldPayload?: AuditPayload;
      newPayload?: AuditPayload;
      entityType?: string;
      entityId?: string;
      eventTs?: string;
    },
  ): Promise<void> {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await this.append(tx, params);
    });
  }

  verifyHashLink(current: {
    prevHash: string | null;
    entityType: string;
    entityId: string;
    action: string;
    branchId: string | null;
    userId: string | null;
    eventTs: string;
    before: AuditPayload;
    after: AuditPayload;
    auditHash: string | null;
  }): boolean {
    if (!current.auditHash) return false;
    return (
      this.computeAuditHash({
        prevHash: current.prevHash,
        entityType: current.entityType,
        entityId: current.entityId,
        action: current.action,
        branchId: current.branchId,
        userId: current.userId,
        eventTs: current.eventTs,
        before: current.before,
        after: current.after,
      }) === current.auditHash
    );
  }

  async verifyChainInSchema(params: {
    schemaName: string;
    branchIds?: string[];
    fromTs?: string;
    toTs?: string;
    limit?: number;
  }): Promise<AuditVerifyResult> {
    return this.prisma.withTenantSchema(params.schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          branch_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          action: string;
          user_id: string | null;
          event_ts: Date | string;
          before_json: unknown;
          after_json: unknown;
          prev_hash: string | null;
          audit_hash: string | null;
        }>
      >(
        `SELECT id::text,
                branch_id::text,
                entity_type,
                entity_id,
                action,
                user_id::text,
                event_ts,
                before_json,
                after_json,
                prev_hash,
                audit_hash
         FROM audit_logs
         WHERE ($1::uuid[] IS NULL OR branch_id = ANY($1::uuid[]))
           AND ($2::timestamptz IS NULL OR event_ts >= $2::timestamptz)
           AND ($3::timestamptz IS NULL OR event_ts <= $3::timestamptz)
         ORDER BY event_ts ASC, id ASC
         LIMIT $4`,
        params.branchIds?.length ? params.branchIds : null,
        params.fromTs?.trim() ? params.fromTs.trim() : null,
        params.toTs?.trim() ? params.toTs.trim() : null,
        Math.min(50000, Math.max(1, params.limit ?? 20000)),
      );

      const issues: AuditVerifyIssue[] = [];
      let previousHash: string | null = null;
      for (const row of rows) {
        const eventTs = new Date(row.event_ts).toISOString();
        const expectedHash = this.computeAuditHash({
          prevHash: row.prev_hash,
          entityType: row.entity_type ?? 'unknown',
          entityId: row.entity_id ?? row.id,
          action: row.action,
          branchId: row.branch_id,
          userId: row.user_id,
          eventTs,
          before:
            row.before_json && typeof row.before_json === 'object'
              ? (row.before_json as Record<string, unknown>)
              : null,
          after:
            row.after_json && typeof row.after_json === 'object'
              ? (row.after_json as Record<string, unknown>)
              : null,
        });
        if (!row.audit_hash) {
          issues.push({
            id: row.id,
            eventTs,
            entityType: row.entity_type ?? 'unknown',
            entityId: row.entity_id ?? row.id,
            reason: 'missing_hash',
            expectedPrevHash: previousHash,
            actualPrevHash: row.prev_hash,
            expectedAuditHash: expectedHash,
            actualAuditHash: row.audit_hash,
          });
        } else if (!row.prev_hash && previousHash) {
          issues.push({
            id: row.id,
            eventTs,
            entityType: row.entity_type ?? 'unknown',
            entityId: row.entity_id ?? row.id,
            reason: 'missing_prev_hash',
            expectedPrevHash: previousHash,
            actualPrevHash: row.prev_hash,
            expectedAuditHash: expectedHash,
            actualAuditHash: row.audit_hash,
          });
        } else if (row.prev_hash !== previousHash) {
          issues.push({
            id: row.id,
            eventTs,
            entityType: row.entity_type ?? 'unknown',
            entityId: row.entity_id ?? row.id,
            reason: 'broken_prev_hash',
            expectedPrevHash: previousHash,
            actualPrevHash: row.prev_hash,
            expectedAuditHash: expectedHash,
            actualAuditHash: row.audit_hash,
          });
        } else if (expectedHash !== row.audit_hash) {
          issues.push({
            id: row.id,
            eventTs,
            entityType: row.entity_type ?? 'unknown',
            entityId: row.entity_id ?? row.id,
            reason: 'invalid_hash',
            expectedPrevHash: previousHash,
            actualPrevHash: row.prev_hash,
            expectedAuditHash: expectedHash,
            actualAuditHash: row.audit_hash,
          });
        }
        previousHash = row.audit_hash ?? previousHash;
      }
      return {
        valid: issues.length === 0,
        checkedRows: rows.length,
        lastHash: previousHash,
        issues,
      };
    });
  }

  async listChainRowsInSchema(params: {
    schemaName: string;
    branchIds?: string[];
    fromTs?: string;
    toTs?: string;
    limit?: number;
  }): Promise<AuditChainRow[]> {
    return this.prisma.withTenantSchema(params.schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          branch_id: string | null;
          user_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          action: string;
          event_ts: Date | string;
          prev_hash: string | null;
          audit_hash: string | null;
          before_json: unknown;
          after_json: unknown;
        }>
      >(
        `SELECT id::text,
                branch_id::text,
                user_id::text,
                entity_type,
                entity_id,
                action,
                event_ts,
                prev_hash,
                audit_hash,
                before_json,
                after_json
         FROM audit_logs
         WHERE ($1::uuid[] IS NULL OR branch_id = ANY($1::uuid[]))
           AND ($2::timestamptz IS NULL OR event_ts >= $2::timestamptz)
           AND ($3::timestamptz IS NULL OR event_ts <= $3::timestamptz)
         ORDER BY event_ts ASC, id ASC
         LIMIT $4`,
        params.branchIds?.length ? params.branchIds : null,
        params.fromTs?.trim() ? params.fromTs.trim() : null,
        params.toTs?.trim() ? params.toTs.trim() : null,
        Math.min(50000, Math.max(1, params.limit ?? 50000)),
      );
      return rows.map((row) => ({
        id: row.id,
        branchId: row.branch_id,
        userId: row.user_id,
        entityType: row.entity_type ?? 'unknown',
        entityId: row.entity_id ?? row.id,
        action: row.action,
        eventTs: new Date(row.event_ts).toISOString(),
        prevHash: row.prev_hash,
        auditHash: row.audit_hash,
        beforeJson:
          row.before_json && typeof row.before_json === 'object'
            ? (row.before_json as Record<string, unknown>)
            : null,
        afterJson:
          row.after_json && typeof row.after_json === 'object'
            ? (row.after_json as Record<string, unknown>)
            : null,
      }));
    });
  }
}
