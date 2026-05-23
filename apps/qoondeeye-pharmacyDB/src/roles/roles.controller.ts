import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { RolesService } from './roles.service';

@Controller('roles')
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
  findAll() {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.findAll(schema, tenantId);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      permissions: string[];
    },
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.create(schema, tenantId, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      permissions?: string[];
    },
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.update(schema, tenantId, id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const { schema, tenantId } = this.ensureTenant();
    return this.rolesService.remove(schema, tenantId, id);
  }
}
