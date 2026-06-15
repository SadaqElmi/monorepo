import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminPermissionGuard } from '../common/security/admin-permission.guard';
import { RequireAdminPermissions } from '../common/security/require-admin-permissions.decorator';
import { AdminTenantsService, type AdminActor } from './admin-tenants.service';
import { ActivateAdminTenantDto } from './dto/activate-admin-tenant.dto';
import { AssignTenantOwnerDto } from './dto/assign-tenant-owner.dto';
import { CreateAdminTenantDto } from './dto/create-admin-tenant.dto';

@Controller('admin')
@UseGuards(AdminPermissionGuard)
export class AdminTenantsController {
  constructor(private readonly adminTenantsService: AdminTenantsService) {}

  @Get('tenants')
  @RequireAdminPermissions('view_tenants')
  listTenants(
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

  @Get('tenants/:id')
  @RequireAdminPermissions('view_tenants')
  getTenant(@Param('id') id: string) {
    return this.adminTenantsService.getTenant(id);
  }

  @Post('tenants')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @RequireAdminPermissions('create_tenant')
  createTenant(@Body() dto: CreateAdminTenantDto, @Req() req: FastifyRequest) {
    return this.adminTenantsService.createTenant(dto, this.actor(req));
  }

  @Patch('tenants/:id/activate')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @RequireAdminPermissions('update_tenant_status')
  activateTenant(
    @Param('id') id: string,
    @Body() dto: ActivateAdminTenantDto,
    @Req() req: FastifyRequest,
  ) {
    return this.adminTenantsService.activateTenant(id, dto, this.actor(req));
  }

  @Post('tenants/:id/owner')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @RequireAdminPermissions('update_tenant_status')
  assignTenantOwner(
    @Param('id') id: string,
    @Body() dto: AssignTenantOwnerDto,
    @Req() req: FastifyRequest,
  ) {
    return this.adminTenantsService.assignTenantOwner(id, dto, this.actor(req));
  }

  @Delete('tenants/:id/owner')
  @RequireAdminPermissions('update_tenant_status')
  clearTenantOwner(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.adminTenantsService.clearTenantOwner(id, this.actor(req));
  }

  @Patch('tenants/:id/suspend')
  @RequireAdminPermissions('update_tenant_status')
  suspendTenant(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.adminTenantsService.suspendTenant(id, this.actor(req));
  }

  @Patch('tenants/:id/inactive')
  @RequireAdminPermissions('update_tenant_status')
  markTenantInactive(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.adminTenantsService.markTenantInactive(id, this.actor(req));
  }

  @Post('tenants/:id/run-migration')
  @RequireAdminPermissions('run_tenant_migration')
  runMigration(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.adminTenantsService.runMigration(id, this.actor(req));
  }

  @Get('tenants/:id/health')
  @RequireAdminPermissions('view_tenant_health')
  getHealth(@Param('id') id: string) {
    return this.adminTenantsService.getHealth(id);
  }

  @Post('tenants/:id/backup')
  @RequireAdminPermissions('create_tenant_backup')
  createBackup(@Param('id') id: string, @Req() req: FastifyRequest) {
    return this.adminTenantsService.createBackup(id, this.actor(req));
  }

  @Get('tenants/:id/storage')
  @RequireAdminPermissions('view_storage_usage')
  getStorage(@Param('id') id: string) {
    return this.adminTenantsService.getStorage(id);
  }

  @Get('tenants/:id/login-summary')
  @RequireAdminPermissions('view_login_summary')
  getLoginSummary(@Param('id') id: string) {
    return this.adminTenantsService.getLoginSummary(id);
  }

  @Get('tenants/:id/pos-terminals')
  @RequireAdminPermissions('manage_pos_terminals')
  listPosTerminals(@Param('id') id: string) {
    return this.adminTenantsService.listPosTerminals(id);
  }

  @Post('tenants/:id/pos-terminals/:terminalId/revoke-binding')
  @RequireAdminPermissions('manage_pos_terminals')
  revokePosTerminalBinding(
    @Param('id') id: string,
    @Param('terminalId') terminalId: string,
    @Req() req: FastifyRequest,
  ) {
    return this.adminTenantsService.revokePosTerminalBinding(
      id,
      terminalId,
      this.actor(req),
    );
  }

  @Post('tenants/:id/pos-terminals/:terminalId/reset-binding')
  @RequireAdminPermissions('manage_pos_terminals')
  resetPosTerminalBinding(
    @Param('id') id: string,
    @Param('terminalId') terminalId: string,
    @Req() req: FastifyRequest,
  ) {
    return this.adminTenantsService.resetPosTerminalBinding(
      id,
      terminalId,
      this.actor(req),
    );
  }

  @Get('audit-logs')
  @RequireAdminPermissions('view_admin_audit_logs')
  listAuditLogs(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminTenantsService.listAuditLogs({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  private actor(req: FastifyRequest): AdminActor {
    const userAgent = req.headers['user-agent'];
    return {
      adminUserId: req.userId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent ?? null,
    };
  }
}
