import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AuditLogService } from '../accounting/audit-log.service';
import { JournalService } from '../accounting/journal.service';
import { OpsMonitoringService } from '../common/services/ops-monitoring.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { TenantService } from '../tenant/tenant.service';
import type { TransferRepairConfirmDto } from './dto/transfer-repair-confirm.dto';
import type { CreateTransferDto } from './dto/create-transfer.dto';
import { deriveStateFromEvents } from './replay/transfer-replay.util';
import { toPagedResult, type PagedResult } from '../common/pagination.util';
import type { UpdateTransferDto } from './dto/update-transfer.dto';

export type ListTransfersQuery = {
  status?: string;
  from_branch_id?: string;
  to_branch_id?: string;
  approval_state?: string;
  /** Either endpoint: from OR to equals this branch (UI branch scope). */
  branch_id?: string;
};

export type TransferRepairAction =
  | { kind: 'link_ship_journal'; journal_entry_id: string }
  | { kind: 'link_receive_journal'; journal_entry_id: string }
  | { kind: 'update_approval_state'; from: string; to: string }
  | { kind: 'create_ship_journal'; journal_entry_id: string; amount: number }
  | {
      kind: 'create_receive_journal';
      journal_entry_id: string;
      amount: number;
    };

export type TransferRepairResult = {
  transfer_id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  actions: TransferRepairAction[];
};
export type TransferMonitoringOverview = {
  transfers_today: number;
  shipped_today: number;
  received_today: number;
  failed_today: number;
  integrity_errors_today: number;
  idempotency_replays_today: number;
  idempotency_conflicts_today: number;
  failure_distribution: Array<{ stage: string; count: number }>;
  trend_hours: Array<{ hour: string; shipped: number; received: number }>;
  recent_transfers: Array<{
    id: string;
    transfer_number: string | null;
    from_branch_id: string;
    to_branch_id: string;
    status: string;
    timestamp: string | null;
  }>;
  recent_errors: Array<{
    id: string;
    transfer_id: string | null;
    stage: string;
    error_message: string;
    created_at: string;
  }>;
};

type TransferRow = Record<string, unknown>;
type ActorContext = { userId?: string | null; userRole?: string | null };
type EventContext = {
  idempotencyKey?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
};
type LockAcquireResult = {
  tookOverExpiredLock: boolean;
  previousOwner: string | null;
  previousStage: string | null;
  previousLockUntil: string | null;
};
const EPSILON = 0.01;

/** Row from raw SQL on `stock_transfer_events` (typed for `$queryRawUnsafe` + strict builds). */
type StockTransferEventSqlRow = {
  id: string;
  type: string;
  event_type: string;
  created_at: Date;
  actor_user_id: string | null;
  branch_id: string | null;
  message: string | null;
  metadata: unknown;
  payload: unknown;
  aggregate_version: number;
  schema_version: number;
  correlation_id: string | null;
  causation_id: string | null;
  idempotency_key: string | null;
};

type TransferJournalCostLineRow = {
  quantity: number;
  unit_cost_snapshot: number | null;
  line_cost_snapshot: number | null;
};

type TransferProductCostLineRow = {
  product_id: string;
  quantity: number;
  unit_cost_snapshot: number | null;
  line_cost_snapshot: number | null;
};

type TransferApprovalReplayEventRow = {
  event_type: string;
  metadata: Record<string, unknown> | null;
};

type TransferDetailLineForQty = { quantity: number };

/**
 * Stock transfers: ship consumes FIFO batches at source; receive inserts a matching inbound batch
 * at destination (`xfer:<transferId>:<productId>`). Reversal removes that marker on receive undo.
 * Legacy data repair notes live on `ReconciliationService.checkInventoryVsGl`.
 */
@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly inventoryService: InventoryService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly accountingLockDate: AccountingLockDateService,
    private readonly journals: JournalService,
    private readonly auditLog: AuditLogService,
    private readonly monitoring: OpsMonitoringService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /**
   * Narrow `$queryRawUnsafe` / tenant transaction results: Prisma typings differ across
   * TS versions, and some CI/Docker builds infer `unknown` instead of the generic row type.
   */
  private castSql<T>(v: unknown): T {
    return v as T;
  }

  /** Fire-and-forget scoped reconciliation after successful transfer mutations. */
  private scheduleReconciliationCheck(
    schema: string,
    transferId: string,
  ): void {
    void this.tenantService
      .findBySchemaName(schema)
      .then((tenant) => {
        if (!tenant) return;
        return this.reconciliation.runTransferScopeChecks(
          tenant.id,
          schema,
          transferId,
        );
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Post-transfer reconciliation scheduling failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  private async ensureTables(schema: string) {
    await this.tenantService.applyTenantSchemaPatches(schema);
  }

  private transferVisible(
    row: TransferRow,
    allowedBranchIds: string[],
  ): boolean {
    const from = this.asText(row.from_branch_id);
    const to = this.asText(row.to_branch_id);
    return allowedBranchIds.includes(from) || allowedBranchIds.includes(to);
  }

  async list(
    schema: string,
    allowedBranchIds: string[],
    query?: ListTransfersQuery,
  ) {
    await this.ensureTables(schema);
    if (!allowedBranchIds.length) return [];

    const parts: string[] = [
      '(t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))',
    ];
    const vals: unknown[] = [allowedBranchIds];
    let n = 2;

    if (query?.status) {
      parts.push(`t.status = $${n}`);
      vals.push(query.status);
      n++;
    }
    if (query?.from_branch_id) {
      parts.push(`t.from_branch_id = $${n}::uuid`);
      vals.push(query.from_branch_id);
      n++;
    }
    if (query?.to_branch_id) {
      parts.push(`t.to_branch_id = $${n}::uuid`);
      vals.push(query.to_branch_id);
      n++;
    }
    if (query?.approval_state) {
      parts.push(`t.approval_state = $${n}`);
      vals.push(query.approval_state);
      n++;
    }
    if (query?.branch_id?.trim()) {
      parts.push(
        `(t.from_branch_id = $${n}::uuid OR t.to_branch_id = $${n}::uuid)`,
      );
      vals.push(query.branch_id.trim());
      n++;
    }

    const where = parts.join(' AND ');
    return this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT
           t.id,
           t.transfer_number,
           t.from_branch_id,
           t.to_branch_id,
           t.status,
           t.approval_state,
           t.approval_state AS approval_status,
           t.lock_version,
           t.expected_date,
           t.expected_stock_snapshot,
           t.created_at,
           t.confirmed_at,
           t.approved_by,
           t.approved_at,
           t.shipped_at,
           t.received_at,
           t.ship_accounting_state,
           t.receive_accounting_state,
           t.last_accounting_error,
           t.shipped_journal_entry_id,
           t.receive_journal_entry_id,
           t.ship_reversal_journal_entry_id,
           t.receive_reversal_journal_entry_id,
           t.is_reversed,
           t.reversed_by,
           t.reversed_at,
           t.reversal_reason,
           t.processing_lock_owner,
           t.processing_lock_until,
           t.processing_stage,
           COALESCE(t.created_by_name, creator.name) AS created_by_name
         FROM stock_transfers t
         LEFT JOIN LATERAL (
           SELECT u.name
           FROM stock_transfer_events e
           JOIN users u ON u.id = e.actor_user_id
           WHERE e.transfer_id = t.id
             AND e.event_type = 'CREATED'
             AND u.name IS NOT NULL
           ORDER BY e.created_at ASC
           LIMIT 1
         ) creator ON TRUE
         WHERE ${where}
         ORDER BY t.created_at DESC`,
        ...vals,
      ),
    );
  }

  /**
   * Count transfers per `status` for allowed branches and optional list filters
   * (aligns with `list` / `listPaged` WHERE).
   */
  async statusCounts(
    schema: string,
    allowedBranchIds: string[],
    query?: ListTransfersQuery,
  ): Promise<Record<string, number>> {
    await this.ensureTables(schema);
    if (!allowedBranchIds.length) {
      return {};
    }

    const parts: string[] = [
      '(t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))',
    ];
    const vals: unknown[] = [allowedBranchIds];
    let n = 2;

    if (query?.status) {
      parts.push(`t.status = $${n}`);
      vals.push(query.status);
      n++;
    }
    if (query?.from_branch_id) {
      parts.push(`t.from_branch_id = $${n}::uuid`);
      vals.push(query.from_branch_id);
      n++;
    }
    if (query?.to_branch_id) {
      parts.push(`t.to_branch_id = $${n}::uuid`);
      vals.push(query.to_branch_id);
      n++;
    }
    if (query?.approval_state) {
      parts.push(`t.approval_state = $${n}`);
      vals.push(query.approval_state);
      n++;
    }
    if (query?.branch_id?.trim()) {
      parts.push(
        `(t.from_branch_id = $${n}::uuid OR t.to_branch_id = $${n}::uuid)`,
      );
      vals.push(query.branch_id.trim());
      n++;
    }

    const where = parts.join(' AND ');
    const rows = await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$queryRawUnsafe<{ status: string; c: bigint }[]>(
        `SELECT t.status, COUNT(*)::bigint AS c
         FROM stock_transfers t
         WHERE ${where}
         GROUP BY t.status`,
        ...vals,
      ),
    );
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[r.status] = Number(r.c ?? 0);
    }
    return out;
  }

  async listPaged(
    schema: string,
    allowedBranchIds: string[],
    query: ListTransfersQuery | undefined,
    skip: number,
    take: number,
  ): Promise<PagedResult<TransferRow>> {
    await this.ensureTables(schema);
    if (!allowedBranchIds.length) {
      return toPagedResult([], 0, Math.floor(skip / take) + 1, take);
    }

    const parts: string[] = [
      '(t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))',
    ];
    const vals: unknown[] = [allowedBranchIds];
    let n = 2;

    if (query?.status) {
      parts.push(`t.status = $${n}`);
      vals.push(query.status);
      n++;
    }
    if (query?.from_branch_id) {
      parts.push(`t.from_branch_id = $${n}::uuid`);
      vals.push(query.from_branch_id);
      n++;
    }
    if (query?.to_branch_id) {
      parts.push(`t.to_branch_id = $${n}::uuid`);
      vals.push(query.to_branch_id);
      n++;
    }
    if (query?.approval_state) {
      parts.push(`t.approval_state = $${n}`);
      vals.push(query.approval_state);
      n++;
    }
    if (query?.branch_id?.trim()) {
      parts.push(
        `(t.from_branch_id = $${n}::uuid OR t.to_branch_id = $${n}::uuid)`,
      );
      vals.push(query.branch_id.trim());
      n++;
    }

    const where = parts.join(' AND ');
    const limitPos = n;
    const offsetPos = n + 1;
    const listVals = [...vals, take, skip];

    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM stock_transfers t WHERE ${where}`,
        ...vals,
      );
      const total = Number(countRow?.c ?? 0);
      const items = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT
           t.id,
           t.transfer_number,
           t.from_branch_id,
           t.to_branch_id,
           t.status,
           t.approval_state,
           t.approval_state AS approval_status,
           t.lock_version,
           t.expected_date,
           t.expected_stock_snapshot,
           t.created_at,
           t.confirmed_at,
           t.approved_by,
           t.approved_at,
           t.shipped_at,
           t.received_at,
           t.ship_accounting_state,
           t.receive_accounting_state,
           t.last_accounting_error,
           t.shipped_journal_entry_id,
           t.receive_journal_entry_id,
           t.ship_reversal_journal_entry_id,
           t.receive_reversal_journal_entry_id,
           t.is_reversed,
           t.reversed_by,
           t.reversed_at,
           t.reversal_reason,
           t.processing_lock_owner,
           t.processing_lock_until,
           t.processing_stage,
           COALESCE(t.created_by_name, creator.name) AS created_by_name
         FROM stock_transfers t
         LEFT JOIN LATERAL (
           SELECT u.name
           FROM stock_transfer_events e
           JOIN users u ON u.id = e.actor_user_id
           WHERE e.transfer_id = t.id
             AND e.event_type = 'CREATED'
             AND u.name IS NOT NULL
           ORDER BY e.created_at ASC
           LIMIT 1
         ) creator ON TRUE
         WHERE ${where}
         ORDER BY t.created_at DESC
         LIMIT $${limitPos} OFFSET $${offsetPos}`,
        ...listVals,
      );
      const page = Math.floor(skip / take) + 1;
      return toPagedResult(items, total, page, take);
    });
  }

  async monitoringOverview(
    schema: string,
    allowedBranchIds: string[],
  ): Promise<TransferMonitoringOverview> {
    await this.ensureTables(schema);
    if (!allowedBranchIds.length) {
      return {
        transfers_today: 0,
        shipped_today: 0,
        received_today: 0,
        failed_today: 0,
        integrity_errors_today: 0,
        idempotency_replays_today: 0,
        idempotency_conflicts_today: 0,
        failure_distribution: [],
        trend_hours: [],
        recent_transfers: [],
        recent_errors: [],
      };
    }

    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [totals] = await tx.$queryRawUnsafe<
        {
          transfers_today: number;
          shipped_today: number;
          received_today: number;
          failed_today: number;
          integrity_errors_today: number;
          idempotency_replays_today: number;
          idempotency_conflicts_today: number;
        }[]
      >(
        `SELECT
           (
             SELECT COUNT(*)::int
             FROM stock_transfers t
             WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
               AND DATE(t.created_at) = CURRENT_DATE
           ) AS transfers_today,
           (
             SELECT COUNT(*)::int
             FROM stock_transfer_events e
             JOIN stock_transfers t ON t.id = e.transfer_id
             WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
               AND e.event_type = 'SHIPPED'
               AND DATE(e.created_at) = CURRENT_DATE
           ) AS shipped_today,
           (
             SELECT COUNT(*)::int
             FROM stock_transfer_events e
             JOIN stock_transfers t ON t.id = e.transfer_id
             WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
               AND e.event_type = 'RECEIVED'
               AND DATE(e.created_at) = CURRENT_DATE
           ) AS received_today,
           (
             SELECT COUNT(*)::int
             FROM transfer_error_log l
             JOIN stock_transfers t ON t.id = l.transfer_id
             WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
               AND DATE(l.created_at) = CURRENT_DATE
               AND l.stage IN ('ship_journal', 'receive_journal', 'reverse_journal', 'approve')
           ) AS failed_today,
           (
             SELECT COUNT(*)::int
             FROM transfer_error_log l
             JOIN stock_transfers t ON t.id = l.transfer_id
             WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
               AND DATE(l.created_at) = CURRENT_DATE
               AND l.stage = 'nightly_journal_verify'
           ) AS integrity_errors_today,
           (
             SELECT COALESCE(SUM(metric_count), 0)::int
             FROM ops_metric_counters
             WHERE metric_date = CURRENT_DATE
               AND metric_key = 'idempotency'
               AND outcome = 'replay'
           ) AS idempotency_replays_today,
           (
             SELECT COALESCE(SUM(metric_count), 0)::int
             FROM ops_metric_counters
             WHERE metric_date = CURRENT_DATE
               AND metric_key = 'idempotency'
               AND outcome = 'conflict'
           ) AS idempotency_conflicts_today`,
        allowedBranchIds,
      );

      const failureDistribution = await tx.$queryRawUnsafe<
        { stage: string; count: number }[]
      >(
        `SELECT l.stage, COUNT(*)::int AS count
         FROM transfer_error_log l
         JOIN stock_transfers t ON t.id = l.transfer_id
         WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
           AND DATE(l.created_at) = CURRENT_DATE
         GROUP BY l.stage
         ORDER BY COUNT(*) DESC`,
        allowedBranchIds,
      );

      const trendHours = await tx.$queryRawUnsafe<
        { hour: string; shipped: number; received: number }[]
      >(
        `SELECT
           TO_CHAR(h.hh, 'HH24:00') AS hour,
           COALESCE((
             SELECT COUNT(*)::int
             FROM stock_transfer_events e
             JOIN stock_transfers t ON t.id = e.transfer_id
             WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
               AND e.event_type = 'SHIPPED'
               AND DATE(e.created_at) = CURRENT_DATE
               AND DATE_TRUNC('hour', e.created_at) = h.hh
           ), 0)::int AS shipped,
           COALESCE((
             SELECT COUNT(*)::int
             FROM stock_transfer_events e
             JOIN stock_transfers t ON t.id = e.transfer_id
             WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
               AND e.event_type = 'RECEIVED'
               AND DATE(e.created_at) = CURRENT_DATE
               AND DATE_TRUNC('hour', e.created_at) = h.hh
           ), 0)::int AS received
         FROM (
           SELECT DATE_TRUNC('hour', NOW()) - (g || ' hour')::interval AS hh
           FROM generate_series(11, 0, -1) g
         ) h
         ORDER BY h.hh`,
        allowedBranchIds,
      );

      const recentTransfers = await tx.$queryRawUnsafe<
        {
          id: string;
          transfer_number: string | null;
          from_branch_id: string;
          to_branch_id: string;
          status: string;
          timestamp: Date | null;
        }[]
      >(
        `SELECT
           t.id,
           t.transfer_number,
           t.from_branch_id,
           t.to_branch_id,
           t.status,
           COALESCE(t.received_at, t.shipped_at, t.created_at) AS timestamp
         FROM stock_transfers t
         WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
         ORDER BY timestamp DESC
         LIMIT 8`,
        allowedBranchIds,
      );

      const recentErrors = await tx.$queryRawUnsafe<
        {
          id: string;
          transfer_id: string | null;
          stage: string;
          error_message: string;
          created_at: Date;
        }[]
      >(
        `SELECT
           l.id,
           l.transfer_id,
           l.stage,
           l.error_message,
           l.created_at
         FROM transfer_error_log l
         JOIN stock_transfers t ON t.id = l.transfer_id
         WHERE (t.from_branch_id = ANY($1::uuid[]) OR t.to_branch_id = ANY($1::uuid[]))
         ORDER BY l.created_at DESC
         LIMIT 8`,
        allowedBranchIds,
      );

      return {
        transfers_today: Number(totals?.transfers_today ?? 0),
        shipped_today: Number(totals?.shipped_today ?? 0),
        received_today: Number(totals?.received_today ?? 0),
        failed_today: Number(totals?.failed_today ?? 0),
        integrity_errors_today: Number(totals?.integrity_errors_today ?? 0),
        idempotency_replays_today: Number(
          totals?.idempotency_replays_today ?? 0,
        ),
        idempotency_conflicts_today: Number(
          totals?.idempotency_conflicts_today ?? 0,
        ),
        failure_distribution: failureDistribution.map((row) => ({
          stage: this.asText(row.stage),
          count: Number(row.count ?? 0),
        })),
        trend_hours: trendHours.map((row) => ({
          hour: this.asText(row.hour),
          shipped: Number(row.shipped ?? 0),
          received: Number(row.received ?? 0),
        })),
        recent_transfers: recentTransfers.map((row) => ({
          id: this.asText(row.id),
          transfer_number: row.transfer_number,
          from_branch_id: this.asText(row.from_branch_id),
          to_branch_id: this.asText(row.to_branch_id),
          status: this.asText(row.status),
          timestamp: row.timestamp
            ? new Date(row.timestamp).toISOString()
            : null,
        })),
        recent_errors: recentErrors.map((row) => ({
          id: this.asText(row.id),
          transfer_id: row.transfer_id ? this.asText(row.transfer_id) : null,
          stage: this.asText(row.stage),
          error_message: this.asText(row.error_message),
          created_at: new Date(row.created_at).toISOString(),
        })),
      };
    });
  }

  async findOne(
    schema: string,
    id: string,
    allowedBranchIds: string[],
  ): Promise<Record<string, unknown>> {
    await this.ensureTables(schema);
    const row = await this.prisma.withTenantSchema(schema, async (tx) => {
      const [r] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT
           id,
           transfer_number,
           from_branch_id,
           to_branch_id,
           status,
           approval_state,
           lock_version,
           expected_date,
           expected_stock_snapshot,
           created_at,
           confirmed_at,
           approved_by,
           approved_at,
           shipped_at,
           received_at,
           ship_accounting_state,
           receive_accounting_state,
           last_accounting_error,
           shipped_journal_entry_id,
           receive_journal_entry_id,
           ship_reversal_journal_entry_id,
           receive_reversal_journal_entry_id,
           is_reversed,
           reversed_by,
           reversed_at,
           reversal_reason,
           processing_lock_owner,
           processing_lock_until,
           processing_stage,
           COALESCE(created_by_name, creator.name) AS created_by_name,
           reject_reason
         FROM stock_transfers t
         LEFT JOIN LATERAL (
           SELECT u.name
           FROM stock_transfer_events e
           JOIN users u ON u.id = e.actor_user_id
           WHERE e.transfer_id = t.id
             AND e.event_type = 'CREATED'
             AND u.name IS NOT NULL
           ORDER BY e.created_at ASC
           LIMIT 1
         ) creator ON TRUE
         WHERE t.id = $1::uuid`,
        id,
      );
      return r ?? null;
    });

    if (!row) {
      throw new NotFoundException('Transfer not found');
    }
    if (!this.transferVisible(row, allowedBranchIds)) {
      throw new ForbiddenException('Access denied to this transfer');
    }

    const items = this.castSql<Record<string, unknown>[]>(
      await this.prisma.withTenantSchema(schema, (tx) =>
        tx.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT
           sti.id,
           sti.product_id,
           sti.quantity,
           sti.received_quantity,
           sti.unit_cost_snapshot,
           sti.line_cost_snapshot,
           p.name AS prod_name,
           p.barcode AS prod_barcode,
           p.unit AS prod_unit
         FROM stock_transfer_items sti
         LEFT JOIN products p ON p.id = sti.product_id
         WHERE sti.transfer_id = $1::uuid
         ORDER BY sti.id`,
          id,
        ),
      ),
    );

    const mappedItems = items.map((it: Record<string, unknown>) => ({
      id: this.asText(it.id),
      product_id: it.product_id ? this.asText(it.product_id) : undefined,
      quantity: Number(it.quantity ?? 0),
      received_quantity:
        it.received_quantity != null ? Number(it.received_quantity) : null,
      unit_cost_snapshot:
        it.unit_cost_snapshot != null ? Number(it.unit_cost_snapshot) : null,
      line_cost_snapshot:
        it.line_cost_snapshot != null ? Number(it.line_cost_snapshot) : null,
      product: it.prod_name
        ? {
            name: it.prod_name,
            sku: it.prod_barcode ?? null,
            unit: it.prod_unit ?? null,
          }
        : null,
    }));

    const status = this.asText(row.status);
    let inTransitQty: number | null = null;
    if (status === 'shipped') {
      inTransitQty = mappedItems.reduce(
        (s: number, l: TransferDetailLineForQty) => s + l.quantity,
        0,
      );
    }

    return {
      id: this.asText(row.id),
      transfer_number: row.transfer_number ?? null,
      from_branch_id: row.from_branch_id
        ? this.asText(row.from_branch_id)
        : undefined,
      to_branch_id: row.to_branch_id
        ? this.asText(row.to_branch_id)
        : undefined,
      status,
      approval_state:
        row.approval_state != null ? this.asText(row.approval_state) : 'none',
      approval_status:
        row.approval_state != null ? this.asText(row.approval_state) : 'none',
      lock_version: Number(row.lock_version ?? 0),
      expected_date: row.expected_date
        ? (row.expected_date as Date).toISOString().slice(0, 10)
        : null,
      expected_stock_snapshot:
        this.jsonObject(row.expected_stock_snapshot) ??
        row.expected_stock_snapshot,
      created_at: row.created_at
        ? new Date(row.created_at as Date).toISOString()
        : undefined,
      confirmed_at: row.confirmed_at
        ? new Date(row.confirmed_at as Date).toISOString()
        : null,
      approved_by: row.approved_by ? this.asText(row.approved_by) : null,
      approved_at: row.approved_at
        ? new Date(row.approved_at as Date).toISOString()
        : null,
      shipped_at: row.shipped_at
        ? new Date(row.shipped_at as Date).toISOString()
        : null,
      received_at: row.received_at
        ? new Date(row.received_at as Date).toISOString()
        : null,
      ship_accounting_state:
        this.asText(row.ship_accounting_state) || 'pending',
      receive_accounting_state:
        this.asText(row.receive_accounting_state) || 'pending',
      last_accounting_error:
        row.last_accounting_error != null
          ? this.asText(row.last_accounting_error)
          : null,
      shipped_journal_entry_id: row.shipped_journal_entry_id
        ? this.asText(row.shipped_journal_entry_id)
        : null,
      receive_journal_entry_id: row.receive_journal_entry_id
        ? this.asText(row.receive_journal_entry_id)
        : null,
      ship_reversal_journal_entry_id: row.ship_reversal_journal_entry_id
        ? this.asText(row.ship_reversal_journal_entry_id)
        : null,
      receive_reversal_journal_entry_id: row.receive_reversal_journal_entry_id
        ? this.asText(row.receive_reversal_journal_entry_id)
        : null,
      is_reversed: Boolean(row.is_reversed),
      reversed_by: row.reversed_by ? this.asText(row.reversed_by) : null,
      reversed_at: row.reversed_at
        ? new Date(row.reversed_at as Date).toISOString()
        : null,
      reversal_reason:
        row.reversal_reason != null ? this.asText(row.reversal_reason) : null,
      processing_lock_owner: row.processing_lock_owner
        ? this.asText(row.processing_lock_owner)
        : null,
      processing_lock_until: row.processing_lock_until
        ? new Date(row.processing_lock_until as Date).toISOString()
        : null,
      processing_stage:
        row.processing_stage != null ? this.asText(row.processing_stage) : null,
      created_by_name: row.created_by_name ?? null,
      items: mappedItems,
      in_transit_quantity: inTransitQty,
    };
  }

  async getEvents(schema: string, id: string, allowedBranchIds: string[]) {
    await this.findOne(schema, id, allowedBranchIds);
    const rows = this.castSql<StockTransferEventSqlRow[]>(
      await this.prisma.withTenantSchema(schema, (tx) =>
        tx.$queryRawUnsafe<StockTransferEventSqlRow[]>(
          `SELECT
           id,
           event_type AS type,
           event_type,
           created_at,
           actor_user_id,
           branch_id,
           message,
           metadata,
           payload
           ,aggregate_version,
           schema_version,
           correlation_id,
           causation_id,
           idempotency_key
         FROM stock_transfer_events
         WHERE transfer_id = $1::uuid
         ORDER BY created_at ASC`,
          id,
        ),
      ),
    );
    return rows.map((r: StockTransferEventSqlRow) => ({
      id: String(r.id),
      type: r.type,
      event_type: r.event_type,
      created_at: new Date(r.created_at).toISOString(),
      actor_user_id: r.actor_user_id ? String(r.actor_user_id) : null,
      branch_id: r.branch_id ? String(r.branch_id) : null,
      message: r.message,
      metadata:
        r.metadata && typeof r.metadata === 'object'
          ? (r.metadata as Record<string, unknown>)
          : null,
      payload:
        r.payload && typeof r.payload === 'object'
          ? (r.payload as Record<string, unknown>)
          : null,
      aggregate_version: Number(r.aggregate_version ?? 0),
      schema_version: Number(r.schema_version ?? 1),
      correlation_id: r.correlation_id ?? null,
      causation_id: r.causation_id ?? null,
      idempotency_key: r.idempotency_key ?? null,
    }));
  }

  private async insertEvent(
    tx: Prisma.TransactionClient,
    transferId: string,
    eventType: string,
    actorUserId: string | null,
    branchId: string | null,
    message: string | null,
    metadata: Record<string, unknown> | null,
    eventContext?: EventContext,
  ) {
    const ctx = this.normalizeEventContext(eventContext);
    if (ctx.idempotencyKey) {
      const [existing] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id
         FROM stock_transfer_events
         WHERE transfer_id = $1::uuid AND idempotency_key = $2
         LIMIT 1`,
        transferId,
        ctx.idempotencyKey,
      );
      if (existing?.id) return;
    }

    const [versionRow] = await tx.$queryRawUnsafe<{ next_version: number }[]>(
      `SELECT COALESCE(MAX(aggregate_version), 0) + 1 AS next_version
       FROM stock_transfer_events
       WHERE transfer_id = $1::uuid`,
      transferId,
    );
    const nextVersion = Number(versionRow?.next_version ?? 1);

    await tx.$queryRawUnsafe(
      `INSERT INTO stock_transfer_events (
         transfer_id,
         event_type,
         actor_user_id,
         branch_id,
         message,
         metadata,
         payload,
         aggregate_version,
         schema_version,
         correlation_id,
         causation_id,
         idempotency_key
       )
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6::jsonb, $7::jsonb, $8, 1, $9, $10, $11)`,
      transferId,
      eventType,
      actorUserId,
      branchId,
      message,
      metadata ? JSON.stringify(metadata) : null,
      metadata ? JSON.stringify(metadata) : null,
      nextVersion,
      ctx.correlationId,
      ctx.causationId,
      ctx.idempotencyKey,
    );
  }

  private async appendTransferAuditLog(
    tx: Prisma.TransactionClient,
    input: {
      branchId: string | null;
      actorUserId: string | null;
      transferId: string;
      action: string;
      oldPayload?: Record<string, unknown> | null;
      newPayload?: Record<string, unknown> | null;
    },
  ) {
    await this.auditLog.append(tx, {
      branchId: input.branchId,
      actorUserId: input.actorUserId,
      tableName: 'stock_transfers',
      recordId: input.transferId,
      action: input.action,
      oldPayload: input.oldPayload ?? null,
      newPayload: input.newPayload ?? null,
      entityType: 'transfer',
      entityId: input.transferId,
    });
  }

  private normalizeApproval(a: string | null | undefined): string {
    return (a ?? 'none').toLowerCase().trim() || 'none';
  }

  private normalizeRole(role: string | null | undefined): string {
    return (role ?? '').toLowerCase().trim();
  }

  private asText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private assertApproverRole(actor: ActorContext) {
    const role = this.normalizeRole(actor.userRole);
    if (role !== 'admin' && role !== 'manager') {
      throw new ForbiddenException('Only manager/admin can approve or reject');
    }
  }

  private transferAmountFromLines(
    lines: Array<{
      quantity: number;
      unit_amount?: number;
      line_cost?: number;
    }>,
  ): number {
    const snapshotTotal = lines.reduce(
      (sum, line) => sum + Number(line.line_cost ?? 0),
      0,
    );
    if (snapshotTotal > 0) return Number(snapshotTotal.toFixed(2));
    const valuation = lines.reduce(
      (sum, line) =>
        sum + Number(line.quantity) * Number(line.unit_amount ?? 0),
      0,
    );
    if (valuation > 0) return Number(valuation.toFixed(2));
    return 0;
  }

  private assertPositiveTransferJournalAmount(
    amount: number,
    stage: string,
  ): void {
    if (!(Number(amount) > 0)) {
      throw new BadRequestException(
        `Cannot post transfer (${stage}): missing unit cost. Record purchases with cost, set batch costs, or set product list price.`,
      );
    }
  }

  private transferInboundBatchMarker(
    transferId: string,
    productId: string,
  ): string {
    return `xfer:${transferId}:${productId}`.slice(0, 100);
  }

  private transferShipReverseBatchMarker(
    transferId: string,
    productId: string,
  ): string {
    return `xfer-rev:${transferId}:${productId}`.slice(0, 100);
  }

  private resolveEntryDate(row: TransferRow): Date {
    const expected = row.expected_date;
    if (expected instanceof Date) return expected;
    if (typeof expected === 'string' && expected.trim()) {
      return new Date(expected);
    }
    return new Date();
  }

  private async assertFinancialDateOpen(
    tx: Prisma.TransactionClient,
    branchId: string,
    entryDate: Date,
  ): Promise<void> {
    await this.accountingLockDate.assertEntryDateOpen(tx, branchId, entryDate);
  }

  private async acquireProcessingLock(
    tx: Prisma.TransactionClient,
    row: TransferRow,
    id: string,
    actorUserId: string | null,
    stage: string,
  ): Promise<LockAcquireResult> {
    const previousOwner = this.asText(row.processing_lock_owner) || null;
    const previousStage = this.asText(row.processing_stage) || null;
    const previousLockUntil = row.processing_lock_until
      ? new Date(row.processing_lock_until as Date).toISOString()
      : null;
    const previousLockStillActive =
      previousLockUntil != null &&
      new Date(previousLockUntil).getTime() >= Date.now();
    const updated = await tx.$executeRawUnsafe(
      `UPDATE stock_transfers
       SET processing_lock_owner = $2::uuid,
           processing_lock_until = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
           processing_stage = $3
       WHERE id = $1::uuid
         AND (
           processing_lock_until IS NULL OR
           processing_lock_until < CURRENT_TIMESTAMP
         )`,
      id,
      actorUserId,
      stage,
    );
    if (updated !== 1) {
      throw new BadRequestException(
        'Transfer is being processed by another user. Please retry shortly.',
      );
    }
    return {
      tookOverExpiredLock:
        Boolean(previousOwner) &&
        !previousLockStillActive &&
        previousOwner !== actorUserId,
      previousOwner,
      previousStage,
      previousLockUntil,
    };
  }

  private async releaseProcessingLock(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `UPDATE stock_transfers
       SET processing_lock_owner = NULL,
           processing_lock_until = NULL,
           processing_stage = NULL
       WHERE id = $1::uuid`,
      id,
    );
  }

  private async ensureTransferCostSnapshot(
    tx: Prisma.TransactionClient,
    transferId: string,
    fromBranchId: string,
  ): Promise<void> {
    const lines = await tx.$queryRawUnsafe<
      {
        id: string;
        product_id: string;
        quantity: number;
        unit_cost_snapshot: number | null;
      }[]
    >(
      `SELECT id, product_id, quantity, unit_cost_snapshot
       FROM stock_transfer_items
       WHERE transfer_id = $1::uuid`,
      transferId,
    );
    for (const line of lines) {
      const existingUnit = Number(line.unit_cost_snapshot ?? 0);
      const unitCost =
        existingUnit > 0
          ? existingUnit
          : await this.inventoryService.previewTransferUnitCost(tx, {
              branchId: fromBranchId,
              productId: line.product_id,
              quantity: Number(line.quantity),
            });
      const lineCost = Number((unitCost * Number(line.quantity)).toFixed(2));
      await tx.$executeRawUnsafe(
        `UPDATE stock_transfer_items
         SET unit_cost_snapshot = $2::numeric,
             line_cost_snapshot = $3::numeric
         WHERE id = $1::uuid`,
        line.id,
        unitCost,
        lineCost,
      );
    }
  }

  private async logTransferError(
    schema: string,
    transferId: string | null,
    stage: string,
    err: unknown,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const message =
      err instanceof Error
        ? err.message
        : this.asText((err as { message?: unknown })?.message);
    await this.prisma.withTenantSchema(schema, (tx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO transfer_error_log (transfer_id, stage, error_message, payload)
         VALUES ($1::uuid, $2, $3, $4::jsonb)`,
        transferId,
        stage,
        message || 'Unknown transfer failure',
        JSON.stringify(payload),
      ),
    );
  }

  private jsonObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    return value as Record<string, unknown>;
  }

  private normalizeEventContext(ctx?: EventContext): Required<EventContext> {
    return {
      idempotencyKey: (ctx?.idempotencyKey ?? '').trim() || null,
      correlationId: (ctx?.correlationId ?? '').trim() || null,
      causationId: (ctx?.causationId ?? '').trim() || null,
    };
  }

  private async assertTransitionUpdated(
    tx: Prisma.TransactionClient,
    sql: string,
    ...params: unknown[]
  ) {
    const updated = await tx.$executeRawUnsafe(sql, ...params);
    if (updated !== 1) {
      throw new BadRequestException(
        'Transfer changed by another user. Please refresh and retry.',
      );
    }
  }

  private async expectedStockSnapshot(
    tx: Prisma.TransactionClient,
    transferId: string,
    fromBranchId: string,
  ): Promise<Record<string, unknown>[]> {
    const lines = await tx.$queryRawUnsafe<
      { product_id: string; quantity: number }[]
    >(
      `SELECT product_id, quantity
       FROM stock_transfer_items
       WHERE transfer_id = $1::uuid`,
      transferId,
    );
    const snapshot: Record<string, unknown>[] = [];
    for (const line of lines) {
      const [inv] = await tx.$queryRawUnsafe<{ quantity: number | null }[]>(
        `SELECT quantity
         FROM inventory
         WHERE branch_id = $1::uuid AND product_id = $2::uuid
         FOR UPDATE`,
        fromBranchId,
        line.product_id,
      );
      snapshot.push({
        product_id: line.product_id,
        quantity: Number(line.quantity),
        stock_at_confirmation: Number(inv?.quantity ?? 0),
      });
    }
    return snapshot;
  }

  private async assertTransferItemsAllowedForSourceBranch(
    tx: Prisma.TransactionClient,
    fromBranchId: string,
    items: Array<{ product_id: string; quantity: number }>,
  ): Promise<void> {
    const requestedByProduct = new Map<string, number>();
    for (const item of items) {
      const next = Number(item.quantity ?? 0);
      const prev = Number(requestedByProduct.get(item.product_id) ?? 0);
      requestedByProduct.set(item.product_id, prev + next);
    }
    const productIds = Array.from(requestedByProduct.keys());
    if (!productIds.length) {
      throw new BadRequestException('At least one line item is required');
    }

    const rows = await tx.$queryRawUnsafe<
      Array<{ product_id: string; available_quantity: number }>
    >(
      `SELECT
         p.id AS product_id,
         COALESCE(i.quantity, 0)::int AS available_quantity
       FROM products p
       LEFT JOIN inventory i
         ON i.product_id = p.id
        AND i.branch_id = $1::uuid
       WHERE p.id = ANY($2::uuid[])
         AND (p.branch_id IS NULL OR p.branch_id = $1::uuid)`,
      fromBranchId,
      productIds,
    );
    const availableByProduct = new Map<string, number>();
    for (const row of rows) {
      availableByProduct.set(
        this.asText(row.product_id),
        Number(row.available_quantity ?? 0),
      );
    }

    for (const [productId, requestedQty] of requestedByProduct.entries()) {
      if (!availableByProduct.has(productId)) {
        throw new ForbiddenException(
          `Product ${productId} is not available in your current branch`,
        );
      }
      const availableQty = Number(availableByProduct.get(productId) ?? 0);
      if (requestedQty > availableQty) {
        throw new BadRequestException(
          `Requested quantity (${requestedQty}) exceeds available stock (${availableQty}) for product ${productId}`,
        );
      }
    }
  }

  private async resolveCreatedByNameInTx(
    tx: Prisma.TransactionClient,
    actorUserId?: string | null,
    providedName?: string | null,
  ): Promise<string | null> {
    const fromPayload = providedName?.trim();
    if (fromPayload) return fromPayload;
    if (!actorUserId) return null;
    const [user] = await tx.$queryRawUnsafe<Array<{ name: string | null }>>(
      `SELECT name FROM users WHERE id = $1::uuid LIMIT 1`,
      actorUserId,
    );
    const resolved = user?.name?.trim();
    return resolved?.length ? resolved : null;
  }

  private assertStockSnapshotValid(
    snapshot: Record<string, unknown>[] | null,
    currentByProduct: Map<string, number>,
  ) {
    if (!snapshot?.length) return;
    for (const row of snapshot) {
      const productId = this.asText(row.product_id);
      const expected = Number(row.stock_at_confirmation ?? 0);
      const current = Number(currentByProduct.get(productId) ?? 0);
      if (current !== expected) {
        throw new BadRequestException(
          `Stock changed for product ${productId}. Please retry transfer shipment.`,
        );
      }
    }
  }

  private async readJournalTotals(
    tx: Prisma.TransactionClient,
    journalId: string,
  ): Promise<{ debit: number; credit: number }> {
    const [totals] = await tx.$queryRawUnsafe<
      { debit_total: number; credit_total: number }[]
    >(
      `SELECT
         COALESCE(SUM(debit), 0)::numeric AS debit_total,
         COALESCE(SUM(credit), 0)::numeric AS credit_total
       FROM journal_lines
       WHERE journal_entry_id = $1::uuid`,
      journalId,
    );
    return {
      debit: Number(totals?.debit_total ?? 0),
      credit: Number(totals?.credit_total ?? 0),
    };
  }

  private async assertCrossBranchBalance(
    tx: Prisma.TransactionClient,
    shipJournalId: string,
    receiveJournalId: string,
  ) {
    const ship = await this.readJournalTotals(tx, shipJournalId);
    const receive = await this.readJournalTotals(tx, receiveJournalId);
    if (Math.abs(ship.debit - receive.credit) > EPSILON) {
      throw new BadRequestException(
        'Cross-branch balance mismatch (DueFrom vs DueTo).',
      );
    }
  }

  private canShipByApproval(approvalState: string | null | undefined): boolean {
    const a = this.normalizeApproval(approvalState);
    return a === 'approved';
  }

  async create(
    schema: string,
    dto: CreateTransferDto,
    mutationBranchId: string,
    actorUserId?: string | null,
    createdByName?: string | null,
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    if (dto.from_branch_id && dto.from_branch_id !== mutationBranchId) {
      throw new ForbiddenException(
        'Transfer must ship from your current branch (from_branch_id)',
      );
    }
    const fromBranchId = mutationBranchId;
    if (fromBranchId === dto.to_branch_id) {
      throw new BadRequestException(
        'Source and destination branch must differ',
      );
    }
    if (!dto.items?.length) {
      throw new BadRequestException('At least one line item is required');
    }

    return this.prisma.withTenantSchema(schema, async (tx) => {
      const createdByResolved = await this.resolveCreatedByNameInTx(
        tx,
        actorUserId ?? null,
        createdByName ?? null,
      );
      await this.assertTransferItemsAllowedForSourceBranch(
        tx,
        fromBranchId,
        dto.items,
      );
      const [t] = await tx.$queryRawUnsafe<TransferRow[]>(
        `INSERT INTO stock_transfers (
           from_branch_id, to_branch_id, status, approval_state, expected_date, created_by_name
         ) VALUES ($1::uuid, $2::uuid, 'draft', 'none', $3::date, $4)
         RETURNING id`,
        fromBranchId,
        dto.to_branch_id,
        dto.expected_date ?? null,
        createdByResolved,
      );
      const transferId = this.asText(t['id']);

      for (const line of dto.items) {
        await tx.$queryRawUnsafe(
          `INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
           VALUES ($1::uuid, $2::uuid, $3)`,
          transferId,
          line.product_id,
          line.quantity,
        );
      }

      await this.insertEvent(
        tx,
        transferId,
        'CREATED',
        actorUserId ?? null,
        mutationBranchId,
        'Transfer created',
        {
          from_branch_id: fromBranchId,
          to_branch_id: dto.to_branch_id,
        },
        eventContext,
      );

      return this.findOneInTx(tx, schema, transferId);
    });
  }

  /** Same connection as outer `withTenantSchema` transaction — no nested withTenantSchema. */
  private async findOneInTx(
    tx: Prisma.TransactionClient,
    _schema: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
      `SELECT
         id, transfer_number, from_branch_id, to_branch_id, status, approval_state,
         lock_version, expected_date, expected_stock_snapshot, created_at, confirmed_at, approved_by, approved_at, shipped_at, received_at,
         ship_accounting_state, receive_accounting_state, last_accounting_error,
         shipped_journal_entry_id, receive_journal_entry_id,
         ship_reversal_journal_entry_id, receive_reversal_journal_entry_id,
         is_reversed, reversed_by, reversed_at, reversal_reason,
         processing_lock_owner, processing_lock_until, processing_stage,
         COALESCE(created_by_name, creator.name) AS created_by_name, reject_reason
       FROM stock_transfers t
       LEFT JOIN LATERAL (
         SELECT u.name
         FROM stock_transfer_events e
         JOIN users u ON u.id = e.actor_user_id
         WHERE e.transfer_id = t.id
           AND e.event_type = 'CREATED'
           AND u.name IS NOT NULL
         ORDER BY e.created_at ASC
         LIMIT 1
       ) creator ON TRUE
       WHERE t.id = $1::uuid`,
      id,
    );
    if (!row) throw new NotFoundException('Transfer not found');

    const items = this.castSql<Record<string, unknown>[]>(
      await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT
         sti.id, sti.product_id, sti.quantity, sti.received_quantity, sti.unit_cost_snapshot, sti.line_cost_snapshot,
         p.name AS prod_name, p.barcode AS prod_barcode, p.unit AS prod_unit
       FROM stock_transfer_items sti
       LEFT JOIN products p ON p.id = sti.product_id
       WHERE sti.transfer_id = $1::uuid ORDER BY sti.id`,
        id,
      ),
    );

    const mappedItems = items.map((it: Record<string, unknown>) => ({
      id: this.asText(it.id),
      product_id: it.product_id ? this.asText(it.product_id) : undefined,
      quantity: Number(it.quantity ?? 0),
      received_quantity:
        it.received_quantity != null ? Number(it.received_quantity) : null,
      unit_cost_snapshot:
        it.unit_cost_snapshot != null ? Number(it.unit_cost_snapshot) : null,
      line_cost_snapshot:
        it.line_cost_snapshot != null ? Number(it.line_cost_snapshot) : null,
      product: it.prod_name
        ? {
            name: it.prod_name,
            sku: it.prod_barcode ?? null,
            unit: it.prod_unit ?? null,
          }
        : null,
    }));

    const status = this.asText(row.status);
    let inTransitQty: number | null = null;
    if (status === 'shipped') {
      inTransitQty = mappedItems.reduce(
        (s: number, l: TransferDetailLineForQty) => s + l.quantity,
        0,
      );
    }

    return {
      id: this.asText(row.id),
      transfer_number: row.transfer_number ?? null,
      from_branch_id: row.from_branch_id
        ? this.asText(row.from_branch_id)
        : undefined,
      to_branch_id: row.to_branch_id
        ? this.asText(row.to_branch_id)
        : undefined,
      status,
      approval_state:
        row.approval_state != null ? this.asText(row.approval_state) : 'none',
      approval_status:
        row.approval_state != null ? this.asText(row.approval_state) : 'none',
      lock_version: Number(row.lock_version ?? 0),
      expected_date: row.expected_date
        ? (row.expected_date as Date).toISOString().slice(0, 10)
        : null,
      expected_stock_snapshot:
        this.jsonObject(row.expected_stock_snapshot) ??
        row.expected_stock_snapshot,
      created_at: row.created_at
        ? new Date(row.created_at as Date).toISOString()
        : undefined,
      confirmed_at: row.confirmed_at
        ? new Date(row.confirmed_at as Date).toISOString()
        : null,
      approved_by: row.approved_by ? this.asText(row.approved_by) : null,
      approved_at: row.approved_at
        ? new Date(row.approved_at as Date).toISOString()
        : null,
      shipped_at: row.shipped_at
        ? new Date(row.shipped_at as Date).toISOString()
        : null,
      received_at: row.received_at
        ? new Date(row.received_at as Date).toISOString()
        : null,
      ship_accounting_state:
        this.asText(row.ship_accounting_state) || 'pending',
      receive_accounting_state:
        this.asText(row.receive_accounting_state) || 'pending',
      last_accounting_error:
        row.last_accounting_error != null
          ? this.asText(row.last_accounting_error)
          : null,
      shipped_journal_entry_id: row.shipped_journal_entry_id
        ? this.asText(row.shipped_journal_entry_id)
        : null,
      receive_journal_entry_id: row.receive_journal_entry_id
        ? this.asText(row.receive_journal_entry_id)
        : null,
      ship_reversal_journal_entry_id: row.ship_reversal_journal_entry_id
        ? this.asText(row.ship_reversal_journal_entry_id)
        : null,
      receive_reversal_journal_entry_id: row.receive_reversal_journal_entry_id
        ? this.asText(row.receive_reversal_journal_entry_id)
        : null,
      is_reversed: Boolean(row.is_reversed),
      reversed_by: row.reversed_by ? this.asText(row.reversed_by) : null,
      reversed_at: row.reversed_at
        ? new Date(row.reversed_at as Date).toISOString()
        : null,
      reversal_reason:
        row.reversal_reason != null ? this.asText(row.reversal_reason) : null,
      processing_lock_owner: row.processing_lock_owner
        ? this.asText(row.processing_lock_owner)
        : null,
      processing_lock_until: row.processing_lock_until
        ? new Date(row.processing_lock_until as Date).toISOString()
        : null,
      processing_stage:
        row.processing_stage != null ? this.asText(row.processing_stage) : null,
      created_by_name: row.created_by_name ?? null,
      items: mappedItems,
      in_transit_quantity: inTransitQty,
    };
  }

  async update(
    schema: string,
    id: string,
    dto: UpdateTransferDto,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actorUserId?: string | null,
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!row) throw new NotFoundException('Transfer not found');
      if (!this.transferVisible(row, allowedBranchIds)) {
        throw new ForbiddenException('Access denied to this transfer');
      }
      if (this.asText(row.from_branch_id) !== mutationBranchId) {
        throw new ForbiddenException(
          'Only the source branch can edit this transfer',
        );
      }

      const status = this.asText(row.status);
      if (status !== 'draft' && status !== 'confirmed') {
        throw new BadRequestException(
          'Only draft or confirmed transfers can be updated',
        );
      }
      const lockUntil = row.processing_lock_until
        ? new Date(row.processing_lock_until as Date)
        : null;
      if (lockUntil && lockUntil.getTime() > Date.now()) {
        throw new BadRequestException(
          'Transfer is processing and currently soft-locked for editing',
        );
      }

      if (dto.to_branch_id != null && status !== 'draft') {
        throw new BadRequestException(
          'Branch fields can only change while draft',
        );
      }

      const persistedFrom = this.asText(row.from_branch_id);
      if (persistedFrom !== mutationBranchId) {
        throw new ForbiddenException(
          'Transfer must ship from your current branch (from_branch_id)',
        );
      }
      if (
        dto.from_branch_id != null &&
        dto.from_branch_id !== mutationBranchId
      ) {
        throw new ForbiddenException(
          'from_branch_id must stay your current branch',
        );
      }
      const nextFrom = mutationBranchId;
      const nextTo = dto.to_branch_id ?? this.asText(row.to_branch_id);
      if (nextFrom === nextTo) {
        throw new BadRequestException(
          'Source and destination branch must differ',
        );
      }

      const sets: string[] = [];
      const updParams: unknown[] = [];
      let pi = 1;
      if (dto.to_branch_id != null) {
        sets.push(`to_branch_id = $${pi++}::uuid`);
        updParams.push(dto.to_branch_id);
      }
      if (dto.expected_date !== undefined) {
        sets.push(`expected_date = $${pi++}::date`);
        updParams.push(
          dto.expected_date === null || dto.expected_date === ''
            ? null
            : dto.expected_date,
        );
      }

      let changed = false;
      if (sets.length) {
        updParams.push(id);
        await tx.$queryRawUnsafe(
          `UPDATE stock_transfers SET ${sets.join(', ')} WHERE id = $${pi}::uuid`,
          ...updParams,
        );
        changed = true;
      }

      if (dto.items !== undefined) {
        if (!dto.items.length) {
          throw new BadRequestException('At least one line item is required');
        }
        await this.assertTransferItemsAllowedForSourceBranch(
          tx,
          nextFrom,
          dto.items,
        );
        await tx.$queryRawUnsafe(
          `DELETE FROM stock_transfer_items WHERE transfer_id = $1::uuid`,
          id,
        );
        for (const line of dto.items) {
          await tx.$queryRawUnsafe(
            `INSERT INTO stock_transfer_items (transfer_id, product_id, quantity)
             VALUES ($1::uuid, $2::uuid, $3)`,
            id,
            line.product_id,
            line.quantity,
          );
        }
        changed = true;
      }

      if (!changed) {
        return this.findOneInTx(tx, schema, id);
      }

      await this.insertEvent(
        tx,
        id,
        'EDITED',
        actorUserId ?? null,
        mutationBranchId,
        'Transfer updated',
        null,
        eventContext,
      );
      return this.findOneInTx(tx, schema, id);
    });
  }

  async confirm(
    schema: string,
    id: string,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!row) throw new NotFoundException('Transfer not found');
      if (!this.transferVisible(row, allowedBranchIds)) {
        throw new ForbiddenException('Access denied to this transfer');
      }
      if (this.asText(row.from_branch_id) !== mutationBranchId) {
        throw new ForbiddenException('Only the source branch can confirm');
      }
      if (this.asText(row.status) !== 'draft') {
        throw new BadRequestException('Only draft transfers can be confirmed');
      }

      const snapshot = await this.expectedStockSnapshot(
        tx,
        id,
        mutationBranchId,
      );
      await this.ensureTransferCostSnapshot(tx, id, mutationBranchId);
      await this.assertTransitionUpdated(
        tx,
        `UPDATE stock_transfers
         SET status = 'confirmed',
             confirmed_at = CURRENT_TIMESTAMP,
             approval_state = 'pending',
             expected_stock_snapshot = $2::jsonb,
             lock_version = lock_version + 1
         WHERE id = $1::uuid AND status = 'draft'`,
        id,
        JSON.stringify({ items: snapshot }),
      );
      await this.insertEvent(
        tx,
        id,
        'CONFIRMED',
        actor.userId ?? null,
        mutationBranchId,
        'Transfer confirmed',
        { expected_stock_snapshot: snapshot },
        eventContext,
      );
      return this.findOneInTx(tx, schema, id);
    });
  }

  async requestApproval(
    schema: string,
    id: string,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!row) throw new NotFoundException('Transfer not found');
      if (!this.transferVisible(row, allowedBranchIds)) {
        throw new ForbiddenException('Access denied to this transfer');
      }
      if (this.asText(row.from_branch_id) !== mutationBranchId) {
        throw new ForbiddenException(
          'Only the source branch can request approval',
        );
      }
      const st = this.asText(row.status);
      if (st !== 'confirmed') {
        throw new BadRequestException('Invalid status for approval request');
      }
      const ap = this.normalizeApproval(row.approval_state as string);
      if (ap !== 'none' && ap !== 'rejected') {
        throw new BadRequestException('Approval request is not allowed');
      }

      const snapshot = await this.expectedStockSnapshot(
        tx,
        id,
        mutationBranchId,
      );
      await this.ensureTransferCostSnapshot(tx, id, mutationBranchId);
      await this.assertTransitionUpdated(
        tx,
        `UPDATE stock_transfers
         SET approval_state = 'pending',
             expected_stock_snapshot = $2::jsonb,
             lock_version = lock_version + 1
         WHERE id = $1::uuid AND status = 'confirmed'`,
        id,
        JSON.stringify({ items: snapshot }),
      );
      await this.insertEvent(
        tx,
        id,
        'EDITED',
        actor.userId ?? null,
        mutationBranchId,
        'Approval requested',
        { expected_stock_snapshot: snapshot },
        eventContext,
      );
      return this.findOneInTx(tx, schema, id);
    });
  }

  async approve(
    schema: string,
    id: string,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    try {
      return await this.prisma.withTenantSchema(schema, async (tx) => {
        const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
          `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
          id,
        );
        if (!row) throw new NotFoundException('Transfer not found');
        if (!this.transferVisible(row, allowedBranchIds)) {
          throw new ForbiddenException('Access denied to this transfer');
        }
        this.assertApproverRole(actor);
        const from = this.asText(row.from_branch_id);
        const to = this.asText(row.to_branch_id);
        if (mutationBranchId !== from && mutationBranchId !== to) {
          throw new ForbiddenException(
            'Approve from the source or destination branch context',
          );
        }
        if (
          this.normalizeApproval(row.approval_state as string) !== 'pending'
        ) {
          throw new BadRequestException('No pending approval');
        }

        await this.assertTransitionUpdated(
          tx,
          `UPDATE stock_transfers
           SET approval_state = 'approved',
               approved_by = $2::uuid,
               approved_at = CURRENT_TIMESTAMP,
               lock_version = lock_version + 1
           WHERE id = $1::uuid AND approval_state = 'pending'`,
          id,
          actor.userId ?? null,
        );
        await this.insertEvent(
          tx,
          id,
          'APPROVED',
          actor.userId ?? null,
          mutationBranchId,
          'Transfer approved',
          null,
          eventContext,
        );
        return this.findOneInTx(tx, schema, id);
      });
    } catch (err) {
      await this.logTransferError(schema, id, 'approve', err, {
        transfer_id: id,
        actor_user_id: actor.userId ?? null,
      });
      throw err;
    }
  }

  async reject(
    schema: string,
    id: string,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    reason?: string | null,
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!row) throw new NotFoundException('Transfer not found');
      if (!this.transferVisible(row, allowedBranchIds)) {
        throw new ForbiddenException('Access denied to this transfer');
      }
      this.assertApproverRole(actor);
      const from = this.asText(row.from_branch_id);
      const to = this.asText(row.to_branch_id);
      if (mutationBranchId !== from && mutationBranchId !== to) {
        throw new ForbiddenException(
          'Reject from the source or destination branch context',
        );
      }
      if (this.normalizeApproval(row.approval_state as string) !== 'pending') {
        throw new BadRequestException('No pending approval');
      }

      await this.assertTransitionUpdated(
        tx,
        `UPDATE stock_transfers
         SET approval_state = 'rejected',
             reject_reason = $2,
             approved_by = NULL,
             approved_at = NULL,
             lock_version = lock_version + 1
         WHERE id = $1::uuid AND approval_state = 'pending'`,
        id,
        reason ?? null,
      );
      await this.insertEvent(
        tx,
        id,
        'REJECTED',
        actor.userId ?? null,
        mutationBranchId,
        'Transfer rejected',
        {
          reason: reason ?? null,
        },
        eventContext,
      );
      return this.findOneInTx(tx, schema, id);
    });
  }

  async ship(
    schema: string,
    id: string,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    try {
      const out = await this.prisma.withTenantSchema(schema, async (tx) => {
        const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
          `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
          id,
        );
        if (!row) throw new NotFoundException('Transfer not found');
        if (!this.transferVisible(row, allowedBranchIds)) {
          throw new ForbiddenException('Access denied to this transfer');
        }
        if (this.asText(row.from_branch_id) !== mutationBranchId) {
          throw new ForbiddenException('Ship only from the source branch');
        }
        if (this.asText(row.status) !== 'confirmed') {
          throw new BadRequestException(
            'Only confirmed transfers can be shipped',
          );
        }
        if (row.is_reversed) {
          throw new BadRequestException('Reversed transfer cannot be shipped');
        }
        if (!this.canShipByApproval(row.approval_state as string)) {
          throw new BadRequestException(
            'Transfer must be approved before shipping',
          );
        }
        const fromBranch = this.asText(row.from_branch_id);
        const toBranch = this.asText(row.to_branch_id);
        const entryDate = this.resolveEntryDate(row);
        await this.assertFinancialDateOpen(tx, fromBranch, entryDate);
        const lockState = await this.acquireProcessingLock(
          tx,
          row,
          id,
          actor.userId ?? null,
          'ship',
        );
        if (lockState.tookOverExpiredLock) {
          await this.insertEvent(
            tx,
            id,
            'LOCK_TAKEN_OVER',
            actor.userId ?? null,
            mutationBranchId,
            'Processing lock taken over after expiry',
            {
              previous_lock_owner: lockState.previousOwner,
              previous_stage: lockState.previousStage,
              previous_lock_until: lockState.previousLockUntil,
              new_lock_owner: actor.userId ?? null,
              new_stage: 'ship',
            },
            eventContext,
          );
        }

        await this.ensureTransferCostSnapshot(tx, id, fromBranch);
        const lines = await tx.$queryRawUnsafe<
          {
            id: string;
            product_id: string;
            quantity: number;
            unit_cost_snapshot: number | null;
            line_cost_snapshot: number | null;
          }[]
        >(
          `SELECT id, product_id, quantity, unit_cost_snapshot, line_cost_snapshot
           FROM stock_transfer_items
           WHERE transfer_id = $1::uuid`,
          id,
        );
        const expectedSnapshot = row.expected_stock_snapshot;
        const currentByProduct = new Map<string, number>();
        for (const line of lines) {
          const [inv] = await tx.$queryRawUnsafe<{ quantity: number | null }[]>(
            `SELECT quantity
             FROM inventory
             WHERE branch_id = $1::uuid AND product_id = $2::uuid
             FOR UPDATE`,
            fromBranch,
            line.product_id,
          );
          currentByProduct.set(line.product_id, Number(inv?.quantity ?? 0));
        }
        const snapshotObject =
          expectedSnapshot && typeof expectedSnapshot === 'object'
            ? (expectedSnapshot as Record<string, unknown>)
            : null;
        const snapshotArray = Array.isArray(snapshotObject?.items)
          ? (snapshotObject.items as Record<string, unknown>[])
          : Array.isArray(expectedSnapshot)
            ? (expectedSnapshot as Record<string, unknown>[])
            : null;
        this.assertStockSnapshotValid(snapshotArray, currentByProduct);

        for (const line of lines) {
          const qty = Number(line.quantity);
          const productId = line.product_id;
          await this.inventoryService.ensureBatchesCoverAggregate(tx, {
            branchId: fromBranch,
            productId,
          });
          const previewUnit =
            await this.inventoryService.previewTransferUnitCost(tx, {
              branchId: fromBranch,
              productId,
              quantity: qty,
            });
          if (previewUnit > 0) {
            await this.inventoryService.hydrateMissingBatchCosts(tx, {
              branchId: fromBranch,
              productId,
              unitCost: previewUnit,
            });
          }
          const allocations = await this.inventoryService.consumeBatchesFifo(
            tx,
            {
              branchId: fromBranch,
              productId,
              quantity: qty,
            },
          );
          const fifoCost = allocations.reduce(
            (s, a) => s + a.quantity * a.unitCost,
            0,
          );
          const weightedUnit =
            qty > 0 ? Number((fifoCost / qty).toFixed(4)) : 0;
          const unitSnap = weightedUnit > EPSILON ? weightedUnit : previewUnit;
          const lineCost = Number((unitSnap * qty).toFixed(2));
          await tx.$executeRawUnsafe(
            `UPDATE stock_transfer_items
             SET unit_cost_snapshot = $2::numeric,
                 line_cost_snapshot = $3::numeric
             WHERE id = $1::uuid`,
            line.id,
            unitSnap,
            lineCost,
          );
          await this.inventoryService.decreaseStock(tx, {
            branchId: fromBranch,
            productId,
            quantity: qty,
          });
        }

        const linesForJournal = this.castSql<TransferJournalCostLineRow[]>(
          await tx.$queryRawUnsafe<TransferJournalCostLineRow[]>(
            `SELECT quantity, unit_cost_snapshot, line_cost_snapshot
           FROM stock_transfer_items
           WHERE transfer_id = $1::uuid`,
            id,
          ),
        );
        const journalAmount = this.transferAmountFromLines(
          linesForJournal.map((line: TransferJournalCostLineRow) => ({
            quantity: Number(line.quantity),
            unit_amount: Number(line.unit_cost_snapshot ?? 0),
            line_cost: Number(line.line_cost_snapshot ?? 0),
          })),
        );
        this.assertPositiveTransferJournalAmount(journalAmount, 'ship');
        const shipJournal =
          await this.accountingPosting.postTransferShipJournal(tx, {
            branchId: fromBranch,
            transferId: id,
            amount: journalAmount,
            entryDate,
            sourceBranchId: fromBranch,
            destinationBranchId: toBranch,
          });
        if (!shipJournal?.id) {
          throw new BadRequestException(
            'Accounting entry required before shipping transfer',
          );
        }
        await this.journals.assertJournalIntegrity(tx, shipJournal.id);

        await this.assertTransitionUpdated(
          tx,
          `UPDATE stock_transfers
           SET status = 'shipped',
               shipped_at = CURRENT_TIMESTAMP,
               shipped_journal_entry_id = $2::uuid,
               ship_accounting_state = 'posted',
               last_accounting_error = NULL,
               lock_version = lock_version + 1
           WHERE id = $1::uuid AND status = 'confirmed'`,
          id,
          shipJournal.id,
        );
        await this.insertEvent(
          tx,
          id,
          'SHIPPED',
          actor.userId ?? null,
          mutationBranchId,
          'Stock OUT @ source',
          {
            branch_id: fromBranch,
            journal_entry_id: shipJournal.id,
            amount: journalAmount,
          },
          eventContext,
        );
        await this.appendTransferAuditLog(tx, {
          branchId: fromBranch,
          actorUserId: actor.userId ?? null,
          transferId: id,
          action: 'interbranch_ship',
          oldPayload: { status: 'confirmed' },
          newPayload: {
            status: 'shipped',
            ship_journal_entry_id: shipJournal.id,
            amount: journalAmount,
          },
        });
        await this.monitoring.increment(schema, 'transfer_ship', 'success', {
          transfer_id: id,
          actor_user_id: actor.userId ?? null,
        });
        await this.releaseProcessingLock(tx, id);
        return this.findOneInTx(tx, schema, id);
      });
      this.scheduleReconciliationCheck(schema, id);
      return out;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : this.asText((err as { message?: unknown })?.message) ||
            'Ship failed';
      await this.prisma.withTenantSchema(schema, (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE stock_transfers
           SET ship_accounting_state = 'failed',
               last_accounting_error = $2
           WHERE id = $1::uuid`,
          id,
          message,
        ),
      );
      await this.logTransferError(schema, id, 'ship_journal', err, {
        transfer_id: id,
        actor_user_id: actor.userId ?? null,
      });
      await this.monitoring.increment(schema, 'transfer_ship', 'failure', {
        transfer_id: id,
        actor_user_id: actor.userId ?? null,
      });
      throw err;
    }
  }

  async receive(
    schema: string,
    id: string,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    try {
      const out = await this.prisma.withTenantSchema(schema, async (tx) => {
        const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
          `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
          id,
        );
        if (!row) throw new NotFoundException('Transfer not found');
        if (!this.transferVisible(row, allowedBranchIds)) {
          throw new ForbiddenException('Access denied to this transfer');
        }
        if (this.asText(row.to_branch_id) !== mutationBranchId) {
          throw new ForbiddenException(
            'Receive only at the destination branch',
          );
        }
        if (this.asText(row.status) !== 'shipped') {
          throw new BadRequestException(
            'Only shipped transfers can be received',
          );
        }
        if (row.is_reversed) {
          throw new BadRequestException('Reversed transfer cannot be received');
        }
        const toBranch = this.asText(row.to_branch_id);
        const fromBranch = this.asText(row.from_branch_id);
        const entryDate = this.resolveEntryDate(row);
        await this.assertFinancialDateOpen(tx, toBranch, entryDate);
        const lockState = await this.acquireProcessingLock(
          tx,
          row,
          id,
          actor.userId ?? null,
          'receive',
        );
        if (lockState.tookOverExpiredLock) {
          await this.insertEvent(
            tx,
            id,
            'LOCK_TAKEN_OVER',
            actor.userId ?? null,
            mutationBranchId,
            'Processing lock taken over after expiry',
            {
              previous_lock_owner: lockState.previousOwner,
              previous_stage: lockState.previousStage,
              previous_lock_until: lockState.previousLockUntil,
              new_lock_owner: actor.userId ?? null,
              new_stage: 'receive',
            },
            eventContext,
          );
        }

        await this.ensureTransferCostSnapshot(tx, id, fromBranch);
        const lines = await tx.$queryRawUnsafe<
          {
            product_id: string;
            quantity: number;
            unit_cost_snapshot: number | null;
            line_cost_snapshot: number | null;
          }[]
        >(
          `SELECT product_id, quantity, unit_cost_snapshot, line_cost_snapshot
           FROM stock_transfer_items
           WHERE transfer_id = $1::uuid`,
          id,
        );

        for (const line of lines) {
          const qty = Number(line.quantity);
          const productId = line.product_id;
          await this.inventoryService.increaseStock(tx, {
            branchId: toBranch,
            productId,
            quantity: qty,
          });
          let unitCost = Number(line.unit_cost_snapshot ?? 0);
          if (!(unitCost > 0)) {
            unitCost = await this.inventoryService.previewTransferUnitCost(tx, {
              branchId: fromBranch,
              productId,
              quantity: qty,
            });
          }
          const selling =
            await this.inventoryService.resolveSellingPriceForBranchProduct(
              tx,
              { branchId: toBranch, productId },
            );
          await this.inventoryService.insertTransferInboundBatch(tx, {
            branchId: toBranch,
            productId,
            quantity: qty,
            costPrice: unitCost,
            sellingPrice: selling,
            batchNumber: this.transferInboundBatchMarker(id, productId),
          });
        }

        const linesForReceiveJournal = this.castSql<
          TransferJournalCostLineRow[]
        >(
          await tx.$queryRawUnsafe<TransferJournalCostLineRow[]>(
            `SELECT quantity, unit_cost_snapshot, line_cost_snapshot
           FROM stock_transfer_items
           WHERE transfer_id = $1::uuid`,
            id,
          ),
        );
        const journalAmount = this.transferAmountFromLines(
          linesForReceiveJournal.map((line: TransferJournalCostLineRow) => ({
            quantity: Number(line.quantity),
            unit_amount: Number(line.unit_cost_snapshot ?? 0),
            line_cost: Number(line.line_cost_snapshot ?? 0),
          })),
        );
        this.assertPositiveTransferJournalAmount(journalAmount, 'receive');
        const receiveJournal =
          await this.accountingPosting.postTransferReceiveJournal(tx, {
            branchId: toBranch,
            transferId: id,
            amount: journalAmount,
            entryDate,
            sourceBranchId: fromBranch,
            destinationBranchId: toBranch,
          });
        if (!receiveJournal?.id) {
          throw new BadRequestException(
            'Accounting entry required before receiving transfer',
          );
        }
        await this.journals.assertJournalIntegrity(tx, receiveJournal.id);
        const shipJournalId = this.asText(row.shipped_journal_entry_id);
        if (!shipJournalId) {
          throw new BadRequestException(
            'Shipped journal missing. Cannot complete cross-branch reconciliation.',
          );
        }
        await this.assertCrossBranchBalance(
          tx,
          shipJournalId,
          receiveJournal.id,
        );

        await tx.$queryRawUnsafe(
          `UPDATE stock_transfer_items SET received_quantity = quantity WHERE transfer_id = $1::uuid`,
          id,
        );

        await this.assertTransitionUpdated(
          tx,
          `UPDATE stock_transfers
           SET status = 'received',
               received_at = CURRENT_TIMESTAMP,
               receive_journal_entry_id = $2::uuid,
               receive_accounting_state = 'posted',
               last_accounting_error = NULL,
               lock_version = lock_version + 1
           WHERE id = $1::uuid AND status = 'shipped'`,
          id,
          receiveJournal.id,
        );
        await this.insertEvent(
          tx,
          id,
          'RECEIVED',
          actor.userId ?? null,
          mutationBranchId,
          'Stock IN @ destination',
          {
            branch_id: toBranch,
            journal_entry_id: receiveJournal.id,
            amount: journalAmount,
          },
          eventContext,
        );
        await this.appendTransferAuditLog(tx, {
          branchId: toBranch,
          actorUserId: actor.userId ?? null,
          transferId: id,
          action: 'interbranch_receive',
          oldPayload: { status: 'shipped' },
          newPayload: {
            status: 'received',
            receive_journal_entry_id: receiveJournal.id,
            amount: journalAmount,
          },
        });
        await this.monitoring.increment(schema, 'transfer_receive', 'success', {
          transfer_id: id,
          actor_user_id: actor.userId ?? null,
        });
        await this.releaseProcessingLock(tx, id);
        return this.findOneInTx(tx, schema, id);
      });
      this.scheduleReconciliationCheck(schema, id);
      return out;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : this.asText((err as { message?: unknown })?.message) ||
            'Receive failed';
      await this.prisma.withTenantSchema(schema, (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE stock_transfers
           SET receive_accounting_state = 'failed',
               last_accounting_error = $2
           WHERE id = $1::uuid`,
          id,
          message,
        ),
      );
      await this.logTransferError(schema, id, 'receive_journal', err, {
        transfer_id: id,
        actor_user_id: actor.userId ?? null,
      });
      await this.monitoring.increment(schema, 'transfer_receive', 'failure', {
        transfer_id: id,
        actor_user_id: actor.userId ?? null,
      });
      throw err;
    }
  }

  async close(
    schema: string,
    id: string,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    return this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!row) throw new NotFoundException('Transfer not found');
      if (!this.transferVisible(row, allowedBranchIds)) {
        throw new ForbiddenException('Access denied to this transfer');
      }
      if (this.asText(row.to_branch_id) !== mutationBranchId) {
        throw new ForbiddenException(
          'Close only from the destination branch context',
        );
      }
      if (row.is_reversed) {
        throw new BadRequestException('Reversed transfer cannot be closed');
      }
      if (this.asText(row.status) !== 'received') {
        throw new BadRequestException('Only received transfers can be closed');
      }
      await this.assertTransitionUpdated(
        tx,
        `UPDATE stock_transfers
         SET status = 'closed',
             lock_version = lock_version + 1
         WHERE id = $1::uuid AND status = 'received'`,
        id,
      );
      await this.insertEvent(
        tx,
        id,
        'CLOSED',
        actor.userId ?? null,
        mutationBranchId,
        'Transfer lifecycle closed',
        null,
        eventContext,
      );
      await this.appendTransferAuditLog(tx, {
        branchId: this.asText(row.to_branch_id) || null,
        actorUserId: actor.userId ?? null,
        transferId: id,
        action: 'interbranch_close',
        oldPayload: { status: 'received' },
        newPayload: { status: 'closed' },
      });
      return this.findOneInTx(tx, schema, id);
    });
  }

  async reverse(
    schema: string,
    id: string,
    mutationBranchId: string,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    reason?: string | null,
    eventContext?: EventContext,
  ) {
    await this.ensureTables(schema);
    try {
      const out = await this.prisma.withTenantSchema(schema, async (tx) => {
        const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
          `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
          id,
        );
        if (!row) throw new NotFoundException('Transfer not found');
        if (!this.transferVisible(row, allowedBranchIds)) {
          throw new ForbiddenException('Access denied to this transfer');
        }
        const fromBranch = this.asText(row.from_branch_id);
        const toBranch = this.asText(row.to_branch_id);
        if (mutationBranchId !== fromBranch && mutationBranchId !== toBranch) {
          throw new ForbiddenException(
            'Reverse from source or destination branch',
          );
        }
        if (row.is_reversed) {
          throw new BadRequestException('Transfer already reversed');
        }

        const status = this.asText(row.status);
        if (status !== 'shipped' && status !== 'received') {
          throw new BadRequestException(
            'Only shipped or received transfers can be reversed',
          );
        }
        const entryDate = this.resolveEntryDate(row);
        await this.assertFinancialDateOpen(tx, fromBranch, entryDate);
        await this.assertFinancialDateOpen(tx, toBranch, entryDate);
        const lockState = await this.acquireProcessingLock(
          tx,
          row,
          id,
          actor.userId ?? null,
          'reverse',
        );
        if (lockState.tookOverExpiredLock) {
          await this.insertEvent(
            tx,
            id,
            'LOCK_TAKEN_OVER',
            actor.userId ?? null,
            mutationBranchId,
            'Processing lock taken over after expiry',
            {
              previous_lock_owner: lockState.previousOwner,
              previous_stage: lockState.previousStage,
              previous_lock_until: lockState.previousLockUntil,
              new_lock_owner: actor.userId ?? null,
              new_stage: 'reverse',
            },
            eventContext,
          );
        }

        await this.ensureTransferCostSnapshot(tx, id, fromBranch);
        const lines = this.castSql<TransferProductCostLineRow[]>(
          await tx.$queryRawUnsafe<TransferProductCostLineRow[]>(
            `SELECT product_id, quantity, unit_cost_snapshot, line_cost_snapshot
           FROM stock_transfer_items
           WHERE transfer_id = $1::uuid`,
            id,
          ),
        );
        const amount = this.transferAmountFromLines(
          lines.map((line: TransferProductCostLineRow) => ({
            quantity: Number(line.quantity),
            unit_amount: Number(line.unit_cost_snapshot ?? 0),
            line_cost: Number(line.line_cost_snapshot ?? 0),
          })),
        );
        this.assertPositiveTransferJournalAmount(amount, 'reverse');

        let shipReversalId: string | null = null;
        let receiveReversalId: string | null = null;

        if (status === 'shipped') {
          for (const line of lines) {
            const qty = Number(line.quantity);
            const productId = line.product_id;
            await this.inventoryService.increaseStock(tx, {
              branchId: fromBranch,
              productId,
              quantity: qty,
            });
            let unitCost = Number(line.unit_cost_snapshot ?? 0);
            if (!(unitCost > 0)) {
              unitCost = await this.inventoryService.previewTransferUnitCost(
                tx,
                {
                  branchId: fromBranch,
                  productId,
                  quantity: qty,
                },
              );
            }
            const selling =
              await this.inventoryService.resolveSellingPriceForBranchProduct(
                tx,
                { branchId: fromBranch, productId },
              );
            await this.inventoryService.insertTransferInboundBatch(tx, {
              branchId: fromBranch,
              productId,
              quantity: qty,
              costPrice: unitCost,
              sellingPrice: selling,
              batchNumber: this.transferShipReverseBatchMarker(id, productId),
            });
          }
          const shipReversal =
            await this.accountingPosting.postTransferShipReversalJournal(tx, {
              branchId: fromBranch,
              transferId: id,
              amount,
              entryDate,
              sourceBranchId: fromBranch,
              destinationBranchId: toBranch,
            });
          if (!shipReversal?.id) {
            throw new BadRequestException('Ship reversal journal is required');
          }
          await this.journals.assertJournalIntegrity(tx, shipReversal.id);
          shipReversalId = shipReversal.id;
        }

        if (status === 'received') {
          for (const line of lines) {
            const qty = Number(line.quantity);
            const productId = line.product_id;
            await this.inventoryService.deleteTransferInboundBatchByMarker(tx, {
              branchId: toBranch,
              productId,
              batchNumber: this.transferInboundBatchMarker(id, productId),
            });
            await this.inventoryService.decreaseStock(tx, {
              branchId: toBranch,
              productId,
              quantity: qty,
            });
            await this.inventoryService.increaseStock(tx, {
              branchId: fromBranch,
              productId,
              quantity: qty,
            });
          }

          const receiveReversal =
            await this.accountingPosting.postTransferReceiveReversalJournal(
              tx,
              {
                branchId: toBranch,
                transferId: id,
                amount,
                entryDate,
                sourceBranchId: fromBranch,
                destinationBranchId: toBranch,
              },
            );
          if (!receiveReversal?.id) {
            throw new BadRequestException(
              'Receive reversal journal is required',
            );
          }
          await this.journals.assertJournalIntegrity(tx, receiveReversal.id);
          receiveReversalId = receiveReversal.id;

          const shipReversal =
            await this.accountingPosting.postTransferShipReversalJournal(tx, {
              branchId: fromBranch,
              transferId: id,
              amount,
              entryDate,
              sourceBranchId: fromBranch,
              destinationBranchId: toBranch,
            });
          if (!shipReversal?.id) {
            throw new BadRequestException('Ship reversal journal is required');
          }
          await this.journals.assertJournalIntegrity(tx, shipReversal.id);
          shipReversalId = shipReversal.id;
        }

        await this.assertTransitionUpdated(
          tx,
          `UPDATE stock_transfers
           SET is_reversed = TRUE,
               reversed_by = $2::uuid,
               reversed_at = CURRENT_TIMESTAMP,
               reversal_reason = $3,
               ship_reversal_journal_entry_id = $4::uuid,
               receive_reversal_journal_entry_id = $5::uuid,
               last_accounting_error = NULL,
               lock_version = lock_version + 1
           WHERE id = $1::uuid AND is_reversed = FALSE`,
          id,
          actor.userId ?? null,
          reason ?? null,
          shipReversalId,
          receiveReversalId,
        );

        await this.insertEvent(
          tx,
          id,
          'REVERSED',
          actor.userId ?? null,
          mutationBranchId,
          'Transfer reversed',
          {
            previous_status: status,
            reason: reason ?? null,
            ship_reversal_journal_entry_id: shipReversalId,
            receive_reversal_journal_entry_id: receiveReversalId,
            amount,
          },
          eventContext,
        );
        await this.monitoring.increment(schema, 'transfer_reverse', 'success', {
          transfer_id: id,
          actor_user_id: actor.userId ?? null,
        });
        await this.releaseProcessingLock(tx, id);
        return this.findOneInTx(tx, schema, id);
      });
      this.scheduleReconciliationCheck(schema, id);
      return out;
    } catch (err) {
      await this.logTransferError(schema, id, 'reverse_journal', err, {
        transfer_id: id,
        actor_user_id: actor.userId ?? null,
      });
      await this.monitoring.increment(schema, 'transfer_reverse', 'failure', {
        transfer_id: id,
        actor_user_id: actor.userId ?? null,
      });
      throw err;
    }
  }

  private async findJournalEntryByTransferSource(
    tx: Prisma.TransactionClient,
    branchId: string,
    sourceType: 'transfer_ship' | 'transfer_receive',
    transferId: string,
  ): Promise<string | null> {
    const [r] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id::text AS id FROM journal_entries
       WHERE branch_id = $1::uuid AND source_type = $2 AND source_id = $3::uuid
       LIMIT 1`,
      branchId,
      sourceType,
      transferId,
    );
    return r?.id ?? null;
  }

  private async assertJournalNotLinkedToOtherTransfer(
    tx: Prisma.TransactionClient,
    journalId: string,
    transferId: string,
    column: 'shipped_journal_entry_id' | 'receive_journal_entry_id',
  ): Promise<void> {
    const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id::text AS id FROM stock_transfers
       WHERE ${column} = $1::uuid AND id != $2::uuid
       LIMIT 1`,
      journalId,
      transferId,
    );
    if (row?.id) {
      throw new BadRequestException(
        'Journal entry is already linked to a different transfer',
      );
    }
  }

  /**
   * Admin repair: link orphan transfer_ship / transfer_receive journals to the row.
   */
  async repairTransferJournalLinks(
    schema: string,
    id: string,
    body: TransferRepairConfirmDto,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ): Promise<TransferRepairResult> {
    if (!body?.confirm) {
      throw new BadRequestException('Repair requires { "confirm": true }');
    }
    await this.ensureTables(schema);
    const result = await this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!row) throw new NotFoundException('Transfer not found');
      if (!this.transferVisible(row, allowedBranchIds)) {
        throw new ForbiddenException('Access denied to this transfer');
      }
      if (row.is_reversed) {
        throw new BadRequestException('Cannot repair a reversed transfer');
      }
      const status = this.asText(row.status);
      const fromBranch = this.asText(row.from_branch_id);
      const toBranch = this.asText(row.to_branch_id);
      const actions: TransferRepairAction[] = [];
      const before = {
        shipped_journal_entry_id: row.shipped_journal_entry_id
          ? this.asText(row.shipped_journal_entry_id)
          : null,
        receive_journal_entry_id: row.receive_journal_entry_id
          ? this.asText(row.receive_journal_entry_id)
          : null,
      };

      const needShip =
        (status === 'shipped' ||
          status === 'received' ||
          status === 'closed') &&
        !row.shipped_journal_entry_id;
      const needReceive =
        (status === 'received' || status === 'closed') &&
        !row.receive_journal_entry_id;

      if (needShip) {
        const jid = await this.findJournalEntryByTransferSource(
          tx,
          fromBranch,
          'transfer_ship',
          id,
        );
        if (!jid) {
          throw new BadRequestException(
            'No orphan transfer_ship journal found; use recreate-missing-journals if appropriate',
          );
        }
        await this.assertJournalNotLinkedToOtherTransfer(
          tx,
          jid,
          id,
          'shipped_journal_entry_id',
        );
        await this.journals.assertJournalIntegrity(tx, jid);
        await this.assertTransitionUpdated(
          tx,
          `UPDATE stock_transfers
           SET shipped_journal_entry_id = $2::uuid,
               ship_accounting_state = 'posted',
               last_accounting_error = NULL,
               lock_version = lock_version + 1
           WHERE id = $1::uuid AND shipped_journal_entry_id IS NULL`,
          id,
          jid,
        );
        actions.push({ kind: 'link_ship_journal', journal_entry_id: jid });
      }

      const [row2] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid`,
        id,
      );
      if (!row2) throw new NotFoundException('Transfer not found');

      if (needReceive) {
        const jid = await this.findJournalEntryByTransferSource(
          tx,
          toBranch,
          'transfer_receive',
          id,
        );
        if (!jid) {
          throw new BadRequestException(
            'No orphan transfer_receive journal found; use recreate-missing-journals if appropriate',
          );
        }
        await this.assertJournalNotLinkedToOtherTransfer(
          tx,
          jid,
          id,
          'receive_journal_entry_id',
        );
        await this.journals.assertJournalIntegrity(tx, jid);
        const shipId = this.asText(row2.shipped_journal_entry_id);
        if (!shipId) {
          throw new BadRequestException(
            'Ship journal still missing after repair; fix ship side first',
          );
        }
        await this.assertCrossBranchBalance(tx, shipId, jid);
        await this.assertTransitionUpdated(
          tx,
          `UPDATE stock_transfers
           SET receive_journal_entry_id = $2::uuid,
               receive_accounting_state = 'posted',
               last_accounting_error = NULL,
               lock_version = lock_version + 1
           WHERE id = $1::uuid AND receive_journal_entry_id IS NULL`,
          id,
          jid,
        );
        actions.push({ kind: 'link_receive_journal', journal_entry_id: jid });
      }

      if (actions.length === 0) {
        return {
          transfer_id: id,
          before,
          after: before,
          actions,
        };
      }

      const [finalRow] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT shipped_journal_entry_id, receive_journal_entry_id FROM stock_transfers WHERE id = $1::uuid`,
        id,
      );
      const after = {
        shipped_journal_entry_id: finalRow?.shipped_journal_entry_id
          ? this.asText(finalRow.shipped_journal_entry_id)
          : null,
        receive_journal_entry_id: finalRow?.receive_journal_entry_id
          ? this.asText(finalRow.receive_journal_entry_id)
          : null,
      };

      await this.insertEvent(
        tx,
        id,
        'JOURNAL_LINK_REPAIRED',
        actor.userId ?? null,
        fromBranch,
        'Repair: journal entry ids linked from existing postings',
        { before, after, actions },
        eventContext,
      );
      await this.appendTransferAuditLog(tx, {
        branchId: fromBranch,
        actorUserId: actor.userId ?? null,
        transferId: id,
        action: 'interbranch_repair_journal_links',
        oldPayload: before,
        newPayload: after,
      });

      return { transfer_id: id, before, after, actions };
    });
    this.scheduleReconciliationCheck(schema, id);
    return result;
  }

  /**
   * Admin repair: align approval_state with event replay when safe.
   */
  async repairTransferApprovalFromReplay(
    schema: string,
    id: string,
    body: TransferRepairConfirmDto,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ): Promise<TransferRepairResult> {
    if (!body?.confirm) {
      throw new BadRequestException('Repair requires { "confirm": true }');
    }
    await this.ensureTables(schema);
    const result = await this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!row) throw new NotFoundException('Transfer not found');
      if (!this.transferVisible(row, allowedBranchIds)) {
        throw new ForbiddenException('Access denied to this transfer');
      }
      if (row.is_reversed) {
        throw new BadRequestException('Cannot repair a reversed transfer');
      }
      const fromBranch = this.asText(row.from_branch_id);
      const events = this.castSql<TransferApprovalReplayEventRow[]>(
        await tx.$queryRawUnsafe<TransferApprovalReplayEventRow[]>(
          `SELECT event_type, metadata
         FROM stock_transfer_events
         WHERE transfer_id = $1::uuid
         ORDER BY aggregate_version ASC, created_at ASC`,
          id,
        ),
      );
      const derived = deriveStateFromEvents(
        events.map((e: TransferApprovalReplayEventRow) => ({
          type: e.event_type,
          metadata:
            e.metadata && typeof e.metadata === 'object' ? e.metadata : null,
        })),
      );
      const desired = derived.approval_state;
      const dbAp = this.normalizeApproval(row.approval_state as string);

      if (dbAp === desired) {
        const snap = { approval_state: dbAp };
        return { transfer_id: id, before: snap, after: snap, actions: [] };
      }

      const allowed =
        (dbAp === 'none' && desired !== 'none') ||
        (dbAp === 'pending' &&
          (desired === 'approved' || desired === 'rejected'));

      if (!allowed) {
        throw new BadRequestException(
          `Approval replay sync refused: db=${dbAp} derived=${desired}. Inspect events manually.`,
        );
      }

      const before = { approval_state: dbAp };
      await this.assertTransitionUpdated(
        tx,
        `UPDATE stock_transfers
         SET approval_state = $2,
             lock_version = lock_version + 1
         WHERE id = $1::uuid`,
        id,
        desired,
      );
      const actions: TransferRepairAction[] = [
        { kind: 'update_approval_state', from: dbAp, to: desired },
      ];
      const after = { approval_state: desired };
      await this.insertEvent(
        tx,
        id,
        'APPROVAL_REPLAY_SYNC',
        actor.userId ?? null,
        fromBranch,
        'Repair: approval_state aligned with event replay',
        { before, after },
        eventContext,
      );
      await this.appendTransferAuditLog(tx, {
        branchId: fromBranch,
        actorUserId: actor.userId ?? null,
        transferId: id,
        action: 'interbranch_repair_approval_sync',
        oldPayload: before,
        newPayload: after,
      });
      return { transfer_id: id, before, after, actions };
    });
    this.scheduleReconciliationCheck(schema, id);
    return result;
  }

  /**
   * Admin repair: create missing ship/receive journals when no journal_entries row exists yet.
   */
  async recreateMissingTransferJournals(
    schema: string,
    id: string,
    body: TransferRepairConfirmDto,
    allowedBranchIds: string[],
    actor: ActorContext = {},
    eventContext?: EventContext,
  ): Promise<TransferRepairResult> {
    if (!body?.confirm) {
      throw new BadRequestException('Repair requires { "confirm": true }');
    }
    await this.ensureTables(schema);
    const result = await this.prisma.withTenantSchema(schema, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT * FROM stock_transfers WHERE id = $1::uuid FOR UPDATE`,
        id,
      );
      if (!row) throw new NotFoundException('Transfer not found');
      if (!this.transferVisible(row, allowedBranchIds)) {
        throw new ForbiddenException('Access denied to this transfer');
      }
      if (row.is_reversed) {
        throw new BadRequestException('Cannot repair a reversed transfer');
      }
      const status = this.asText(row.status);
      const fromBranch = this.asText(row.from_branch_id);
      const toBranch = this.asText(row.to_branch_id);
      const entryDate = this.resolveEntryDate(row);
      const actions: TransferRepairAction[] = [];
      const before = {
        shipped_journal_entry_id: row.shipped_journal_entry_id
          ? this.asText(row.shipped_journal_entry_id)
          : null,
        receive_journal_entry_id: row.receive_journal_entry_id
          ? this.asText(row.receive_journal_entry_id)
          : null,
      };

      if (
        status !== 'shipped' &&
        status !== 'received' &&
        status !== 'closed'
      ) {
        throw new BadRequestException(
          'Recreate journals only applies to shipped, received, or closed transfers',
        );
      }

      await this.ensureTransferCostSnapshot(tx, id, fromBranch);
      const lines = this.castSql<TransferProductCostLineRow[]>(
        await tx.$queryRawUnsafe<TransferProductCostLineRow[]>(
          `SELECT product_id, quantity, unit_cost_snapshot, line_cost_snapshot
         FROM stock_transfer_items
         WHERE transfer_id = $1::uuid`,
          id,
        ),
      );
      const journalAmount = this.transferAmountFromLines(
        lines.map((line: TransferProductCostLineRow) => ({
          quantity: Number(line.quantity),
          unit_amount: Number(line.unit_cost_snapshot ?? 0),
          line_cost: Number(line.line_cost_snapshot ?? 0),
        })),
      );
      this.assertPositiveTransferJournalAmount(
        journalAmount,
        'repair journal post',
      );

      if (!row.shipped_journal_entry_id) {
        const orphanShip = await this.findJournalEntryByTransferSource(
          tx,
          fromBranch,
          'transfer_ship',
          id,
        );
        if (orphanShip) {
          throw new BadRequestException(
            'transfer_ship journal already exists; use repair/journal-links instead',
          );
        }
        await this.assertFinancialDateOpen(tx, fromBranch, entryDate);
        const shipJournal =
          await this.accountingPosting.postTransferShipJournal(tx, {
            branchId: fromBranch,
            transferId: id,
            amount: journalAmount,
            entryDate,
            sourceBranchId: fromBranch,
            destinationBranchId: toBranch,
          });
        if (!shipJournal?.id) {
          throw new BadRequestException('Failed to create ship journal');
        }
        await this.journals.assertJournalIntegrity(tx, shipJournal.id);
        await this.assertTransitionUpdated(
          tx,
          `UPDATE stock_transfers
           SET shipped_journal_entry_id = $2::uuid,
               ship_accounting_state = 'posted',
               last_accounting_error = NULL,
               lock_version = lock_version + 1
           WHERE id = $1::uuid AND shipped_journal_entry_id IS NULL`,
          id,
          shipJournal.id,
        );
        actions.push({
          kind: 'create_ship_journal',
          journal_entry_id: shipJournal.id,
          amount: journalAmount,
        });
      }

      if (
        (status === 'received' || status === 'closed') &&
        !row.receive_journal_entry_id
      ) {
        const [rowNow] = await tx.$queryRawUnsafe<TransferRow[]>(
          `SELECT * FROM stock_transfers WHERE id = $1::uuid`,
          id,
        );
        const shipNow = this.asText(rowNow?.shipped_journal_entry_id);
        if (!shipNow) {
          throw new BadRequestException(
            'Ship journal is required before receive journal',
          );
        }
        const orphanRecv = await this.findJournalEntryByTransferSource(
          tx,
          toBranch,
          'transfer_receive',
          id,
        );
        if (orphanRecv) {
          throw new BadRequestException(
            'transfer_receive journal already exists; use repair/journal-links instead',
          );
        }
        await this.assertFinancialDateOpen(tx, toBranch, entryDate);
        const receiveJournal =
          await this.accountingPosting.postTransferReceiveJournal(tx, {
            branchId: toBranch,
            transferId: id,
            amount: journalAmount,
            entryDate,
            sourceBranchId: fromBranch,
            destinationBranchId: toBranch,
          });
        if (!receiveJournal?.id) {
          throw new BadRequestException('Failed to create receive journal');
        }
        await this.journals.assertJournalIntegrity(tx, receiveJournal.id);
        await this.assertCrossBranchBalance(tx, shipNow, receiveJournal.id);
        await this.assertTransitionUpdated(
          tx,
          `UPDATE stock_transfers
           SET receive_journal_entry_id = $2::uuid,
               receive_accounting_state = 'posted',
               last_accounting_error = NULL,
               lock_version = lock_version + 1
           WHERE id = $1::uuid AND receive_journal_entry_id IS NULL`,
          id,
          receiveJournal.id,
        );
        actions.push({
          kind: 'create_receive_journal',
          journal_entry_id: receiveJournal.id,
          amount: journalAmount,
        });
      }

      if (actions.length === 0) {
        return {
          transfer_id: id,
          before,
          after: before,
          actions,
        };
      }

      const [finalRow] = await tx.$queryRawUnsafe<TransferRow[]>(
        `SELECT shipped_journal_entry_id, receive_journal_entry_id FROM stock_transfers WHERE id = $1::uuid`,
        id,
      );
      const after = {
        shipped_journal_entry_id: finalRow?.shipped_journal_entry_id
          ? this.asText(finalRow.shipped_journal_entry_id)
          : null,
        receive_journal_entry_id: finalRow?.receive_journal_entry_id
          ? this.asText(finalRow.receive_journal_entry_id)
          : null,
      };

      await this.insertEvent(
        tx,
        id,
        'JOURNAL_RECREATED',
        actor.userId ?? null,
        fromBranch,
        'Repair: missing transfer journals created and linked',
        { before, after, actions },
        eventContext,
      );
      await this.appendTransferAuditLog(tx, {
        branchId: fromBranch,
        actorUserId: actor.userId ?? null,
        transferId: id,
        action: 'interbranch_repair_journal_recreate',
        oldPayload: before,
        newPayload: after,
      });

      return { transfer_id: id, before, after, actions };
    });
    this.scheduleReconciliationCheck(schema, id);
    return result;
  }
}
