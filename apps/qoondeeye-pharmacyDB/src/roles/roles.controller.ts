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

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  @Get()
  findAll() {
    this.ensureTenant();
    return this.rolesService.findAll(this.tenantContext.getSchemaName()!);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      permissions: string[];
    },
  ) {
    this.ensureTenant();
    return this.rolesService.create(this.tenantContext.getSchemaName()!, body);
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
    this.ensureTenant();
    return this.rolesService.update(
      this.tenantContext.getSchemaName()!,
      id,
      body,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.ensureTenant();
    return this.rolesService.remove(this.tenantContext.getSchemaName()!, id);
  }
}
