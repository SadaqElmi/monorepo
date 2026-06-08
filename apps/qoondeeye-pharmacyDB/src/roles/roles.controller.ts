import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(PermissionGuard)
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant(): { schema: string; tenantId: string } {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
    return { schema: tenant.schemaName, tenantId: tenant.id };
  }

  @Get()
  @RequirePermissions('view_roles')
  findAll() {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.findAll(schema, tenantId);
  }

  @Post()
  @RequirePermissions('create_role')
  create(
    @Body()
    body: {
      name: string;
      description?: string | null;
      active?: boolean;
      permissions: string[];
    },
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.create(schema, tenantId, body);
  }

  @Post(':id/clone')
  @RequirePermissions('create_role')
  clone(
    @Param('id') id: string,
    @Body() body: { name: string; description?: string | null },
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.clone(schema, tenantId, id, body);
  }

  @Patch(':id')
  @RequirePermissions('edit_role')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      active?: boolean;
      permissions?: string[];
    },
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.update(schema, tenantId, id, body);
  }

  @Delete(':id')
  @RequirePermissions('delete_role')
  remove(@Param('id') id: string) {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.remove(schema, tenantId, id);
  }
}
