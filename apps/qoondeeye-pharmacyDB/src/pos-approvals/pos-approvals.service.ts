import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { PosAuditService } from '../auth/pos-audit.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  ApprovePosApprovalDto,
  RequestAndApprovePosApprovalDto,
  RequestPosApprovalDto,
} from './dto/pos-approval.dto';

export const POS_VARIANCE_APPROVAL_THRESHOLD = 0.01;

type ApprovalRow = {
  id: string;
  branch_id: string;
  action_type: string;
  status: string;
  requested_by: string | null;
  approved_by: string | null;
  reason_code: string | null;
  reason_note: string | null;
  payload: unknown;
  expires_at: Date | null;
  created_at: Date;
  resolved_at: Date | null;
};

@Injectable()
export class PosApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posAudit: PosAuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async requestApproval(
    schemaName: string,
    branchId: string,
    dto: RequestPosApprovalDto,
    requestedBy: string | null,
    deviceId?: string | null,
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const [row] = await tx.$queryRawUnsafe<ApprovalRow[]>(
        `INSERT INTO pos_approval_requests
           (branch_id, action_type, status, requested_by, reason_code, reason_note, payload, expires_at)
         VALUES ($1::uuid, $2, 'pending', $3::uuid, $4, $5, $6::jsonb, $7)
         RETURNING id, branch_id, action_type, status, requested_by, approved_by,
                   reason_code, reason_note, payload, expires_at, created_at, resolved_at`,
        branchId,
        dto.actionType,
        requestedBy,
        dto.reasonCode ?? null,
        dto.reasonNote ?? null,
        dto.payload ? JSON.stringify(dto.payload) : null,
        expiresAt,
      );
      if (deviceId) {
        void this.posAudit.record({
          schemaName,
          deviceId,
          branchId,
          actorUserId: requestedBy,
          action: 'pos_approval_requested',
          payload: {
            approvalId: row.id,
            actionType: dto.actionType,
            reasonCode: dto.reasonCode ?? null,
          },
        });
      }
      return this.mapApproval(row);
    });
  }

  async approve(
    schemaName: string,
    branchId: string,
    approvalId: string,
    dto: ApprovePosApprovalDto,
    deviceId?: string | null,
  ) {
    const supervisor = await this.verifySupervisorPinInSchema(
      schemaName,
      dto.supervisorPin,
    );

    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<ApprovalRow[]>(
        `SELECT id, branch_id, action_type, status, requested_by, approved_by,
                reason_code, reason_note, payload, expires_at, created_at, resolved_at
         FROM pos_approval_requests
         WHERE id = $1::uuid AND branch_id = $2::uuid`,
        approvalId,
        branchId,
      );
      if (!row) throw new NotFoundException('Approval request not found');
      if (row.status !== 'pending') {
        throw new BadRequestException('Approval request is no longer pending');
      }
      if (row.expires_at && row.expires_at.getTime() < Date.now()) {
        throw new BadRequestException('Approval request has expired');
      }

      const [updated] = await tx.$queryRawUnsafe<ApprovalRow[]>(
        `UPDATE pos_approval_requests
         SET status = 'approved', approved_by = $3::uuid, reason_note = COALESCE($4, reason_note), resolved_at = NOW()
         WHERE id = $1::uuid AND branch_id = $2::uuid
         RETURNING id, branch_id, action_type, status, requested_by, approved_by,
                   reason_code, reason_note, payload, expires_at, created_at, resolved_at`,
        approvalId,
        branchId,
        supervisor.id,
        dto.reasonNote ?? null,
      );

      if (deviceId) {
        void this.posAudit.record({
          schemaName,
          deviceId,
          branchId,
          actorUserId: supervisor.id,
          action: 'pos_approval_granted',
          payload: { approvalId, actionType: row.action_type },
        });
      }

      return this.mapApproval(updated);
    });
  }

  async verifySupervisorPin(schemaName: string, staffId: string, pin: string) {
    const user = await this.findStaffByIdentifier(schemaName, staffId);
    if (!user) {
      throw new ForbiddenException('Invalid supervisor credentials');
    }
    const role = user.role_name?.toLowerCase() ?? '';
    if (!['manager', 'admin', 'pharmacist'].includes(role)) {
      throw new ForbiddenException('Supervisor role required');
    }
    const valid = await bcrypt.compare(pin, user.pin_hash);
    if (!valid) {
      throw new ForbiddenException('Invalid supervisor credentials');
    }
    return {
      userId: user.id,
      role: user.role_name,
      name: user.name,
    };
  }

  async requestAndApprove(
    schemaName: string,
    branchId: string,
    dto: RequestAndApprovePosApprovalDto,
    requestedBy: string | null,
    deviceId?: string | null,
  ) {
    const pending = await this.requestApproval(
      schemaName,
      branchId,
      dto,
      requestedBy,
      deviceId,
    );
    return this.approve(
      schemaName,
      branchId,
      pending.id,
      { supervisorPin: dto.supervisorPin, reasonNote: dto.reasonNote },
      deviceId,
    );
  }

  async assertApprovedRequest(
    schemaName: string,
    branchId: string,
    approvalId: string,
    actionType: string,
    payloadCheck?: (payload: Record<string, unknown>) => boolean,
  ): Promise<{ approvedBy: string | null }> {
    const [row] = await this.prisma.withTenantSchema(schemaName, async (tx) =>
      tx.$queryRawUnsafe<ApprovalRow[]>(
        `SELECT id, branch_id, action_type, status, requested_by, approved_by,
                reason_code, reason_note, payload, expires_at, created_at, resolved_at
         FROM pos_approval_requests
         WHERE id = $1::uuid AND branch_id = $2::uuid`,
        approvalId,
        branchId,
      ),
    );
    if (!row) {
      throw new ForbiddenException('Supervisor approval not found');
    }
    if (row.status !== 'approved') {
      throw new ForbiddenException('Supervisor approval is not granted');
    }
    if (row.action_type !== actionType) {
      throw new ForbiddenException('Supervisor approval type mismatch');
    }
    if (row.expires_at && row.expires_at.getTime() < Date.now()) {
      throw new ForbiddenException('Supervisor approval has expired');
    }
    const payload =
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {};
    if (payloadCheck && !payloadCheck(payload)) {
      throw new ForbiddenException('Supervisor approval payload mismatch');
    }
    return { approvedBy: row.approved_by };
  }

  async listPending(schemaName: string, branchId: string, limit = 50) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const rows = await tx.$queryRawUnsafe<ApprovalRow[]>(
        `SELECT id, branch_id, action_type, status, requested_by, approved_by,
                reason_code, reason_note, payload, expires_at, created_at, resolved_at
         FROM pos_approval_requests
         WHERE branch_id = $1::uuid AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT $2`,
        branchId,
        Math.min(200, Math.max(1, limit)),
      );
      return rows.map((r) => this.mapApproval(r));
    });
  }

  private async verifySupervisorPinInSchema(schemaName: string, pin: string) {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException('Tenant context required');
    }
    const users = await this.prisma.withTenantSchema(schemaName, async (tx) =>
      tx.$queryRawUnsafe<
        { id: string; pin_hash: string; role_name: string }[]
      >(
        `SELECT u.id, u.pin_hash, lower(r.name) AS role_name
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         WHERE lower(r.name) IN ('manager', 'admin', 'pharmacist')
           AND u.pin_hash IS NOT NULL`,
      ),
    );
    for (const user of users) {
      const valid = await bcrypt.compare(pin, user.pin_hash);
      if (valid) return user;
    }
    throw new ForbiddenException('Invalid supervisor PIN');
  }

  private async findStaffByIdentifier(schemaName: string, staffId: string) {
    const identifier = staffId.trim();
    const [row] = await this.prisma.withTenantSchema(schemaName, async (tx) =>
      tx.$queryRawUnsafe<
        {
          id: string;
          name: string | null;
          pin_hash: string;
          role_name: string;
        }[]
      >(
        `SELECT u.id, u.name, u.pin_hash, lower(r.name) AS role_name
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         WHERE u.pin_hash IS NOT NULL
           AND (
             lower(COALESCE(u.staff_id, '')) = lower($1)
             OR u.id::text = $1
           )
         LIMIT 1`,
        identifier,
      ),
    );
    return row ?? null;
  }

  private mapApproval(row: ApprovalRow) {
    return {
      id: row.id,
      branchId: row.branch_id,
      actionType: row.action_type,
      status: row.status,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      reasonCode: row.reason_code,
      reasonNote: row.reason_note,
      payload: row.payload,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    };
  }
}
