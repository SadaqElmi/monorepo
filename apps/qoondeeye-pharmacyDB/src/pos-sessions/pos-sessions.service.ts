import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AccountingPostingService } from '../accounting/accounting-posting.service';
import { AccountingLockDateService } from '../accounting/accounting-lock-date.service';
import { AuditLogService } from '../accounting/audit-log.service';
import {
  STATEMENT_BUCKETS,
  paymentMethodToStatementBucket,
} from '../accounting/pos-statement-bucket.util';
import { BatchesService } from '../batches/batches.service';
import { CategoriesService } from '../categories/categories.service';
import { ProductsService } from '../products/products.service';
import { UomsService } from '../uoms/uoms.service';
import {
  POS_VARIANCE_APPROVAL_THRESHOLD,
  PosApprovalsService,
} from '../pos-approvals/pos-approvals.service';
import { hasEffectivePermission } from '../common/security/permission-catalog';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PosSessionFullRow {
  id: string;
  branch_id: string;
  device_id: string | null;
  staff_user_id: string | null;
  status: string;
  opened_at: Date;
  closed_at: Date | null;
}

export interface PosStatementLineRow {
  id: string;
  payment_bucket: string;
  expected_amount: string;
  actual_amount: string;
  difference: string;
}

export interface PosStatementDetailRow {
  id: string;
  session_id: string;
  status: string;
  journal_entry_id: string | null;
  created_at: Date;
  posted_at: Date | null;
}

@Injectable()
export class PosSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
    private readonly productsService: ProductsService,
    private readonly batchesService: BatchesService,
    private readonly categoriesService: CategoriesService,
    private readonly uomsService: UomsService,
    private readonly posApprovals: PosApprovalsService,
  ) {}

  private async assertVarianceApprovedIfNeeded(
    schemaName: string,
    tx: Prisma.TransactionClient,
    sessionId: string,
    branchId: string,
    varianceApprovalId?: string | null,
    permissionCodes?: string[],
  ) {
    const [totals] = await tx.$queryRawUnsafe<{ total: string }[]>(
      `SELECT COALESCE(SUM(ABS(psl.difference)), 0)::text AS total
       FROM pos_statements ps
       INNER JOIN pos_statement_lines psl ON psl.statement_id = ps.id
       WHERE ps.session_id = $1::uuid AND ps.status = 'posted'`,
      sessionId,
    );
    const totalVariance = Math.abs(Number(totals?.total ?? 0));
    if (totalVariance <= POS_VARIANCE_APPROVAL_THRESHOLD) return;

    const [session] = await tx.$queryRawUnsafe<
      { variance_approved_at: Date | null }[]
    >(
      `SELECT variance_approved_at FROM pos_sessions WHERE id = $1::uuid AND branch_id = $2::uuid`,
      sessionId,
      branchId,
    );
    if (session?.variance_approved_at) return;

    if (
      hasEffectivePermission(permissionCodes ?? [], 'pos_approve_variance')
    ) {
      return;
    }

    if (varianceApprovalId) {
      const { approvedBy } = await this.posApprovals.assertApprovedRequest(
        schemaName,
        branchId,
        varianceApprovalId,
        'cash_variance',
        (payload) => String(payload.sessionId ?? '') === sessionId,
      );
      if (approvedBy) {
        await tx.$queryRawUnsafe(
          `UPDATE pos_sessions
           SET variance_approved_by = $2::uuid, variance_approved_at = NOW()
           WHERE id = $1::uuid`,
          sessionId,
          approvedBy,
        );
      }
      return;
    }

    throw new BadRequestException(
      'Cash variance exceeds threshold and requires supervisor approval before closing',
    );
  }

  /** Products, batches, and categories for the register in one response. */
  async getRegisterCatalog(
    schemaName: string,
    tenantId: string,
    allowedBranchIds: string[],
  ) {
    const [prods, batchesData, cats] = await Promise.all([
      this.productsService.findAll(schemaName, tenantId, allowedBranchIds),
      this.batchesService.findAll(schemaName),
      this.categoriesService.findAll(
        schemaName,
        tenantId,
        allowedBranchIds,
      ),
    ]);
    const uomsByProduct = await this.uomsService.listProductUomsForProducts(
      schemaName,
      prods.map((p) => p.id),
    );
    return {
      prods: prods.map((p) => ({
        ...p,
        uoms: uomsByProduct[p.id] ?? [],
      })),
      batchesData,
      cats,
    };
  }

  private ensureBranch(branchId: string, allowedBranchIds: string[]): void {
    if (!allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('Access denied to this branch');
    }
  }

  async openSession(
    schemaName: string,
    branchId: string,
    allowedBranchIds: string[],
    input: {
      deviceId?: string | null;
      staffUserId?: string | null;
      openingCash?: number;
    },
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const openingCash = input.openingCash ?? 0;
    const deviceId = input.deviceId?.trim() ? input.deviceId : null;

    try {
      return await this.prisma.withTenantSchema(schemaName, async (tx) => {
        if (deviceId) {
          const [existingDevice] = await tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM pos_sessions
             WHERE device_id = $1::uuid AND status IN ('open', 'paused')
             LIMIT 1`,
            deviceId,
          );
          if (existingDevice) {
            throw new ConflictException(
              'An open POS session already exists for this terminal.',
            );
          }
        } else {
          const [existing] = await tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM pos_sessions
             WHERE branch_id = $1::uuid AND status = 'open'
             LIMIT 1`,
            branchId,
          );
          if (existing) {
            throw new ConflictException(
              'An open POS session already exists for this branch. Close it before opening a new one.',
            );
          }
        }

        const [row] = await tx.$queryRawUnsafe<
          {
            id: string;
            branch_id: string;
            device_id: string | null;
            staff_user_id: string | null;
            status: string;
            opened_at: Date;
            closed_at: Date | null;
            opening_cash: string | null;
          }[]
        >(
          `INSERT INTO pos_sessions (branch_id, device_id, staff_user_id, status, opening_cash)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'open', $4)
           RETURNING id, branch_id, device_id, staff_user_id, status, opened_at, closed_at, opening_cash`,
          branchId,
          deviceId,
          input.staffUserId?.trim() ? input.staffUserId : null,
          openingCash,
        );

        void this.auditLog.appendInSchema(schemaName, {
          branchId,
          actorUserId: input.staffUserId?.trim() ? input.staffUserId : null,
          tableName: 'pos_auth',
          recordId: deviceId ?? row.id,
          action: 'pos_shift_opened',
          newPayload: {
            sessionId: row.id,
            openingCash,
            deviceId,
          },
          entityType: 'pos_auth',
          entityId: deviceId ?? row.id,
        });

        return row;
      });
    } catch (e) {
      if (e instanceof ConflictException) throw e;
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        (e as { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'An open POS session already exists for this branch.',
        );
      }
      throw e;
    }
  }

  async getCurrentSession(
    schemaName: string,
    branchId: string,
    allowedBranchIds: string[],
    deviceId?: string | null,
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const scopedDeviceId = deviceId?.trim() ? deviceId : null;
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [session] = await tx.$queryRawUnsafe<
        (PosSessionFullRow & { opening_cash: string | null })[]
      >(
        scopedDeviceId
          ? `SELECT id, branch_id, device_id, staff_user_id, status, opened_at, closed_at,
                    opening_cash::text
             FROM pos_sessions
             WHERE device_id = $1::uuid AND status IN ('open', 'paused')
             ORDER BY opened_at DESC
             LIMIT 1`
          : `SELECT id, branch_id, device_id, staff_user_id, status, opened_at, closed_at,
                    opening_cash::text
             FROM pos_sessions
             WHERE branch_id = $1::uuid AND status IN ('open', 'paused')
             ORDER BY opened_at DESC
             LIMIT 1`,
        scopedDeviceId ?? branchId,
      );
      if (!session) return null;

      const [postedSt] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT ps.id
         FROM pos_statements ps
         WHERE ps.session_id = $1::uuid AND ps.status = 'posted'
         ORDER BY ps.posted_at DESC NULLS LAST
         LIMIT 1`,
        session.id,
      );

      return {
        ...session,
        opening_cash: Number(session.opening_cash ?? 0),
        hasPostedStatement: Boolean(postedSt?.id),
      };
    });
  }

  async listShifts(
    tenantId: string,
    schemaName: string,
    allowedBranchIds: string[],
    options?: {
      page?: number;
      limit?: number;
      branchId?: string;
      deviceId?: string;
      staffUserId?: string;
      status?: string;
      from?: string;
      to?: string;
    },
  ) {
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 25));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (options?.branchId) {
      this.ensureBranch(options.branchId, allowedBranchIds);
      conditions.push(`ps.branch_id = $${idx}::uuid`);
      params.push(options.branchId);
      idx += 1;
    } else if (allowedBranchIds.length > 0) {
      conditions.push(`ps.branch_id = ANY($${idx}::uuid[])`);
      params.push(allowedBranchIds);
      idx += 1;
    }

    if (options?.deviceId) {
      conditions.push(`ps.device_id = $${idx}::uuid`);
      params.push(options.deviceId);
      idx += 1;
    }
    if (options?.staffUserId) {
      conditions.push(`ps.staff_user_id = $${idx}::uuid`);
      params.push(options.staffUserId);
      idx += 1;
    }
    if (options?.status) {
      conditions.push(`ps.status = $${idx}`);
      params.push(options.status);
      idx += 1;
    }
    if (options?.from) {
      conditions.push(`ps.opened_at >= $${idx}::timestamptz`);
      params.push(options.from);
      idx += 1;
    }
    if (options?.to) {
      conditions.push(`ps.opened_at <= $${idx}::timestamptz`);
      params.push(options.to);
      idx += 1;
    }

    const whereSql = conditions.length ? conditions.join(' AND ') : 'TRUE';

    const selectSql = `
      SELECT ps.id, ps.branch_id, ps.device_id, ps.staff_user_id, ps.status,
             ps.opening_cash::text, ps.closing_cash::text,
             ps.opened_at, ps.closed_at, ps.variance_approved_at, ps.variance_approved_by,
             b.name AS branch_name,
             COALESCE(
               NULLIF(TRIM(u.name), ''),
               NULLIF(TRIM(u.staff_id), ''),
               NULLIF(TRIM(u.email), ''),
               NULL
             ) AS staff_name,
             COALESCE((
               SELECT SUM(ABS(psl.difference))
               FROM pos_statements pst
               JOIN pos_statement_lines psl ON psl.statement_id = pst.id
               WHERE pst.session_id = ps.id AND pst.status = 'posted'
             ), 0)::text AS total_variance,
             (
               SELECT pst.status
               FROM pos_statements pst
               WHERE pst.session_id = ps.id
               ORDER BY pst.created_at DESC
               LIMIT 1
             ) AS statement_status
      FROM pos_sessions ps
      LEFT JOIN branches b ON b.id = ps.branch_id
      LEFT JOIN users u ON u.id = ps.staff_user_id
      WHERE ${whereSql}
      ORDER BY ps.opened_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}`;

    const countSql = `SELECT COUNT(*)::bigint AS count FROM pos_sessions ps WHERE ${whereSql}`;

    const [countRow, rows] = await this.prisma.withTenantSchema(
      schemaName,
      async (tx) =>
        Promise.all([
          tx.$queryRawUnsafe<Array<{ count: bigint }>>(countSql, ...params),
          tx.$queryRawUnsafe<
            Array<{
              id: string;
              branch_id: string;
              device_id: string | null;
              staff_user_id: string | null;
              status: string;
              opening_cash: string | null;
              closing_cash: string | null;
              opened_at: Date;
              closed_at: Date | null;
              variance_approved_at: Date | null;
              variance_approved_by: string | null;
              branch_name: string | null;
              staff_name: string | null;
              total_variance: string;
              statement_status: string | null;
            }>
          >(selectSql, ...params, limit, offset),
        ]),
    );

    const deviceIds = [
      ...new Set(rows.map((r) => r.device_id).filter((id): id is string => Boolean(id))),
    ];
    const deviceNames = await this.loadDeviceDisplayNames(tenantId, deviceIds);

    return {
      items: rows.map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        branchName: r.branch_name?.trim() ?? null,
        deviceId: r.device_id,
        deviceName: r.device_id ? (deviceNames.get(r.device_id) ?? null) : null,
        staffUserId: r.staff_user_id,
        staffName: r.staff_name?.trim() ?? null,
        status: r.status,
        openingCash: Number(r.opening_cash ?? 0),
        closingCash: r.closing_cash != null ? Number(r.closing_cash) : null,
        openedAt: r.opened_at.toISOString(),
        closedAt: r.closed_at?.toISOString() ?? null,
        totalVariance: Number(r.total_variance ?? 0),
        varianceApproved: Boolean(r.variance_approved_at),
        varianceApprovedAt: r.variance_approved_at?.toISOString() ?? null,
        statementStatus: r.statement_status,
      })),
      total: Number(countRow[0]?.count ?? 0),
      page,
      limit,
    };
  }

  private async loadDeviceDisplayNames(
    tenantId: string,
    deviceIds: string[],
  ): Promise<Map<string, string>> {
    if (!deviceIds.length) return new Map();
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; display_name: string | null }>
    >(
      `SELECT id, display_name
       FROM "public"."pos_devices"
       WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
      tenantId,
      deviceIds,
    );
    return new Map(
      rows.map((r) => [r.id, r.display_name?.trim() || 'POS terminal']),
    );
  }

  async openStatement(
    schemaName: string,
    sessionId: string,
    branchId: string,
    allowedBranchIds: string[],
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const session = await this.loadOpenSessionOrThrow(
        tx,
        sessionId,
        branchId,
      );

      const [existingOpen] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM pos_statements
         WHERE session_id = $1::uuid AND status = 'open'
         LIMIT 1`,
        session.id,
      );
      if (existingOpen) {
        return this.getStatementById(tx, existingOpen.id, branchId, session);
      }

      const agg = await tx.$queryRawUnsafe<
        { method: string | null; amt: string }[]
      >(
        `SELECT TRIM(COALESCE(p.method, '')) AS method,
                SUM(COALESCE(p.amount, 0))::text AS amt
         FROM payments p
         INNER JOIN sales s ON s.id = p.sale_id
         WHERE s.pos_session_id = $1::uuid AND s.branch_id = $2::uuid
         GROUP BY TRIM(COALESCE(p.method, ''))`,
        session.id,
        branchId,
      );

      const expectedByBucket: Record<string, number> = {
        cash: 0,
        card: 0,
        wallet: 0,
      };
      for (const row of agg) {
        const bucket = paymentMethodToStatementBucket(row.method);
        expectedByBucket[bucket] = round2(
          expectedByBucket[bucket] + Number(row.amt ?? 0),
        );
      }

      const [st] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO pos_statements (session_id, status)
         VALUES ($1::uuid, 'open')
         RETURNING id`,
        session.id,
      );

      for (const bucket of STATEMENT_BUCKETS) {
        const exp = expectedByBucket[bucket] ?? 0;
        await tx.$queryRawUnsafe(
          `INSERT INTO pos_statement_lines
             (statement_id, payment_bucket, expected_amount, actual_amount, difference)
           VALUES ($1::uuid, $2, $3::numeric, $3::numeric, 0::numeric)`,
          st.id,
          bucket,
          exp,
        );
      }

      return this.getStatementById(tx, st.id, branchId, session);
    });
  }

  async patchStatementLine(
    schemaName: string,
    statementId: string,
    lineId: string,
    branchId: string,
    allowedBranchIds: string[],
    actualAmount: number,
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    const amt = round2(Number(actualAmount));
    if (!Number.isFinite(amt) || amt < 0) {
      throw new BadRequestException(
        'actualAmount must be a non-negative number',
      );
    }

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const stmt = await this.loadStatementWithSession(
        tx,
        statementId,
        branchId,
      );
      if (stmt.status !== 'open') {
        throw new BadRequestException('Statement is already posted');
      }

      const [line] = await tx.$queryRawUnsafe<
        { id: string; expected_amount: string }[]
      >(
        `SELECT id, expected_amount::text
         FROM pos_statement_lines
         WHERE id = $1::uuid AND statement_id = $2::uuid`,
        lineId,
        statementId,
      );
      if (!line) {
        throw new NotFoundException('Statement line not found');
      }

      const expected = round2(Number(line.expected_amount));
      const diff = round2(amt - expected);

      await tx.$queryRawUnsafe(
        `UPDATE pos_statement_lines
         SET actual_amount = $1::numeric, difference = $2::numeric
         WHERE id = $3::uuid`,
        amt,
        diff,
        lineId,
      );

      const session = await this.loadOpenSessionOrThrow(
        tx,
        stmt.session_id,
        branchId,
      );
      return this.getStatementById(tx, statementId, branchId, session);
    });
  }

  async getStatement(
    schemaName: string,
    statementId: string,
    branchId: string,
    allowedBranchIds: string[],
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const stmt = await this.loadStatementWithSession(
        tx,
        statementId,
        branchId,
      );
      const session = await this.loadSessionRow(tx, stmt.session_id, branchId);
      return this.getStatementById(tx, statementId, branchId, session);
    });
  }

  async postStatement(
    schemaName: string,
    statementId: string,
    branchId: string,
    allowedBranchIds: string[],
    actorUserId?: string | null,
    opts?: { varianceApprovalId?: string; permissionCodes?: string[] },
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const stmt = await this.loadStatementWithSession(
        tx,
        statementId,
        branchId,
      );
      if (stmt.status === 'posted') {
        throw new BadRequestException('Statement already posted');
      }

      const session = await this.loadOpenSessionOrThrow(
        tx,
        stmt.session_id,
        branchId,
      );

      await this.assertVarianceApprovedIfNeeded(
        schemaName,
        tx,
        session.id,
        branchId,
        opts?.varianceApprovalId,
        opts?.permissionCodes,
      );

      const lines = await tx.$queryRawUnsafe<
        {
          payment_bucket: string;
          difference: string;
        }[]
      >(
        `SELECT payment_bucket, difference::text
         FROM pos_statement_lines
         WHERE statement_id = $1::uuid
         ORDER BY payment_bucket`,
        statementId,
      );

      const entryDate = new Date();
      await this.lockDates.assertDocumentDateOpen(tx, branchId, entryDate);

      const varianceLines = lines.map((l) => ({
        paymentBucket: l.payment_bucket,
        difference: round2(Number(l.difference)),
      }));

      const journal =
        await this.accountingPosting.postPosStatementVarianceJournal(tx, {
          branchId,
          statementId,
          lines: varianceLines,
          entryDate,
        });

      let journalEntryId: string | null = null;
      if (journal?.id) {
        journalEntryId = journal.id;
      } else {
        const [existingJe] = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM journal_entries
           WHERE branch_id = $1::uuid AND source_type = 'pos_statement' AND source_id = $2::uuid
           LIMIT 1`,
          branchId,
          statementId,
        );
        journalEntryId = existingJe?.id ?? null;
      }

      await tx.$queryRawUnsafe(
        `UPDATE pos_statements
         SET status = 'posted',
             posted_at = NOW(),
             journal_entry_id = $2::uuid
         WHERE id = $1::uuid`,
        statementId,
        journalEntryId,
      );

      await this.auditLog.append(tx, {
        branchId,
        actorUserId: actorUserId ?? null,
        tableName: 'pos_statements',
        recordId: statementId,
        action: 'post',
        newPayload: { journal_entry_id: journalEntryId },
      });

      return this.getStatementById(tx, statementId, branchId, session);
    });
  }

  async getXReport(
    schemaName: string,
    sessionId: string,
    branchId: string,
    allowedBranchIds: string[],
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const session = await this.loadSessionOrThrow(tx, sessionId, branchId);
      if (session.status !== 'open') {
        throw new BadRequestException('Session is not open');
      }
      return this.buildSessionReport(tx, session, branchId, 'x');
    });
  }

  async getZReport(
    schemaName: string,
    sessionId: string,
    branchId: string,
    allowedBranchIds: string[],
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const session = await this.loadSessionOrThrow(tx, sessionId, branchId);

      const base = await this.buildSessionReport(tx, session, branchId, 'z');

      const [posted] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT ps.id
         FROM pos_statements ps
         WHERE ps.session_id = $1::uuid AND ps.status = 'posted'
         ORDER BY ps.posted_at DESC NULLS LAST
         LIMIT 1`,
        sessionId,
      );

      if (!posted?.id) {
        return {
          ...base,
          statementPosted: false,
          statement: null,
        };
      }

      const lines = await tx.$queryRawUnsafe<PosStatementLineRow[]>(
        `SELECT id, payment_bucket, expected_amount::text, actual_amount::text, difference::text
         FROM pos_statement_lines
         WHERE statement_id = $1::uuid
         ORDER BY payment_bucket`,
        posted.id,
      );

      return {
        ...base,
        statementPosted: true,
        statement: {
          id: posted.id,
          lines: lines.map((l) => ({
            id: l.id,
            paymentBucket: l.payment_bucket,
            expectedAmount: Number(l.expected_amount),
            actualAmount: Number(l.actual_amount),
            difference: Number(l.difference),
          })),
        },
      };
    });
  }

  async closeSession(
    schemaName: string,
    sessionId: string,
    branchId: string,
    allowedBranchIds: string[],
    opts?: { varianceApprovalId?: string; permissionCodes?: string[] },
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const session = await this.loadSessionOrThrow(tx, sessionId, branchId);
      if (session.status !== 'open' && session.status !== 'paused') {
        throw new BadRequestException('Session is already closed');
      }

      const [posted] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM pos_statements
         WHERE session_id = $1::uuid AND status = 'posted'
         LIMIT 1`,
        sessionId,
      );
      if (!posted) {
        throw new BadRequestException(
          'Cannot close session without a posted POS statement.',
        );
      }

      await this.assertVarianceApprovedIfNeeded(
        schemaName,
        tx,
        sessionId,
        branchId,
        opts?.varianceApprovalId,
        opts?.permissionCodes,
      );

      await tx.$queryRawUnsafe(
        `UPDATE pos_sessions
         SET status = 'closed', closed_at = NOW()
         WHERE id = $1::uuid`,
        sessionId,
      );

      void this.auditLog.appendInSchema(schemaName, {
        branchId,
        tableName: 'pos_auth',
        recordId: session.device_id ?? sessionId,
        action: 'pos_shift_closed',
        newPayload: { sessionId },
        entityType: 'pos_auth',
        entityId: session.device_id ?? sessionId,
      });

      const [row] = await tx.$queryRawUnsafe<PosSessionFullRow[]>(
        `SELECT id, branch_id, device_id, staff_user_id, status, opened_at, closed_at
         FROM pos_sessions WHERE id = $1::uuid`,
        sessionId,
      );
      return row;
    });
  }

  async pauseSession(
    schemaName: string,
    sessionId: string,
    branchId: string,
    allowedBranchIds: string[],
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const session = await this.loadOpenSessionOrThrow(tx, sessionId, branchId);
      await tx.$queryRawUnsafe(
        `UPDATE pos_sessions SET status = 'paused', paused_at = NOW() WHERE id = $1::uuid`,
        session.id,
      );
      void this.auditLog.appendInSchema(schemaName, {
        branchId,
        tableName: 'pos_auth',
        recordId: session.device_id ?? session.id,
        action: 'pos_shift_paused',
        newPayload: { sessionId: session.id },
        entityType: 'pos_auth',
        entityId: session.device_id ?? session.id,
      });
      return { id: session.id, status: 'paused' };
    });
  }

  async resumeSession(
    schemaName: string,
    sessionId: string,
    branchId: string,
    allowedBranchIds: string[],
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const session = await this.loadSessionOrThrow(tx, sessionId, branchId);
      if (session.status !== 'paused') {
        throw new BadRequestException('Session is not paused');
      }
      await tx.$queryRawUnsafe(
        `UPDATE pos_sessions SET status = 'open', reopened_at = NOW() WHERE id = $1::uuid`,
        session.id,
      );
      void this.auditLog.appendInSchema(schemaName, {
        branchId,
        tableName: 'pos_auth',
        recordId: session.device_id ?? session.id,
        action: 'pos_shift_resumed',
        newPayload: { sessionId: session.id },
        entityType: 'pos_auth',
        entityId: session.device_id ?? session.id,
      });
      return { id: session.id, status: 'open' };
    });
  }

  async approveVariance(
    schemaName: string,
    sessionId: string,
    branchId: string,
    allowedBranchIds: string[],
    approverUserId: string,
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const session = await this.loadSessionOrThrow(tx, sessionId, branchId);
      await tx.$queryRawUnsafe(
        `UPDATE pos_sessions
         SET variance_approved_by = $2::uuid, variance_approved_at = NOW()
         WHERE id = $1::uuid`,
        session.id,
        approverUserId,
      );
      void this.auditLog.appendInSchema(schemaName, {
        branchId,
        actorUserId: approverUserId,
        tableName: 'pos_auth',
        recordId: session.device_id ?? session.id,
        action: 'pos_variance_approved',
        newPayload: { sessionId: session.id },
        entityType: 'pos_auth',
        entityId: session.device_id ?? session.id,
      });
      return { id: session.id, approved: true };
    });
  }

  private async loadSessionOrThrow(
    tx: Prisma.TransactionClient,
    sessionId: string,
    branchId: string,
  ) {
    const session = await this.loadSessionRow(tx, sessionId, branchId);
    if (!session) {
      throw new NotFoundException('POS session not found');
    }
    return session;
  }

  private async loadSessionRow(
    tx: Prisma.TransactionClient,
    sessionId: string,
    branchId: string,
  ) {
    const [session] = await tx.$queryRawUnsafe<
      {
        id: string;
        branch_id: string;
        device_id: string | null;
        status: string;
        opened_at: Date;
        closed_at: Date | null;
      }[]
    >(
      `SELECT id, branch_id, device_id, status, opened_at, closed_at
       FROM pos_sessions
       WHERE id = $1::uuid AND branch_id = $2::uuid`,
      sessionId,
      branchId,
    );
    return session ?? null;
  }

  private async loadOpenSessionOrThrow(
    tx: Prisma.TransactionClient,
    sessionId: string,
    branchId: string,
  ) {
    const session = await this.loadSessionOrThrow(tx, sessionId, branchId);
    if (session.status !== 'open') {
      throw new BadRequestException('POS session is not open');
    }
    return session;
  }

  private async loadStatementWithSession(
    tx: Prisma.TransactionClient,
    statementId: string,
    branchId: string,
  ) {
    const [row] = await tx.$queryRawUnsafe<
      { id: string; session_id: string; status: string }[]
    >(
      `SELECT ps.id, ps.session_id, ps.status
       FROM pos_statements ps
       INNER JOIN pos_sessions s ON s.id = ps.session_id
       WHERE ps.id = $1::uuid AND s.branch_id = $2::uuid`,
      statementId,
      branchId,
    );
    if (!row) {
      throw new NotFoundException('Statement not found');
    }
    return row;
  }

  private async getStatementById(
    tx: Prisma.TransactionClient,
    statementId: string,
    branchId: string,
    session: {
      id: string;
      branch_id: string;
      status: string;
      opened_at: Date;
      closed_at: Date | null;
    },
  ) {
    const [st] = await tx.$queryRawUnsafe<PosStatementDetailRow[]>(
      `SELECT id, session_id, status, journal_entry_id, created_at, posted_at
       FROM pos_statements WHERE id = $1::uuid`,
      statementId,
    );

    const lines = await tx.$queryRawUnsafe<PosStatementLineRow[]>(
      `SELECT id, payment_bucket, expected_amount::text, actual_amount::text, difference::text
       FROM pos_statement_lines
       WHERE statement_id = $1::uuid
       ORDER BY payment_bucket`,
      statementId,
    );

    return {
      statement: {
        ...st,
        lines: lines.map((l) => ({
          id: l.id,
          paymentBucket: l.payment_bucket,
          expectedAmount: Number(l.expected_amount),
          actualAmount: Number(l.actual_amount),
          difference: Number(l.difference),
        })),
      },
      session,
    };
  }

  private async buildSessionReport(
    tx: Prisma.TransactionClient,
    session: {
      id: string;
      opened_at: Date;
      status: string;
      closed_at: Date | null;
    },
    branchId: string,
    kind: 'x' | 'z',
  ) {
    const [saleAgg] = await tx.$queryRawUnsafe<
      {
        cnt: string;
        net_sales: string;
        tax_sum: string;
      }[]
    >(
      `SELECT COUNT(*)::text AS cnt,
              COALESCE(SUM(COALESCE(total_amount, 0)), 0)::text AS net_sales,
              COALESCE(SUM(COALESCE(tax, 0)), 0)::text AS tax_sum
       FROM sales
       WHERE pos_session_id = $1::uuid AND branch_id = $2::uuid`,
      session.id,
      branchId,
    );

    const payRows = await tx.$queryRawUnsafe<
      { method: string | null; amt: string }[]
    >(
      `SELECT TRIM(COALESCE(p.method, '')) AS method,
              SUM(COALESCE(p.amount, 0))::text AS amt
       FROM payments p
       INNER JOIN sales s ON s.id = p.sale_id
       WHERE s.pos_session_id = $1::uuid AND s.branch_id = $2::uuid
       GROUP BY TRIM(COALESCE(p.method, ''))`,
      session.id,
      branchId,
    );

    const paymentBuckets: Record<string, number> = {
      cash: 0,
      card: 0,
      wallet: 0,
    };
    for (const row of payRows) {
      const amt = Number(row.amt ?? 0);
      const b = paymentMethodToStatementBucket(row.method);
      paymentBuckets[b] = round2(paymentBuckets[b] + amt);
    }

    const paymentByMethod = payRows
      .map((row) => ({
        method:
          row.method && String(row.method).trim() !== ''
            ? String(row.method)
            : 'Unspecified',
        amount: round2(Number(row.amt ?? 0)),
      }))
      .sort((a, b) => b.amount - a.amount);

    const [saleExtras] = await tx.$queryRawUnsafe<
      {
        gross_sales: string;
        discount_sum: string;
        discount_txn_count: string;
      }[]
    >(
      `SELECT COALESCE(SUM(COALESCE(total_amount, 0) + COALESCE(discount, 0)), 0)::text AS gross_sales,
              COALESCE(SUM(COALESCE(discount, 0)), 0)::text AS discount_sum,
              COUNT(*) FILTER (WHERE COALESCE(discount, 0) > 0)::text AS discount_txn_count
       FROM sales
       WHERE pos_session_id = $1::uuid AND branch_id = $2::uuid`,
      session.id,
      branchId,
    );

    const [itemsRow] = await tx.$queryRawUnsafe<{ qty_sum: string }[]>(
      `SELECT COALESCE(SUM(si.quantity), 0)::text AS qty_sum
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE s.pos_session_id = $1::uuid AND s.branch_id = $2::uuid`,
      session.id,
      branchId,
    );

    const [refundRow] = await tx.$queryRawUnsafe<{ refund_cnt: string }[]>(
      `SELECT COUNT(*)::text AS refund_cnt
       FROM sale_returns sr
       INNER JOIN sales s ON s.id = sr.sale_id
       WHERE s.pos_session_id = $1::uuid AND s.branch_id = $2::uuid`,
      session.id,
      branchId,
    );

    const categoryRows = await tx.$queryRawUnsafe<
      { category_name: string; amt: string }[]
    >(
      `SELECT COALESCE(pc.name, 'Uncategorized') AS category_name,
              SUM(COALESCE(si.total, 0))::text AS amt
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE s.pos_session_id = $1::uuid AND s.branch_id = $2::uuid
         AND si.product_id IS NOT NULL
       GROUP BY COALESCE(pc.name, 'Uncategorized')
       ORDER BY SUM(COALESCE(si.total, 0)) DESC`,
      session.id,
      branchId,
    );

    const [cogsRow] = await tx.$queryRawUnsafe<{ cogs: string }[]>(
      `SELECT COALESCE(SUM(si.quantity * COALESCE(b.cost_price, 0)), 0)::text AS cogs
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       LEFT JOIN batches b ON b.id = si.batch_id
       WHERE s.pos_session_id = $1::uuid AND s.branch_id = $2::uuid`,
      session.id,
      branchId,
    );

    const categorySales = categoryRows.map((r) => ({
      categoryName: r.category_name,
      amount: round2(Number(r.amt ?? 0)),
    }));

    const paymentsTotal = round2(
      paymentByMethod.reduce((s, p) => s + p.amount, 0),
    );

    return {
      kind,
      sessionId: session.id,
      sessionStatus: session.status,
      openedAt: session.opened_at,
      closedAt: session.closed_at,
      currentTime: new Date().toISOString(),
      paymentByMethod,
      paymentsTotal,
      categorySales,
      reportStats: {
        grossSales: Number(saleExtras?.gross_sales ?? 0),
        discountTotal: Number(saleExtras?.discount_sum ?? 0),
        discountTransactionCount: Number(saleExtras?.discount_txn_count ?? 0),
        rounding: 0,
        itemsSoldQuantity: Number(itemsRow?.qty_sum ?? 0),
        refundCount: Number(refundRow?.refund_cnt ?? 0),
        suspendedCount: 0,
      },
      totals: {
        transactionCount: Number(saleAgg?.cnt ?? 0),
        totalSales: Number(saleAgg?.net_sales ?? 0),
        taxAmount: Number(saleAgg?.tax_sum ?? 0),
        netSales: Number(saleAgg?.net_sales ?? 0),
        cashTotal: paymentBuckets.cash,
        cardTotal: paymentBuckets.card,
        walletTotal: paymentBuckets.wallet,
        cogsEstimate: Number(cogsRow?.cogs ?? 0),
      },
    };
  }
}
