import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ListPosAuditQueryDto } from './dto/list-pos-audit-query.dto';
import { PosAuditQueryService } from './pos-audit-query.service';

@Controller('audit')
@UseGuards(PermissionGuard)
export class PosAuditController {
  constructor(
    private readonly posAuditQuery: PosAuditQueryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('pos')
  @RequirePermissions('view_pos_terminals')
  listPosAudit(@Query() query: ListPosAuditQueryDto) {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
    return this.posAuditQuery.listGlobalPosAudit(tenant.id, tenant.schemaName, query);
  }
}
