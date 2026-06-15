import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantControlFromSql } from '../tenant/tenant-control.schema';

@Injectable()
export class AdminPosOpsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRetailOverview(tenantId?: string) {
    const tenantFrom = await tenantControlFromSql(this.prisma);
    const tenantParams = tenantId ? [tenantId] : [];
    const tenantFilter = tenantId ? `AND t.id = $1::uuid` : '';
    const auditTenantFilter = tenantId ? `AND tenant_id = $1::uuid` : '';
    const deviceTenantFilter = tenantId ? `AND tenant_id = $1::uuid` : '';

    const tenants = await this.prisma.$queryRawUnsafe<
      {
        id: string;
        name: string;
        slug: string | null;
        status: string;
        device_count: bigint;
        bound_devices: bigint;
        offline_devices: bigint;
      }[]
    >(
      `SELECT t.id, t.name, t.slug, t.status,
              COUNT(d.id)::bigint AS device_count,
              COUNT(d.id) FILTER (WHERE d.binding_status = 'bound')::bigint AS bound_devices,
              COUNT(d.id) FILTER (
                WHERE d.last_heartbeat_at IS NULL
                   OR d.last_heartbeat_at < NOW() - INTERVAL '5 minutes'
              )::bigint AS offline_devices
       FROM ${tenantFrom} t
       LEFT JOIN public.pos_devices d ON d.tenant_id = t.id AND d.status = 'active'
       WHERE t.deleted_at IS NULL ${tenantFilter}
       GROUP BY t.id, t.name, t.slug, t.status
       ORDER BY t.name`,
      ...tenantParams,
    );

    const [audit24h] = await this.prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
      `SELECT COUNT(*)::bigint AS cnt FROM public.pos_control_audit_events
       WHERE created_at >= NOW() - INTERVAL '24 hours' ${auditTenantFilter}`,
      ...tenantParams,
    );

    const [failedLogins24h] = await this.prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
      `SELECT COUNT(*)::bigint AS cnt FROM public.pos_control_audit_events
       WHERE created_at >= NOW() - INTERVAL '24 hours'
         AND action IN ('pos_staff_login_failure', 'pos_terminal_setup_failure')
         ${auditTenantFilter}`,
      ...tenantParams,
    );

    const [forceLogouts24h] = await this.prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
      `SELECT COUNT(*)::bigint AS cnt FROM public.pos_control_audit_events
       WHERE created_at >= NOW() - INTERVAL '24 hours'
         AND action IN ('pos_device_force_logout', 'pos_device_disabled')
         ${auditTenantFilter}`,
      ...tenantParams,
    );

    const recentAudit = await this.prisma.$queryRawUnsafe<
      {
        id: string;
        action: string;
        tenant_id: string | null;
        device_id: string | null;
        created_at: Date;
        payload: unknown;
      }[]
    >(
      `SELECT id, action, tenant_id, device_id, created_at, payload
       FROM public.pos_control_audit_events
       WHERE 1=1 ${auditTenantFilter}
       ORDER BY created_at DESC
       LIMIT 25`,
      ...tenantParams,
    );

    const auditByAction = await this.prisma.$queryRawUnsafe<
      { action: string; cnt: bigint }[]
    >(
      `SELECT action, COUNT(*)::bigint AS cnt
       FROM public.pos_control_audit_events
       WHERE created_at >= NOW() - INTERVAL '24 hours' ${auditTenantFilter}
       GROUP BY action
       ORDER BY cnt DESC
       LIMIT 12`,
      ...tenantParams,
    );

    const heartbeatRollup = await this.prisma.$queryRawUnsafe<
      { pending_outbox_total: bigint; devices_reporting: bigint }[]
    >(
      `SELECT COALESCE(SUM(COALESCE(pending_outbox_count, 0)), 0)::bigint AS pending_outbox_total,
              COUNT(*) FILTER (WHERE last_heartbeat_at >= NOW() - INTERVAL '5 minutes')::bigint AS devices_reporting
       FROM public.pos_devices
       WHERE status = 'active' AND binding_status = 'bound' ${deviceTenantFilter}`,
      ...tenantParams,
    );

    return {
      tenantCount: tenants.length,
      controlAuditEvents24h: Number(audit24h?.cnt ?? 0),
      failedLogins24h: Number(failedLogins24h?.cnt ?? 0),
      forceLogouts24h: Number(forceLogouts24h?.cnt ?? 0),
      pendingOutboxTotal: Number(heartbeatRollup[0]?.pending_outbox_total ?? 0),
      devicesReporting: Number(heartbeatRollup[0]?.devices_reporting ?? 0),
      auditByAction24h: auditByAction.map((row) => ({
        action: row.action,
        count: Number(row.cnt),
      })),
      recentAuditEvents: recentAudit.map((row) => ({
        id: row.id,
        action: row.action,
        tenantId: row.tenant_id,
        deviceId: row.device_id,
        createdAt: row.created_at,
        payload: row.payload,
      })),
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        deviceCount: Number(t.device_count),
        boundDevices: Number(t.bound_devices),
        offlineDevices: Number(t.offline_devices),
      })),
    };
  }
}
