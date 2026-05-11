/**
 * Inventory movement timeline (read model over operational tables).
 *
 * v1 limits:
 * - `before_quantity` / `after_quantity` are always null. The DB does not store
 *   per-movement running balances; aggregate `inventory.quantity` can also diverge
 *   from FIFO batch consumption. A future `inventory_movements` append-only ledger
 *   (written inside the same transactions as stock mutations) should record explicit
 *   before/after on the aggregate inventory row for audit-grade trails, exports, and
 *   forecasting.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPagedResult, type PagedResult } from '../common/pagination.util';

export const INVENTORY_HISTORY_ACTION_TYPES = [
  'sale',
  'purchase',
  'return',
  'transfer_out',
  'transfer_in',
  'transfer_reversal',
  'adjustment',
  'reconciliation',
  'expired_removal',
  'damage',
] as const;

export type InventoryHistoryActionType =
  (typeof INVENTORY_HISTORY_ACTION_TYPES)[number];

export type InventoryHistoryItem = {
  id: string;
  created_at: string;
  action_type: string;
  product_id: string | null;
  product_name: string | null;
  batch_number: string | null;
  quantity_change: number;
  before_quantity: null;
  after_quantity: null;
  branch_id: string | null;
  branch_name: string | null;
  reference_type: string;
  reference_id: string;
  performed_by: { user_id: string | null; name: string | null } | null;
  ref_hint: string | null;
};

export type InventoryHistoryQuery = {
  branchIds: string[];
  page: number;
  limit: number;
  skip: number;
  productId?: string | null;
  actionType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
};

@Injectable()
export class InventoryHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private escapeLikePattern(raw: string): string {
    return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  private movementsUnionSql(): string {
    return `
      SELECT
        ('sale_item:' || si.id::text) AS id,
        s.sale_date AS created_at,
        'sale'::text AS action_type,
        si.product_id,
        bat.batch_number::text AS batch_number,
        (-(ABS(COALESCE(si.quantity, 0)))::int) AS quantity_change,
        COALESCE(si.branch_id, s.branch_id) AS branch_id,
        'sale'::text AS reference_type,
        s.id::text AS reference_id,
        ps.staff_user_id AS actor_user_id,
        NULLIF(TRIM(s.receipt_number::text), '') AS ref_hint
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      LEFT JOIN batches bat ON bat.id = si.batch_id
      LEFT JOIN pos_sessions ps ON ps.id = s.pos_session_id
      WHERE si.product_id IS NOT NULL
        AND si.misc_charge_kind IS NULL
        AND COALESCE(si.quantity, 0) <> 0
        AND COALESCE(si.branch_id, s.branch_id) = ANY($1::uuid[])

      UNION ALL

      SELECT
        ('purchase_item:' || pi.id::text) AS id,
        COALESCE(p.purchase_date::timestamp, p.created_at) AS created_at,
        'purchase'::text AS action_type,
        pi.product_id,
        bat.batch_number::text AS batch_number,
        COALESCE(pi.quantity, 0)::int AS quantity_change,
        COALESCE(pi.branch_id, p.branch_id) AS branch_id,
        'purchase'::text AS reference_type,
        p.id::text AS reference_id,
        NULL::uuid AS actor_user_id,
        NULLIF(TRIM(p.invoice_number::text), '') AS ref_hint
      FROM purchase_items pi
      INNER JOIN purchases p ON p.id = pi.purchase_id
      LEFT JOIN batches bat ON bat.id = pi.batch_id
      WHERE pi.product_id IS NOT NULL
        AND COALESCE(pi.quantity, 0) <> 0
        AND COALESCE(pi.branch_id, p.branch_id) = ANY($1::uuid[])

      UNION ALL

      SELECT
        ('return_item:' || sri.id::text) AS id,
        sr.return_date AS created_at,
        'return'::text AS action_type,
        sri.product_id,
        bat.batch_number::text AS batch_number,
        COALESCE(sri.quantity, 0)::int AS quantity_change,
        sr.branch_id AS branch_id,
        'sale_return'::text AS reference_type,
        sr.id::text AS reference_id,
        NULL::uuid AS actor_user_id,
        NULL::text AS ref_hint
      FROM sale_return_items sri
      INNER JOIN sale_returns sr ON sr.id = sri.sale_return_id
      LEFT JOIN batches bat ON bat.id = sri.batch_id
      WHERE sri.product_id IS NOT NULL
        AND COALESCE(sri.quantity, 0) <> 0
        AND sr.branch_id = ANY($1::uuid[])

      UNION ALL

      SELECT
        ('xfer_out:' || st.id::text || ':' || sti.product_id::text) AS id,
        st.shipped_at AS created_at,
        'transfer_out'::text AS action_type,
        sti.product_id,
        NULL::text AS batch_number,
        (-(sti.quantity)::int) AS quantity_change,
        st.from_branch_id AS branch_id,
        'stock_transfer'::text AS reference_type,
        st.id::text AS reference_id,
        NULL::uuid AS actor_user_id,
        NULLIF(TRIM(st.transfer_number::text), '') AS ref_hint
      FROM stock_transfer_items sti
      INNER JOIN stock_transfers st ON st.id = sti.transfer_id
      WHERE st.shipped_at IS NOT NULL
        AND st.from_branch_id = ANY($1::uuid[])

      UNION ALL

      SELECT
        ('xfer_in:' || st.id::text || ':' || sti.product_id::text) AS id,
        st.received_at AS created_at,
        'transfer_in'::text AS action_type,
        sti.product_id,
        NULL::text AS batch_number,
        COALESCE(sti.received_quantity, sti.quantity)::int AS quantity_change,
        st.to_branch_id AS branch_id,
        'stock_transfer'::text AS reference_type,
        st.id::text AS reference_id,
        NULL::uuid AS actor_user_id,
        NULLIF(TRIM(st.transfer_number::text), '') AS ref_hint
      FROM stock_transfer_items sti
      INNER JOIN stock_transfers st ON st.id = sti.transfer_id
      WHERE st.received_at IS NOT NULL
        AND st.to_branch_id = ANY($1::uuid[])

      UNION ALL

      SELECT
        ('xfer_rev_ship:' || st.id::text || ':' || sti.product_id::text) AS id,
        st.reversed_at AS created_at,
        'transfer_reversal'::text AS action_type,
        sti.product_id,
        NULL::text AS batch_number,
        COALESCE(sti.received_quantity, sti.quantity)::int AS quantity_change,
        st.from_branch_id AS branch_id,
        'stock_transfer'::text AS reference_type,
        st.id::text AS reference_id,
        st.reversed_by AS actor_user_id,
        NULLIF(TRIM(st.transfer_number::text), '') AS ref_hint
      FROM stock_transfer_items sti
      INNER JOIN stock_transfers st ON st.id = sti.transfer_id
      WHERE st.is_reversed = TRUE
        AND st.reversed_at IS NOT NULL
        AND st.received_at IS NULL
        AND st.from_branch_id = ANY($1::uuid[])

      UNION ALL

      SELECT
        ('xfer_rev_r_to:' || st.id::text || ':' || sti.product_id::text) AS id,
        st.reversed_at AS created_at,
        'transfer_reversal'::text AS action_type,
        sti.product_id,
        NULL::text AS batch_number,
        (-(COALESCE(sti.received_quantity, sti.quantity))::int) AS quantity_change,
        st.to_branch_id AS branch_id,
        'stock_transfer'::text AS reference_type,
        st.id::text AS reference_id,
        st.reversed_by AS actor_user_id,
        NULLIF(TRIM(st.transfer_number::text), '') AS ref_hint
      FROM stock_transfer_items sti
      INNER JOIN stock_transfers st ON st.id = sti.transfer_id
      WHERE st.is_reversed = TRUE
        AND st.reversed_at IS NOT NULL
        AND st.received_at IS NOT NULL
        AND st.to_branch_id = ANY($1::uuid[])

      UNION ALL

      SELECT
        ('xfer_rev_r_from:' || st.id::text || ':' || sti.product_id::text) AS id,
        st.reversed_at AS created_at,
        'transfer_reversal'::text AS action_type,
        sti.product_id,
        NULL::text AS batch_number,
        COALESCE(sti.received_quantity, sti.quantity)::int AS quantity_change,
        st.from_branch_id AS branch_id,
        'stock_transfer'::text AS reference_type,
        st.id::text AS reference_id,
        st.reversed_by AS actor_user_id,
        NULLIF(TRIM(st.transfer_number::text), '') AS ref_hint
      FROM stock_transfer_items sti
      INNER JOIN stock_transfers st ON st.id = sti.transfer_id
      WHERE st.is_reversed = TRUE
        AND st.reversed_at IS NOT NULL
        AND st.received_at IS NOT NULL
        AND st.from_branch_id = ANY($1::uuid[])
    `;
  }

  async list(
    schemaName: string,
    q: InventoryHistoryQuery,
  ): Promise<PagedResult<InventoryHistoryItem>> {
    const patternRaw = q.search?.trim();
    const pattern =
      patternRaw && patternRaw.length > 0
        ? `%${this.escapeLikePattern(patternRaw)}%`
        : null;

    const params: unknown[] = [q.branchIds];
    const filters: string[] = [];
    let i = 2;

    const addEqUuid = (col: string, value: string) => {
      params.push(value);
      filters.push(`AND ${col} = $${i++}::uuid`);
    };

    const addEqTextLower = (col: string, value: string) => {
      params.push(value.toLowerCase());
      filters.push(`AND LOWER(${col}) = $${i++}`);
    };

    const addDate = (col: string, value: string, op: '>=' | '<=') => {
      params.push(value.slice(0, 10));
      filters.push(`AND ${col}::date ${op} $${i++}::date`);
    };

    if (q.productId?.trim()) {
      addEqUuid('m.product_id', q.productId.trim());
    }
    if (q.actionType?.trim()) {
      addEqTextLower('m.action_type', q.actionType.trim());
    }
    if (q.startDate?.trim()) {
      addDate('m.created_at', q.startDate.trim(), '>=');
    }
    if (q.endDate?.trim()) {
      addDate('m.created_at', q.endDate.trim(), '<=');
    }

    let searchPlaceholder = '';
    if (pattern) {
      params.push(pattern);
      searchPlaceholder = `$${i++}`;
      filters.push(`AND (
        COALESCE(p.name, '') ILIKE ${searchPlaceholder} ESCAPE E'\\\\'
        OR COALESCE(p.barcode, '') ILIKE ${searchPlaceholder} ESCAPE E'\\\\'
        OR COALESCE(m.batch_number, '') ILIKE ${searchPlaceholder} ESCAPE E'\\\\'
        OR COALESCE(m.ref_hint, '') ILIKE ${searchPlaceholder} ESCAPE E'\\\\'
      )`);
    }

    const filterSql = filters.join('\n      ');
    const unionBody = this.movementsUnionSql();

    const baseFrom = `
      FROM (${unionBody}) AS m
      LEFT JOIN products p ON p.id = m.product_id
      LEFT JOIN branches b ON b.id = m.branch_id
      LEFT JOIN users u ON u.id = m.actor_user_id
      WHERE 1 = 1
      ${filterSql}
    `;

    const countSql = `SELECT COUNT(*)::bigint AS c ${baseFrom}`;

    const limitParam = params.length + 1;
    params.push(q.limit, q.skip);
    const offsetParam = params.length;

    const listSql = `
      SELECT
        m.id::text AS id,
        m.created_at AS created_at,
        m.action_type::text AS action_type,
        m.product_id::text AS product_id,
        p.name::text AS product_name,
        m.batch_number::text AS batch_number,
        m.quantity_change::int AS quantity_change,
        NULL::int AS before_quantity,
        NULL::int AS after_quantity,
        m.branch_id::text AS branch_id,
        b.name::text AS branch_name,
        m.reference_type::text AS reference_type,
        m.reference_id::text AS reference_id,
        m.actor_user_id::text AS actor_user_id,
        u.name::text AS actor_name,
        m.ref_hint::text AS ref_hint
      ${baseFrom}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const countParams = params.slice(0, params.length - 2);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        countSql,
        ...countParams,
      );
      const total = Number(countRow?.c ?? 0);

      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          created_at: Date;
          action_type: string;
          product_id: string | null;
          product_name: string | null;
          batch_number: string | null;
          quantity_change: number;
          before_quantity: null;
          after_quantity: null;
          branch_id: string | null;
          branch_name: string | null;
          reference_type: string;
          reference_id: string;
          actor_user_id: string | null;
          actor_name: string | null;
          ref_hint: string | null;
        }>
      >(listSql, ...params);

      const items: InventoryHistoryItem[] = rows.map((r) => ({
        id: r.id,
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
        action_type: r.action_type,
        product_id: r.product_id,
        product_name: r.product_name,
        batch_number: r.batch_number,
        quantity_change: Number(r.quantity_change ?? 0),
        before_quantity: null,
        after_quantity: null,
        branch_id: r.branch_id,
        branch_name: r.branch_name,
        reference_type: r.reference_type,
        reference_id: r.reference_id,
        ref_hint: r.ref_hint,
        performed_by:
          r.actor_user_id || r.actor_name
            ? {
                user_id: r.actor_user_id,
                name: r.actor_name,
              }
            : null,
      }));

      return toPagedResult(items, total, q.page, q.limit);
    });
  }
}
