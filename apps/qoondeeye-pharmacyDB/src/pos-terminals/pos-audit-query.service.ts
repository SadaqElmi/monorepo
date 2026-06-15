import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'password',
  'pin',
  'setup_password_hash',
  'device_secret',
  'deviceCredential',
  'device_credential',
]);

@Injectable()
export class PosAuditQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  sanitizePayload(
    payload: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!payload) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (FORBIDDEN_PAYLOAD_KEYS.has(key)) continue;
      out[key] = value;
    }
    return Object.keys(out).length ? out : null;
  }

  async listGlobalPosAudit(
    tenantId: string,
    schemaName: string,
    options?: {
      page?: number;
      limit?: number;
      deviceId?: string;
      action?: string;
      from?: string;
      to?: string;
    },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 25));
    const offset = (page - 1) * limit;
    const fetchLimit = Math.min(500, offset + limit);

    const tenantConditions: string[] = [`table_name = 'pos_auth'`];
    const tenantParams: unknown[] = [];
    let idx = 1;

    if (options?.deviceId) {
      tenantConditions.push(`entity_id = $${idx}::text`);
      tenantParams.push(options.deviceId);
      idx += 1;
    }
    if (options?.action?.trim()) {
      tenantConditions.push(`action = $${idx}`);
      tenantParams.push(options.action.trim());
      idx += 1;
    }
    if (options?.from) {
      tenantConditions.push(`COALESCE(event_ts, created_at) >= $${idx}::timestamptz`);
      tenantParams.push(options.from);
      idx += 1;
    }
    if (options?.to) {
      tenantConditions.push(`COALESCE(event_ts, created_at) <= $${idx}::timestamptz`);
      tenantParams.push(options.to);
      idx += 1;
    }

    const tenantWhere = tenantConditions.join(' AND ');

    const controlConditions: string[] = [`tenant_id = $1::uuid`];
    const controlParams: unknown[] = [tenantId];
    let cidx = 2;

    if (options?.deviceId) {
      controlConditions.push(`device_id = $${cidx}::uuid`);
      controlParams.push(options.deviceId);
      cidx += 1;
    }
    if (options?.action?.trim()) {
      controlConditions.push(`action = $${cidx}`);
      controlParams.push(options.action.trim());
      cidx += 1;
    }
    if (options?.from) {
      controlConditions.push(`created_at >= $${cidx}::timestamptz`);
      controlParams.push(options.from);
      cidx += 1;
    }
    if (options?.to) {
      controlConditions.push(`created_at <= $${cidx}::timestamptz`);
      controlParams.push(options.to);
      cidx += 1;
    }

    const controlWhere = controlConditions.join(' AND ');

    const [tenantCountRow, tenantRows, controlCountRow, controlRows] =
      await Promise.all([
        this.prisma.withTenantSchema(schemaName, (tx) =>
          tx.$queryRawUnsafe<Array<{ count: bigint }>>(
            `SELECT COUNT(*)::bigint AS count FROM audit_logs WHERE ${tenantWhere}`,
            ...tenantParams,
          ),
        ),
        this.prisma.withTenantSchema(schemaName, (tx) =>
          tx.$queryRawUnsafe<
            Array<{
              id: string;
              action: string;
              actor_user_id: string | null;
              entity_id: string | null;
              event_ts: Date;
              new_payload: Record<string, unknown> | null;
              source: string;
            }>
          >(
            `SELECT id, action, actor_user_id, entity_id,
                    COALESCE(event_ts, created_at) AS event_ts,
                    new_payload, 'tenant' AS source
             FROM audit_logs
             WHERE ${tenantWhere}
             ORDER BY COALESCE(event_ts, created_at) DESC
             LIMIT $${idx}`,
            ...tenantParams,
            fetchLimit,
          ),
        ),
        this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count
           FROM "public"."pos_control_audit_events"
           WHERE ${controlWhere}`,
          ...controlParams,
        ),
        this.prisma.$queryRawUnsafe<
          Array<{
            id: string;
            device_id: string | null;
            action: string;
            actor_user_id: string | null;
            actor_type: string;
            created_at: Date;
            payload: Record<string, unknown> | null;
            source: string;
          }>
        >(
          `SELECT id, device_id, action, actor_user_id, actor_type, created_at, payload,
                  'control' AS source
           FROM "public"."pos_control_audit_events"
           WHERE ${controlWhere}
           ORDER BY created_at DESC
           LIMIT $${cidx}`,
          ...controlParams,
          fetchLimit,
        ),
      ]);

    const tenantTotal = Number(tenantCountRow[0]?.count ?? 0);
    const controlTotal = Number(controlCountRow[0]?.count ?? 0);

    const merged = [
      ...tenantRows.map((r) => ({
        id: r.id,
        source: r.source as 'tenant' | 'control',
        deviceId: r.entity_id,
        action: r.action,
        actorUserId: r.actor_user_id,
        actorType: 'staff' as const,
        createdAt: r.event_ts.toISOString(),
        payload: this.sanitizePayload(r.new_payload),
      })),
      ...controlRows.map((r) => ({
        id: r.id,
        source: r.source as 'tenant' | 'control',
        deviceId: r.device_id,
        action: r.action,
        actorUserId: r.actor_user_id,
        actorType: r.actor_type,
        createdAt: r.created_at.toISOString(),
        payload: this.sanitizePayload(r.payload),
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(offset, offset + limit);

    return {
      items: merged,
      total: tenantTotal + controlTotal,
      page,
      limit,
      sources: { tenant: tenantTotal, control: controlTotal },
    };
  }
}
