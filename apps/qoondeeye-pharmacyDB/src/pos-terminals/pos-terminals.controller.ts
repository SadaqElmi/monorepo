import {
  BadRequestException,
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
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreatePosTerminalDto } from './dto/create-pos-terminal.dto';
import { ListPosTerminalsQueryDto } from './dto/list-pos-terminals.dto';
import { ResetPosTerminalPasswordDto } from './dto/reset-pos-terminal-password.dto';
import { UpdatePosTerminalDto } from './dto/update-pos-terminal.dto';
import { PosTerminalActivityService } from './pos-terminal-activity.service';
import { PosTerminalsService } from './pos-terminals.service';

@Controller('pos/terminals')
@UseGuards(PermissionGuard)
export class PosTerminalsController {
  constructor(
    private readonly posTerminalsService: PosTerminalsService,
    private readonly posTerminalActivity: PosTerminalActivityService,
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
  @RequirePermissions('view_pos_terminals')
  findAll(@Query() query: ListPosTerminalsQueryDto) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posTerminalsService.findAll(tenantId, schema, {
      page: query.page,
      limit: query.limit,
      q: query.q,
      branchId: query.branchId,
      status: query.status,
      bindingStatus: query.bindingStatus,
    });
  }

  @Get(':id/activity')
  @RequirePermissions('view_pos_terminals')
  getActivity(
    @Param('id') id: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(limitRaw ?? '20', 10) || 20));
    return this.posTerminalActivity.getActivity(tenantId, schema, id, {
      page,
      limit,
    });
  }

  @Get(':id/audit')
  @RequirePermissions('view_pos_terminals')
  getAudit(
    @Param('id') id: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(limitRaw ?? '20', 10) || 20),
    );
    return this.posTerminalActivity.getAuditLog(tenantId, schema, id, {
      page,
      limit,
    });
  }

  @Get(':id')
  @RequirePermissions('view_pos_terminals')
  findOne(@Param('id') id: string) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posTerminalsService.findOne(tenantId, schema, id);
  }

  @Post()
  @RequirePermissions('manage_pos_terminals')
  create(@Body() dto: CreatePosTerminalDto, @Req() req: FastifyRequest) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posTerminalsService.create(
      tenantId,
      schema,
      dto,
      req.userId ?? undefined,
    );
  }

  @Patch(':id')
  @RequirePermissions('manage_pos_terminals')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePosTerminalDto,
    @Req() req: FastifyRequest,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posTerminalsService.update(
      tenantId,
      schema,
      id,
      dto,
      req.userId ?? undefined,
    );
  }

  @Post(':id/reset-password')
  @RequirePermissions('manage_pos_terminals')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPosTerminalPasswordDto,
    @Req() req: FastifyRequest,
  ) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posTerminalsService.resetPassword(
      tenantId,
      schema,
      id,
      dto.password,
      req.userId ?? undefined,
    );
  }

  @Post(':id/revoke-binding')
  @RequirePermissions('manage_pos_terminals')
  revokeBinding(@Param('id') id: string, @Req() req: FastifyRequest) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posTerminalsService.revokeBinding(
      tenantId,
      schema,
      id,
      req.userId ?? undefined,
    );
  }

  @Delete(':id')
  @RequirePermissions('manage_pos_terminals')
  deactivate(@Param('id') id: string, @Req() req: FastifyRequest) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posTerminalsService.deactivate(
      tenantId,
      schema,
      id,
      req.userId ?? undefined,
    );
  }

  @Post(':id/reactivate')
  @RequirePermissions('manage_pos_terminals')
  reactivate(@Param('id') id: string, @Req() req: FastifyRequest) {
    const { schema, tenantId } = this.ensureTenant();
    return this.posTerminalsService.reactivate(
      tenantId,
      schema,
      id,
      req.userId ?? undefined,
    );
  }
}
