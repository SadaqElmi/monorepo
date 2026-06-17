import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DeviceRow = {
  id: string;
  display_name: string | null;
  binding_status: string;
  last_heartbeat_at: Date | null;
  last_seen_at: Date | null;
  pending_outbox_count: number | null;
  disabled_at: Date | null;
};

@Injectable()
export class PosMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId: string, schemaName: string, branchId?: string) {
    const heartbeatThreshold = new Date(Date.now() - 5 * 60 * 1000);

    const deviceParams: unknown[] = [tenantId];
    let deviceSql = `SELECT id, display_name, binding_status, last_heartbeat_at, last_seen_at,
                            pending_outbox_count, disabled_at
                     FROM public.pos_devices
                     WHERE tenant_id = $1::uuid AND status = 'active'`;
    if (branchId) {
      deviceParams.push(branchId);
      deviceSql += ` AND branch_id = $2::uuid`;
    }
    const devices = await this.prisma.$queryRawUnsafe<DeviceRow[]>(
      deviceSql,
      ...deviceParams,
    );

    const online = devices.filter(
      (d) =>
        d.last_heartbeat_at &&
        d.last_heartbeat_at >= heartbeatThreshold &&
        !d.disabled_at,
    ).length;
    const offline = devices.length - online;

    const tenantStats = await this.prisma.withTenantSchema(
      schemaName,
      async (tx) => {
        const branchFilter = branchId ? `AND branch_id = $1::uuid` : '';
        const params = branchId ? [branchId] : [];

        const [shifts] = await tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*)::bigint AS count FROM pos_sessions WHERE status IN ('open', 'paused') ${branchFilter}`,
          ...params,
        );

        const [salesToday] = await tx.$queryRawUnsafe<{ total: string | number; cnt: bigint }[]>(
          `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*)::bigint AS cnt
           FROM sales WHERE sale_date >= CURRENT_DATE ${branchFilter}`,
          ...params,
        );

        const [refundsToday] = await tx.$queryRawUnsafe<{ cnt: bigint }[]>(
          `SELECT COUNT(*)::bigint AS cnt FROM sale_returns WHERE return_date >= CURRENT_DATE ${branchFilter.replace('branch_id', 'branch_id')}`,
          ...params,
        );

        const [varianceAlerts] = await tx.$queryRawUnsafe<{ cnt: bigint }[]>(
          `SELECT COUNT(*)::bigint AS cnt
           FROM pos_sessions ps
           INNER JOIN pos_statements pst ON pst.session_id = ps.id
           INNER JOIN pos_statement_lines psl ON psl.statement_id = pst.id
           WHERE ps.status = 'closed' AND pst.posted_at >= CURRENT_DATE
             AND ABS(psl.difference) > 0.01 ${branchFilter.replace('branch_id', 'ps.branch_id')}`,
          ...params,
        );

        return {
          activeShifts: Number(shifts?.count ?? 0),
          salesTodayTotal: Number(salesToday?.total ?? 0),
          salesTodayCount: Number(salesToday?.cnt ?? 0),
          refundsToday: Number(refundsToday?.cnt ?? 0),
          varianceAlerts: Number(varianceAlerts?.cnt ?? 0),
        };
      },
    );

    return {
      terminals: { total: devices.length, online, offline },
      devices: devices.map((d) => ({
        id: d.id,
        name: d.display_name,
        bindingStatus: d.binding_status,
        online:
          Boolean(
            d.last_heartbeat_at && d.last_heartbeat_at >= heartbeatThreshold,
          ) && !d.disabled_at,
        pendingOutbox: d.pending_outbox_count ?? 0,
        lastHeartbeatAt: d.last_heartbeat_at ?? d.last_seen_at,
      })),
      ...tenantStats,
    };
  }

  async listEvents(
    schemaName: string,
    branchId: string | undefined,
    limit = 50,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const parts = [`table_name = 'pos_auth'`];
      const vals: unknown[] = [];
      let n = 1;
      if (branchId) {
        parts.push(`branch_id = $${n}::uuid`);
        vals.push(branchId);
        n++;
      }
      vals.push(Math.min(200, Math.max(1, limit)));
      const rows = await tx.$queryRawUnsafe<
        {
          id: string;
          action: string;
          actor_user_id: string | null;
          created_at: Date;
          new_payload: unknown;
        }[]
      >(
        `SELECT id, action, actor_user_id, created_at, new_payload
         FROM audit_logs
         WHERE ${parts.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $${n}`,
        ...vals,
      );
      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorUserId: r.actor_user_id,
        createdAt: r.created_at,
        payload: r.new_payload,
      }));
    });
  }
}
