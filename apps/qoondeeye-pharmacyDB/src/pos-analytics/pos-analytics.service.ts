import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PosAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesByBranch(schemaName: string, from?: string, to?: string) {
    return this.aggregate(schemaName, {
      groupBy: 'b.name',
      join: 'INNER JOIN branches b ON b.id = s.branch_id',
      select: 'b.name AS label',
      from,
      to,
    });
  }

  async salesByTerminal(schemaName: string, from?: string, to?: string) {
    return this.aggregate(schemaName, {
      groupBy: 's.pos_session_id',
      select: `COALESCE(s.pos_session_id::text, 'unknown') AS label`,
      from,
      to,
      extraWhere: 's.pos_session_id IS NOT NULL',
    });
  }

  async salesByCashier(schemaName: string, from?: string, to?: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { where, params } = this.dateFilter(from, to, 1);
      const cashierLabel = this.cashierDisplayLabelSql('u');
      const rows = await tx.$queryRawUnsafe<
        { label: string; total: string | number; count: bigint }[]
      >(
        `SELECT ${cashierLabel} AS label,
                COALESCE(SUM(s.total_amount), 0) AS total,
                COUNT(*)::bigint AS count
         FROM sales s
         LEFT JOIN pos_sessions ps ON ps.id = s.pos_session_id
         LEFT JOIN users u ON u.id = ps.staff_user_id
         WHERE 1=1 ${where}
         GROUP BY ps.staff_user_id, u.name, u.staff_id, u.email
         ORDER BY total DESC
         LIMIT 50`,
        ...params,
      );
      return rows.map((r) => ({
        label: r.label,
        total: Number(r.total),
        count: Number(r.count),
      }));
    });
  }

  async salesByHour(schemaName: string, from?: string, to?: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { where, params } = this.dateFilter(from, to, 1);
      const rows = await tx.$queryRawUnsafe<
        { hour: number; total: string | number; count: bigint }[]
      >(
        `SELECT EXTRACT(HOUR FROM s.sale_date)::int AS hour,
                COALESCE(SUM(s.total_amount), 0) AS total,
                COUNT(*)::bigint AS count
         FROM sales s
         WHERE 1=1 ${where}
         GROUP BY hour
         ORDER BY hour`,
        ...params,
      );
      return rows.map((r) => ({
        hour: r.hour,
        total: Number(r.total),
        count: Number(r.count),
      }));
    });
  }

  async topProducts(schemaName: string, from?: string, to?: string, limit = 20) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { where, params } = this.dateFilter(from, to, 1);
      params.push(Math.min(100, Math.max(1, limit)));
      const n = params.length;
      const rows = await tx.$queryRawUnsafe<
        { label: string; qty: string | number; total: string | number }[]
      >(
        `SELECT COALESCE(p.name, 'Unknown') AS label,
                COALESCE(SUM(si.quantity), 0) AS qty,
                COALESCE(SUM(si.total), 0) AS total
         FROM sale_items si
         INNER JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.product_id IS NOT NULL ${where.replace(/s\./g, 's.')}
         GROUP BY p.name
         ORDER BY total DESC
         LIMIT $${n}`,
        ...params,
      );
      return rows.map((r) => ({
        label: r.label,
        quantity: Number(r.qty),
        total: Number(r.total),
      }));
    });
  }

  async refundTrends(schemaName: string, from?: string, to?: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { where, params } = this.dateFilter(from, to, 1, 'sr.return_date');
      const rows = await tx.$queryRawUnsafe<
        { day: string; total: string | number; count: bigint }[]
      >(
        `SELECT DATE(sr.return_date)::text AS day,
                COALESCE(SUM(sr.refund_amount), 0) AS total,
                COUNT(*)::bigint AS count
         FROM sale_returns sr
         WHERE 1=1 ${where}
         GROUP BY day
         ORDER BY day`,
        ...params,
      );
      return rows.map((r) => ({
        day: r.day,
        total: Number(r.total),
        count: Number(r.count),
      }));
    });
  }

  async discountTrends(schemaName: string, from?: string, to?: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { where, params } = this.dateFilter(from, to, 1);
      const rows = await tx.$queryRawUnsafe<
        { day: string; total: string | number; count: bigint }[]
      >(
        `SELECT DATE(s.sale_date)::text AS day,
                COALESCE(SUM(s.discount), 0) AS total,
                COUNT(*)::bigint AS count
         FROM sales s
         WHERE s.discount > 0 ${where}
         GROUP BY day
         ORDER BY day`,
        ...params,
      );
      return rows.map((r) => ({
        day: r.day,
        total: Number(r.total),
        count: Number(r.count),
      }));
    });
  }

  async slowMovers(schemaName: string, from?: string, to?: string, limit = 20) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { where, params } = this.dateFilter(from, to, 2);
      params.unshift(limit);
      const rows = await tx.$queryRawUnsafe<
        { label: string; qty: string | number; total: string | number }[]
      >(
        `SELECT COALESCE(p.name, si.product_id::text) AS label,
                COALESCE(SUM(si.quantity), 0) AS qty,
                COALESCE(SUM(si.total), 0) AS total
         FROM sale_items si
         INNER JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.product_id IS NOT NULL ${where}
         GROUP BY si.product_id, p.name
         ORDER BY qty ASC
         LIMIT $1`,
        ...params,
      );
      return rows.map((r) => ({
        label: r.label,
        quantity: Number(r.qty),
        total: Number(r.total),
      }));
    });
  }

  private async aggregate(
    schemaName: string,
    opts: {
      groupBy: string;
      select: string;
      join?: string;
      from?: string;
      to?: string;
      extraWhere?: string;
    },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const { where, params } = this.dateFilter(opts.from, opts.to, 1);
      const extra = opts.extraWhere ? ` AND ${opts.extraWhere}` : '';
      const join = opts.join ?? '';
      const rows = await tx.$queryRawUnsafe<
        { label: string; total: string | number; count: bigint }[]
      >(
        `SELECT ${opts.select},
                COALESCE(SUM(s.total_amount), 0) AS total,
                COUNT(*)::bigint AS count
         FROM sales s
         ${join}
         WHERE 1=1 ${where}${extra}
         GROUP BY ${opts.groupBy}
         ORDER BY total DESC
         LIMIT 50`,
        ...params,
      );
      return rows.map((r) => ({
        label: r.label,
        total: Number(r.total),
        count: Number(r.count),
      }));
    });
  }

  /** POS cashiers often sign in with staff_id only; name may be unset. */
  private cashierDisplayLabelSql(alias: string) {
    return `COALESCE(
      NULLIF(TRIM(${alias}.name), ''),
      NULLIF(TRIM(${alias}.staff_id), ''),
      NULLIF(TRIM(${alias}.email), ''),
      'Unknown'
    )`;
  }

  private dateFilter(
    from?: string,
    to?: string,
    startIdx = 1,
    dateColumn = 's.sale_date',
  ) {
    const params: unknown[] = [];
    let where = '';
    let n = startIdx;
    if (from) {
      where += ` AND ${dateColumn} >= $${n}::timestamptz`;
      params.push(from);
      n++;
    }
    if (to) {
      where += ` AND ${dateColumn} <= $${n}::timestamptz`;
      params.push(to);
    }
    return { where, params };
  }
}
