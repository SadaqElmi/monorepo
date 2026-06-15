import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import type { FastifyRequest } from 'fastify';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { AuthService } from '../auth/auth.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PosHeartbeatDto } from './dto/heartbeat.dto';
import { PosDevicesService } from './pos-devices.service';

@Controller('pos/devices')
export class PosDevicesController {
  constructor(
    private readonly devicesService: PosDevicesService,
    private readonly tenantContext: TenantContextService,
    private readonly authService: AuthService,
  ) {}

  private tenant() {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) throw new BadRequestException('Tenant context required');
    return tenant;
  }

  @Post('heartbeat')
  async heartbeat(@Body() dto: PosHeartbeatDto, @Req() req: FastifyRequest) {
    const tenant = this.tenant();
    const credential = req.headers['x-pos-device-credential'];
    if (typeof credential !== 'string' || !credential.trim()) {
      throw new BadRequestException('X-Pos-Device-Credential required');
    }
    const device = await this.authService.resolvePosDeviceFromCredential(
      credential.trim(),
    );
    const ip =
      typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : req.ip;
    return this.devicesService.heartbeat(tenant.id, device.id, dto, ip);
  }

  @UseGuards(PermissionGuard)
  @RequirePermissions('view_pos_terminals')
  @Get()
  list(
    @Query('branchId') branchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenant = this.tenant();
    return this.devicesService.listDevices(tenant.id, {
      branchId,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
  }

  @UseGuards(PermissionGuard)
  @RequirePermissions('manage_pos_terminals')
  @Post(':id/disable')
  disable(@Param('id') id: string) {
    return this.devicesService.disableDevice(this.tenant().id, id);
  }

  @RequirePermissions('manage_pos_terminals')
  @Post(':id/enable')
  enable(@Param('id') id: string) {
    return this.devicesService.enableDevice(this.tenant().id, id);
  }

  @RequirePermissions('manage_pos_terminals')
  @Post(':id/force-logout')
  forceLogout(@Param('id') id: string) {
    return this.devicesService.forceLogout(this.tenant().id, id);
  }

  @RequirePermissions('manage_pos_terminals')
  @Post(':id/wipe-credential')
  wipe(@Param('id') id: string) {
    return this.devicesService.wipeCredential(this.tenant().id, id);
  }
}
