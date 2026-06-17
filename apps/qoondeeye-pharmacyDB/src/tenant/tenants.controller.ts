import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Delete,
  GoneException,
  Req,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminTenantsService } from '../admin-tenants/admin-tenants.service';
import { CreateAdminTenantDto } from '../admin-tenants/dto/create-admin-tenant.dto';
import { AdminPermissionGuard } from '../common/security/admin-permission.guard';
import { RequireAdminPermissions } from '../common/security/require-admin-permissions.decorator';

const LEGACY_MUTATION_MESSAGE =
  'Legacy /api/tenants mutations are disabled. Use /api/admin/tenants instead.';

@Controller('tenants')
@UseGuards(AdminPermissionGuard)
export class TenantsController {
  constructor(private readonly adminTenantsService: AdminTenantsService) {}

  @Get()
  @RequireAdminPermissions('view_tenants')
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    return this.adminTenantsService.listTenants({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      search,
    });
  }

  @Get(':id')
  @RequireAdminPermissions('view_tenants')
  findOne(@Param('id') id: string) {
    return this.adminTenantsService.getTenant(id);
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @RequireAdminPermissions('create_tenant')
  create(
    @Body() dto: CreateAdminTenantDto,
    @Req() req: FastifyRequest,
  ) {
    return this.adminTenantsService.createTenant(dto, this.actor(req));
  }

  @Post(':id/abandon')
  @RequireAdminPermissions('update_tenant_status')
  abandonFailed() {
    throw new GoneException(LEGACY_MUTATION_MESSAGE);
  }

  /** Registered before `:id` so `schema/foo` is not captured as an id. */
  @Delete('schema/:schemaName')
  @RequireAdminPermissions('update_tenant_status')
  removeBySchema() {
    throw new GoneException(LEGACY_MUTATION_MESSAGE);
  }

  @Delete(':id')
  @RequireAdminPermissions('update_tenant_status')
  remove() {
    throw new GoneException(LEGACY_MUTATION_MESSAGE);
  }

  private actor(req: FastifyRequest) {
    const userAgent = req.headers['user-agent'];
    return {
      adminUserId: req.userId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent ?? null,
    };
  }
}
