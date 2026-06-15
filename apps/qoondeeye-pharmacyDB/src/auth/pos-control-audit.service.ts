import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'password',
  'pin',
  'setup_password_hash',
  'device_secret',
  'deviceCredential',
  'device_credential',
]);

export type PosControlAuditEvent = {
  tenantId: string;
  deviceId?: string | null;
  action: string;
  actorUserId?: string | null;
  actorType?: 'erp_user' | 'device' | 'staff' | 'system';
  ipAddress?: string | null;
  payload?: Record<string, unknown> | null;
};

@Injectable()
export class PosControlAuditService {
  private readonly logger = new Logger(PosControlAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private sanitizePayload(
    payload: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!payload) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (FORBIDDEN_PAYLOAD_KEYS.has(key)) continue;
      out[key] = value;
    }
    return Object.keys(out).length ? out : null;
  }

  async record(event: PosControlAuditEvent): Promise<void> {
    try {
      const payload = this.sanitizePayload(event.payload ?? null);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."pos_control_audit_events"
           (tenant_id, device_id, action, actor_user_id, actor_type, ip_address, payload)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::inet, $7::jsonb)`,
        event.tenantId,
        event.deviceId ?? null,
        event.action,
        event.actorUserId ?? null,
        event.actorType ?? 'erp_user',
        event.ipAddress ?? null,
        payload ? JSON.stringify(payload) : null,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `POS control audit write failed (${event.action}): ${message}`,
      );
    }
  }
}
