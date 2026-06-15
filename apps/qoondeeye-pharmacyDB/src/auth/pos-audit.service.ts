import { Injectable, Logger } from '@nestjs/common';
import { AuditLogService, type AuditPayload } from '../accounting/audit-log.service';

export type PosAuditEvent = {
  schemaName: string;
  deviceId: string;
  action: string;
  branchId?: string | null;
  actorUserId?: string | null;
  payload?: AuditPayload;
};

@Injectable()
export class PosAuditService {
  private readonly logger = new Logger(PosAuditService.name);

  constructor(private readonly auditLog: AuditLogService) {}

  async record(event: PosAuditEvent): Promise<void> {
    try {
      await this.auditLog.appendInSchema(event.schemaName, {
        branchId: event.branchId ?? null,
        actorUserId: event.actorUserId ?? null,
        tableName: 'pos_auth',
        recordId: event.deviceId,
        action: event.action,
        newPayload: event.payload ?? null,
        entityType: 'pos_auth',
        entityId: event.deviceId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `POS audit write failed (${event.action}): ${message}`,
      );
    }
  }
}
