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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class PosSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly accountingPosting: AccountingPostingService,
    private readonly lockDates: AccountingLockDateService,
    private readonly auditLog: AuditLogService,
  ) {}

  private ensureBranch(branchId: string, allowedBranchIds: string[]): void {
    if (!allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('Access denied to this branch');
    }
  }

  async openSession(
    schemaName: string,
    branchId: string,
    allowedBranchIds: string[],
    input: { deviceId?: string | null; staffUserId?: string | null },
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    try {
      return await this.prisma.withTenantSchema(schemaName, async (tx) => {
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

        const [row] = await tx.$queryRawUnsafe<
          {
            id: string;
            branch_id: string;
            device_id: string | null;
            staff_user_id: string | null;
            status: string;
            opened_at: Date;
            closed_at: Date | null;
          }[]
        >(
          `INSERT INTO pos_sessions (branch_id, device_id, staff_user_id, status)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'open')
           RETURNING id, branch_id, device_id, staff_user_id, status, opened_at, closed_at`,
          branchId,
          input.deviceId?.trim() ? input.deviceId : null,
          input.staffUserId?.trim() ? input.staffUserId : null,
        );
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
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [session] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, branch_id, device_id, staff_user_id, status, opened_at, closed_at
         FROM pos_sessions
         WHERE branch_id = $1::uuid AND status = 'open'
         ORDER BY opened_at DESC
         LIMIT 1`,
        branchId,
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
        hasPostedStatement: Boolean(postedSt?.id),
      };
    });
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

      const lines = await tx.$queryRawUnsafe<any[]>(
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
  ) {
    this.ensureBranch(branchId, allowedBranchIds);
    await this.tenantService.applyTenantSchemaPatches(schemaName);

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const session = await this.loadSessionOrThrow(tx, sessionId, branchId);
      if (session.status !== 'open') {
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

      await tx.$queryRawUnsafe(
        `UPDATE pos_sessions
         SET status = 'closed', closed_at = NOW()
         WHERE id = $1::uuid`,
        sessionId,
      );

      const [row] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, branch_id, device_id, staff_user_id, status, opened_at, closed_at
         FROM pos_sessions WHERE id = $1::uuid`,
        sessionId,
      );
      return row;
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
        status: string;
        opened_at: Date;
        closed_at: Date | null;
      }[]
    >(
      `SELECT id, branch_id, status, opened_at, closed_at
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
    const [st] = await tx.$queryRawUnsafe<any[]>(
      `SELECT id, session_id, status, journal_entry_id, created_at, posted_at
       FROM pos_statements WHERE id = $1::uuid`,
      statementId,
    );

    const lines = await tx.$queryRawUnsafe<any[]>(
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
