import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import type { FastifyRequest } from 'fastify';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PosSecurityService } from './pos-security.service';

@Controller('pos/security')
@UseGuards(PermissionGuard)
export class PosSecurityController {
  constructor(
    private readonly securityService: PosSecurityService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private schema() {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) throw new BadRequestException('Tenant context required');
    return tenant.schemaName;
  }

  @RequirePermissions('view_pos_terminals')
  @Get('events')
  events(@Req() req: FastifyRequest, @Query('limit') limit?: string) {
    const n = Number(limit) || 50;
    return this.securityService.listEvents(
      this.schema(),
      req.branchId,
      Number.isFinite(n) ? n : 50,
    );
  }

  @RequirePermissions('manage_pos_terminals')
  @Get('anomalies')
  anomalies(@Req() req: FastifyRequest) {
    if (!req.branchId) throw new BadRequestException('Branch required');
    return this.securityService.detectAnomalies(this.schema(), req.branchId);
  }
}
