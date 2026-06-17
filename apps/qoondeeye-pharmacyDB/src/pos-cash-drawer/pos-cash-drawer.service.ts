import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashMovementDto } from './dto/cash-movement.dto';

type MovementRow = {
  id: string;
  session_id: string;
  branch_id: string;
  movement_type: string;
  amount: string | number;
  reason_code: string | null;
  note: string | null;
  created_by: string | null;
  client_ref: string | null;
  created_at: Date;
};

@Injectable()
export class PosCashDrawerService {
  constructor(private readonly prisma: PrismaService) {}

  async createMovement(
    schemaName: string,
    sessionId: string,
    branchId: string,
    dto: CreateCashMovementDto,
    createdBy: string | null,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [session] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM pos_sessions WHERE id = $1::uuid AND branch_id = $2::uuid AND status IN ('open', 'paused')`,
        sessionId,
        branchId,
      );
      if (!session) {
        throw new NotFoundException('Open POS session not found');
      }

      if (dto.clientRef) {
        const [existing] = await tx.$queryRawUnsafe<MovementRow[]>(
          `SELECT id, session_id, branch_id, movement_type, amount, reason_code, note, created_by, client_ref, created_at
           FROM pos_cash_movements WHERE session_id = $1::uuid AND client_ref = $2::uuid`,
          sessionId,
          dto.clientRef,
        );
        if (existing) return this.mapMovement(existing);
      }

      const [row] = await tx.$queryRawUnsafe<MovementRow[]>(
        `INSERT INTO pos_cash_movements
           (session_id, branch_id, movement_type, amount, reason_code, note, created_by, client_ref)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid, $8::uuid)
         RETURNING id, session_id, branch_id, movement_type, amount, reason_code, note, created_by, client_ref, created_at`,
        sessionId,
        branchId,
        dto.movementType,
        dto.amount,
        dto.reasonCode ?? null,
        dto.note ?? null,
        createdBy,
        dto.clientRef ?? null,
      );
      return this.mapMovement(row);
    });
  }

  async listSessionMovements(
    schemaName: string,
    sessionId: string,
    branchId: string,
    skip = 0,
    limit = 100,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<MovementRow[]>(
        `SELECT id, session_id, branch_id, movement_type, amount, reason_code, note, created_by, client_ref, created_at
         FROM pos_cash_movements
         WHERE session_id = $1::uuid AND branch_id = $2::uuid
         ORDER BY created_at DESC
         OFFSET $3 LIMIT $4`,
        sessionId,
        branchId,
        skip,
        Math.min(200, Math.max(1, limit)),
      );
      return rows.map((r) => this.mapMovement(r));
    });
  }

  async getDrawerBalance(schemaName: string, sessionId: string, branchId: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [session] = await tx.$queryRawUnsafe<{
        opening_cash: string | number;
      }[]>(
        `SELECT opening_cash FROM pos_sessions WHERE id = $1::uuid AND branch_id = $2::uuid`,
        sessionId,
        branchId,
      );
      if (!session) throw new NotFoundException('POS session not found');

      const [cashSales] = await tx.$queryRawUnsafe<{ total: string | number }[]>(
        `SELECT COALESCE(SUM(p.amount), 0) AS total
         FROM sales s
         INNER JOIN payments p ON p.sale_id = s.id
         WHERE s.pos_session_id = $1::uuid AND lower(p.method) = 'cash'`,
        sessionId,
      );

      const [movements] = await tx.$queryRawUnsafe<{ net: string | number }[]>(
        `SELECT COALESCE(SUM(
           CASE
             WHEN movement_type IN ('cash_in', 'replenishment') THEN amount
             WHEN movement_type IN ('cash_out', 'safe_drop', 'petty_cash') THEN -amount
             ELSE 0
           END
         ), 0) AS net
         FROM pos_cash_movements WHERE session_id = $1::uuid`,
        sessionId,
      );

      const opening = Number(session.opening_cash ?? 0);
      const salesCash = Number(cashSales?.total ?? 0);
      const movementNet = Number(movements?.net ?? 0);
      const balance = opening + salesCash + movementNet;

      return {
        sessionId,
        openingCash: opening,
        cashSalesTotal: salesCash,
        movementsNet: movementNet,
        drawerBalance: balance,
      };
    });
  }

  async reportMovements(
    schemaName: string,
    branchId: string,
    opts: { from?: string; to?: string; sessionId?: string; skip?: number; limit?: number },
  ) {
    const skip = opts.skip ?? 0;
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const parts = [`branch_id = $1::uuid`];
      const vals: unknown[] = [branchId];
      let n = 2;
      if (opts.sessionId) {
        parts.push(`session_id = $${n}::uuid`);
        vals.push(opts.sessionId);
        n++;
      }
      if (opts.from) {
        parts.push(`created_at >= $${n}::timestamptz`);
        vals.push(opts.from);
        n++;
      }
      if (opts.to) {
        parts.push(`created_at <= $${n}::timestamptz`);
        vals.push(opts.to);
        n++;
      }
      vals.push(skip, limit);
      const rows = await tx.$queryRawUnsafe<MovementRow[]>(
        `SELECT id, session_id, branch_id, movement_type, amount, reason_code, note, created_by, client_ref, created_at
         FROM pos_cash_movements
         WHERE ${parts.join(' AND ')}
         ORDER BY created_at DESC
         OFFSET $${n} LIMIT $${n + 1}`,
        ...vals,
      );
      return rows.map((r) => this.mapMovement(r));
    });
  }

  private mapMovement(row: MovementRow) {
    return {
      id: row.id,
      sessionId: row.session_id,
      branchId: row.branch_id,
      movementType: row.movement_type,
      amount: Number(row.amount),
      reasonCode: row.reason_code,
      note: row.note,
      createdBy: row.created_by,
      clientRef: row.client_ref,
      createdAt: row.created_at,
    };
  }
}
