import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PosSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(
    schemaName: string,
    event: {
      branchId?: string | null;
      deviceId?: string | null;
      eventType: string;
      severity?: string;
      actorUserId?: string | null;
      ipAddress?: string | null;
      payload?: Record<string, unknown>;
    },
  ) {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(
        `INSERT INTO pos_security_events
           (branch_id, device_id, event_type, severity, actor_user_id, ip_address, payload)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::inet, $7::jsonb)`,
        event.branchId ?? null,
        event.deviceId ?? null,
        event.eventType,
        event.severity ?? 'medium',
        event.actorUserId ?? null,
        event.ipAddress ?? null,
        event.payload ? JSON.stringify(event.payload) : null,
      );
    });
  }

  async listEvents(
    schemaName: string,
    branchId: string | undefined,
    limit = 50,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const parts: string[] = [];
      const vals: unknown[] = [];
      let n = 1;
      if (branchId) {
        parts.push(`branch_id = $${n}::uuid`);
        vals.push(branchId);
        n++;
      }
      vals.push(Math.min(200, Math.max(1, limit)));
      const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
      const rows = await tx.$queryRawUnsafe<
        {
          id: string;
          event_type: string;
          severity: string;
          created_at: Date;
          payload: unknown;
        }[]
      >(
        `SELECT id, event_type, severity, created_at, payload
         FROM pos_security_events ${where}
         ORDER BY created_at DESC LIMIT $${n}`,
        ...vals,
      );
      return rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        severity: r.severity,
        createdAt: r.created_at,
        payload: r.payload,
      }));
    });
  }

  async detectAnomalies(schemaName: string, branchId: string) {
    const events: Array<{ type: string; message: string }> = [];

    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [failedPins] = await tx.$queryRawUnsafe<{ cnt: bigint }[]>(
        `SELECT COUNT(*)::bigint AS cnt FROM audit_logs
         WHERE table_name = 'pos_auth' AND action = 'pos_staff_login_failure'
           AND created_at >= NOW() - INTERVAL '1 hour'
           AND ($1::uuid IS NULL OR branch_id = $1::uuid)`,
        branchId,
      );
      if (Number(failedPins?.cnt ?? 0) >= 10) {
        events.push({
          type: 'repeated_failed_pin',
          message: `${failedPins?.cnt} failed PIN attempts in the last hour`,
        });
      }

      const [refundVelocity] = await tx.$queryRawUnsafe<{ cnt: bigint }[]>(
        `SELECT COUNT(*)::bigint AS cnt FROM sale_returns
         WHERE return_date >= NOW() - INTERVAL '1 hour'
           AND branch_id = $1::uuid`,
        branchId,
      );
      if (Number(refundVelocity?.cnt ?? 0) >= 20) {
        events.push({
          type: 'unusual_refund_velocity',
          message: `${refundVelocity?.cnt} refunds in the last hour`,
        });
      }

      const [multiIp] = await tx.$queryRawUnsafe<{ cnt: bigint }[]>(
        `SELECT COUNT(DISTINCT ip_address)::bigint AS cnt
         FROM audit_logs
         WHERE table_name = 'pos_auth'
           AND action = 'pos_staff_login_success'
           AND created_at >= NOW() - INTERVAL '1 hour'
           AND ($1::uuid IS NULL OR branch_id = $1::uuid)`,
        branchId,
      );
      if (Number(multiIp?.cnt ?? 0) >= 3) {
        events.push({
          type: 'device_multi_ip',
          message: `${multiIp?.cnt} distinct IPs for POS logins in the last hour`,
        });
      }
    });

    for (const e of events) {
      await this.recordEvent(schemaName, {
        branchId,
        eventType: e.type,
        severity: 'high',
        payload: { message: e.message },
      });
    }

    return events;
  }
}
