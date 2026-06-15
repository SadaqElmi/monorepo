import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import type { FastifyRequest } from 'fastify';
import { Observable, interval, map, mergeMap } from 'rxjs';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PosMonitoringService } from './pos-monitoring.service';

@Controller('pos/monitoring')
@UseGuards(PermissionGuard)
export class PosMonitoringController {
  constructor(
    private readonly monitoringService: PosMonitoringService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ctx() {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) throw new BadRequestException('Tenant context required');
    return tenant;
  }

  @RequirePermissions('view_pos_terminals')
  @Get('overview')
  overview(@Req() req: FastifyRequest) {
    const tenant = this.ctx();
    return this.monitoringService.getOverview(
      tenant.id,
      tenant.schemaName,
      req.branchId,
    );
  }

  @RequirePermissions('view_pos_terminals')
  @Get('events')
  events(@Req() req: FastifyRequest, @Query('limit') limit?: string) {
    const tenant = this.ctx();
    const n = Number(limit) || 50;
    return this.monitoringService.listEvents(
      tenant.schemaName,
      req.branchId,
      Number.isFinite(n) ? n : 50,
    );
  }

  @RequirePermissions('view_pos_terminals')
  @Sse('stream')
  stream(@Req() req: FastifyRequest): Observable<MessageEvent> {
    const tenant = this.ctx();
    const branchId = req.branchId;
    return interval(30000).pipe(
      mergeMap(async () =>
        this.monitoringService.getOverview(tenant.id, tenant.schemaName, branchId),
      ),
      map((data) => ({ data: JSON.stringify(data) }) as MessageEvent),
    );
  }
}
