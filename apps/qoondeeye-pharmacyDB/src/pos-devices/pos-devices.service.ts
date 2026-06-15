import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PosHeartbeatDto } from './dto/heartbeat.dto';

@Injectable()
export class PosDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(
    tenantId: string,
    deviceId: string,
    dto: PosHeartbeatDto,
    ip?: string,
  ) {
    const [row] = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE public.pos_devices
       SET last_heartbeat_at = NOW(),
           last_seen_at = NOW(),
           device_name = COALESCE($3, device_name),
           device_model = COALESCE($4, device_model),
           os_version = COALESCE($5, os_version),
           browser_version = COALESCE($6, browser_version),
           app_version = COALESCE($7, app_version),
           pending_outbox_count = COALESCE($8, pending_outbox_count),
           last_ip = COALESCE($9::inet, last_ip)
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING id`,
      deviceId,
      tenantId,
      dto.deviceName ?? null,
      dto.deviceModel ?? null,
      dto.osVersion ?? null,
      dto.browserVersion ?? null,
      dto.appVersion ?? null,
      dto.pendingOutboxCount ?? null,
      ip ?? null,
    );
    if (!row) throw new NotFoundException('Device not found');
    return { ok: true };
  }

  async listDevices(
    tenantId: string,
    opts: { branchId?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const skip = (page - 1) * limit;
    const params: unknown[] = [tenantId];
    let branchFilter = '';
    let nextParam = 2;
    if (opts.branchId) {
      params.push(opts.branchId);
      branchFilter = ` AND branch_id = $${nextParam}::uuid`;
      nextParam += 1;
    }
    const limitIdx = nextParam;
    const offsetIdx = nextParam + 1;
    params.push(limit, skip);

    const rows = await this.prisma.$queryRawUnsafe<
      {
        id: string;
        display_name: string | null;
        device_name: string | null;
        device_model: string | null;
        os_version: string | null;
        browser_version: string | null;
        last_ip: string | null;
        last_heartbeat_at: Date | null;
        binding_status: string;
        branch_id: string | null;
        disabled_at: Date | null;
        force_logout_at: Date | null;
        pending_outbox_count: number | null;
      }[]
    >(
      `SELECT id, display_name, device_name, device_model, os_version, browser_version,
              last_ip::text, last_heartbeat_at, binding_status, branch_id, disabled_at, force_logout_at,
              pending_outbox_count
       FROM public.pos_devices
       WHERE tenant_id = $1::uuid ${branchFilter}
       ORDER BY last_heartbeat_at DESC NULLS LAST
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      ...params,
    );

    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      deviceName: r.device_name,
      deviceModel: r.device_model,
      osVersion: r.os_version,
      browserVersion: r.browser_version,
      lastIp: r.last_ip,
      lastHeartbeatAt: r.last_heartbeat_at,
      bindingStatus: r.binding_status,
      branchId: r.branch_id,
      disabled: Boolean(r.disabled_at),
      forceLogoutAt: r.force_logout_at,
      pendingOutboxCount: r.pending_outbox_count ?? 0,
    }));
  }

  async disableDevice(tenantId: string, deviceId: string) {
    await this.updateDeviceFlag(tenantId, deviceId, 'disabled_at', 'NOW()');
    return { ok: true };
  }

  async enableDevice(tenantId: string, deviceId: string) {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.pos_devices SET disabled_at = NULL WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      deviceId,
      tenantId,
    );
    return { ok: true };
  }

  async forceLogout(tenantId: string, deviceId: string) {
    await this.updateDeviceFlag(tenantId, deviceId, 'force_logout_at', 'NOW()');
    return { ok: true };
  }

  async wipeCredential(tenantId: string, deviceId: string) {
    const [row] = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE public.pos_devices
       SET device_secret_hash = NULL, binding_status = 'revoked', revoked_at = NOW(), force_logout_at = NOW()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING id`,
      deviceId,
      tenantId,
    );
    if (!row) throw new NotFoundException('Device not found');
    return { ok: true };
  }

  private async updateDeviceFlag(
    tenantId: string,
    deviceId: string,
    column: string,
    value: string,
  ) {
    if (!['disabled_at', 'force_logout_at'].includes(column)) {
      throw new BadRequestException('Invalid column');
    }
    const [row] = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `UPDATE public.pos_devices SET ${column} = ${value}
       WHERE id = $1::uuid AND tenant_id = $2::uuid RETURNING id`,
      deviceId,
      tenantId,
    );
    if (!row) throw new NotFoundException('Device not found');
  }
}
