import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PosTerminalsService } from './pos-terminals.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class PosTerminalActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posTerminals: PosTerminalsService,
  ) {}

  async getActivity(
    tenantId: string,
    schemaName: string,
    deviceId: string,
    options?: { page?: number; limit?: number },
  ) {
    const terminal = await this.posTerminals.findOne(
      tenantId,
      schemaName,
      deviceId,
    );

    const page = Math.max(1, options?.page ?? DEFAULT_PAGE);
    const limit = Math.min(50, Math.max(1, options?.limit ?? DEFAULT_LIMIT));
    const offset = (page - 1) * limit;

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      currentSession,
      salesCount,
      loginFailuresCount,
      sessions,
      auditRows,
      failureRows,
    ] = await Promise.all([
      this.loadCurrentSession(schemaName, deviceId),
      this.countSalesSince(schemaName, deviceId, since24h),
      this.countLoginFailuresSince(schemaName, deviceId, since24h),
      this.loadRecentSessions(schemaName, deviceId, limit, offset),
      this.loadRecentAudit(schemaName, deviceId, limit, offset),
      this.loadRecentLoginFailures(schemaName, deviceId, limit, offset),
    ]);

    return {
      terminal,
      currentSession,
      stats: {
        salesLast24h: salesCount,
        loginFailuresLast24h: loginFailuresCount,
      },
      recentSessions: sessions,
      recentAudit: auditRows,
      recentLoginFailures: failureRows,
    };
  }

  async getAuditLog(
    tenantId: string,
    schemaName: string,
    deviceId: string,
    options?: { page?: number; limit?: number },
  ) {
    await this.posTerminals.findOne(tenantId, schemaName, deviceId);
    const page = Math.max(1, options?.page ?? DEFAULT_PAGE);
    const limit = Math.min(100, Math.max(1, options?.limit ?? DEFAULT_LIMIT));
    const offset = (page - 1) * limit;
    return this.loadRecentAudit(schemaName, deviceId, limit, offset);
  }

  private async loadCurrentSession(schemaName: string, deviceId: string) {
    const [row] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<
        Array<{
          id: string;
          staff_user_id: string | null;
          opened_at: Date;
        }>
      >(
        `SELECT id, staff_user_id, opened_at
         FROM pos_sessions
         WHERE device_id = $1::uuid AND status IN ('open', 'paused')
         ORDER BY opened_at DESC
         LIMIT 1`,
        deviceId,
      ),
    );
    if (!row) return null;

    let staffName: string | null = null;
    if (row.staff_user_id) {
      const [user] = await this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<Array<{ name: string | null }>>(
          `SELECT name FROM users WHERE id = $1::uuid LIMIT 1`,
          row.staff_user_id,
        ),
      );
      staffName = user?.name?.trim() ?? null;
    }

    return {
      id: row.id,
      staffUserId: row.staff_user_id,
      staffName,
      openedAt: row.opened_at.toISOString(),
    };
  }

  private async countSalesSince(
    schemaName: string,
    deviceId: string,
    since: Date,
  ): Promise<number> {
    const [row] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM sales s
         INNER JOIN pos_sessions ps ON ps.id = s.pos_session_id
         WHERE ps.device_id = $1::uuid AND s.sale_date >= $2`,
        deviceId,
        since,
      ),
    );
    return Number(row?.count ?? 0);
  }

  private async countLoginFailuresSince(
    schemaName: string,
    deviceId: string,
    since: Date,
  ): Promise<number> {
    const [row] = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count
         FROM audit_logs
         WHERE table_name = 'pos_auth'
           AND entity_id = $1::text
           AND action = 'pos_staff_login_failure'
           AND COALESCE(event_ts, created_at) >= $2`,
        deviceId,
        since,
      ),
    );
    return Number(row?.count ?? 0);
  }

  private async loadRecentSessions(
    schemaName: string,
    deviceId: string,
    limit: number,
    offset: number,
  ) {
    const [countRow, rows] = await Promise.all([
      this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count FROM pos_sessions WHERE device_id = $1::uuid`,
          deviceId,
        ),
      ),
      this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<
          Array<{
            id: string;
            status: string;
            staff_user_id: string | null;
            opened_at: Date;
            closed_at: Date | null;
          }>
        >(
          `SELECT id, status, staff_user_id, opened_at, closed_at
           FROM pos_sessions
           WHERE device_id = $1::uuid
           ORDER BY opened_at DESC
           LIMIT $2 OFFSET $3`,
          deviceId,
          limit,
          offset,
        ),
      ),
    ]);

    const staffIds = rows
      .map((r) => r.staff_user_id)
      .filter((id): id is string => Boolean(id));
    const staffNames = await this.loadUserNames(schemaName, staffIds);

    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        staffName: r.staff_user_id
          ? (staffNames.get(r.staff_user_id) ?? null)
          : null,
        openedAt: r.opened_at.toISOString(),
        closedAt: r.closed_at?.toISOString() ?? null,
      })),
      total: Number(countRow[0]?.count ?? 0),
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  private async loadRecentAudit(
    schemaName: string,
    deviceId: string,
    limit: number,
    offset: number,
  ) {
    const [countRow, rows] = await Promise.all([
      this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count
           FROM audit_logs
           WHERE table_name = 'pos_auth' AND entity_id = $1::text`,
          deviceId,
        ),
      ),
      this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<
          Array<{
            id: string;
            action: string;
            actor_user_id: string | null;
            event_ts: Date;
            new_payload: Record<string, unknown> | null;
          }>
        >(
          `SELECT id, action, actor_user_id, COALESCE(event_ts, created_at) AS event_ts, new_payload
           FROM audit_logs
           WHERE table_name = 'pos_auth' AND entity_id = $1::text
           ORDER BY COALESCE(event_ts, created_at) DESC
           LIMIT $2 OFFSET $3`,
          deviceId,
          limit,
          offset,
        ),
      ),
    ]);

    const actorIds = rows
      .map((r) => r.actor_user_id)
      .filter((id): id is string => Boolean(id));
    const actorNames = await this.loadUserNames(schemaName, actorIds);

    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorUserId: r.actor_user_id,
        actorName: r.actor_user_id
          ? (actorNames.get(r.actor_user_id) ?? null)
          : null,
        createdAt: r.event_ts.toISOString(),
        payload: r.new_payload,
      })),
      total: Number(countRow[0]?.count ?? 0),
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  private async loadRecentLoginFailures(
    schemaName: string,
    deviceId: string,
    limit: number,
    offset: number,
  ) {
    const [countRow, rows] = await Promise.all([
      this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count
           FROM audit_logs
           WHERE table_name = 'pos_auth'
             AND entity_id = $1::text
             AND action = 'pos_staff_login_failure'`,
          deviceId,
        ),
      ),
      this.prisma.withTenantSchema(schemaName, (tx) =>
        tx.$queryRawUnsafe<
          Array<{
            id: string;
            event_ts: Date;
            new_payload: Record<string, unknown> | null;
          }>
        >(
          `SELECT id, COALESCE(event_ts, created_at) AS event_ts, new_payload
           FROM audit_logs
           WHERE table_name = 'pos_auth'
             AND entity_id = $1::text
             AND action = 'pos_staff_login_failure'
           ORDER BY COALESCE(event_ts, created_at) DESC
           LIMIT $2 OFFSET $3`,
          deviceId,
          limit,
          offset,
        ),
      ),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.event_ts.toISOString(),
        payload: r.new_payload,
      })),
      total: Number(countRow[0]?.count ?? 0),
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  private async loadUserNames(
    schemaName: string,
    userIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (!unique.length) return new Map();
    const rows = await this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string; name: string | null }>>(
        `SELECT id, name FROM users WHERE id = ANY($1::uuid[])`,
        unique,
      ),
    );
    return new Map(
      rows.map((r) => [r.id, r.name?.trim() || 'Unknown user']),
    );
  }
}
