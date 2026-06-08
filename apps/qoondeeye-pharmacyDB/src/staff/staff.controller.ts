import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  BadRequestException,
  ForbiddenException,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Controller('staff')
@UseGuards(PermissionGuard)
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
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
  @RequirePermissions('view_staff')
  findAll() {
    this.ensureTenant();
    return this.staffService.findAll(this.tenantContext.getSchemaName()!);
  }

  @Get(':id')
  @RequirePermissions('view_staff')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.staffService.findOne(this.tenantContext.getSchemaName()!, id);
  }

  @Post()
  @RequirePermissions('create_staff')
  create(@Body() dto: CreateStaffDto, @Req() req: FastifyRequest) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length || !req.branchId) {
      if (req.isSuperAdmin) {
        throw new BadRequestException(
          'This pharmacy has no branches yet. Create a branch before adding staff.',
        );
      }
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.staffService.create(
      this.tenantContext.getSchemaName()!,
      dto,
      req.branchId,
      allowedBranchIds,
      req.userRole ?? null,
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_staff')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @Req() req: FastifyRequest,
  ) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length || !req.branchId) {
      if (req.isSuperAdmin) {
        throw new BadRequestException(
          'This pharmacy has no branches yet. Create a branch before updating staff.',
        );
      }
      throw new ForbiddenException('Access denied to this branch');
    }
    const sourceSchema = this.tenantContext.getSchemaName()!;
    const targetTenant = dto.targetTenant?.trim();
    if (targetTenant) {
      if (!req.isSuperAdmin) {
        throw new ForbiddenException(
          'Only super admins can move staff between pharmacies',
        );
      }
      if (targetTenant.toLowerCase() !== sourceSchema.toLowerCase()) {
        const { targetTenant: _ignored, ...updateDto } = dto;
        return this.staffService.transfer(
          sourceSchema,
          targetTenant,
          id,
          updateDto,
          req.branchId,
          allowedBranchIds,
          req.userRole ?? null,
        );
      }
    }
    const { targetTenant: _ignored, ...updateDto } = dto;
    return this.staffService.update(
      sourceSchema,
      id,
      updateDto,
      req.branchId,
      allowedBranchIds,
      req.userRole ?? null,
    );
  }

  @Delete(':id')
  @RequirePermissions('delete_staff')
  remove(@Param('id') id: string) {
    this.ensureTenant();
    return this.staffService.remove(this.tenantContext.getSchemaName()!, id);
  }
}
