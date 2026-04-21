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
} from '@nestjs/common';
import type { Request } from 'express';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Controller('staff')
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
  findAll() {
    this.ensureTenant();
    return this.staffService.findAll(this.tenantContext.getSchemaName()!);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.staffService.findOne(this.tenantContext.getSchemaName()!, id);
  }

  @Post()
  create(@Body() dto: CreateStaffDto, @Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length || !req.branchId) {
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
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length || !req.branchId) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.staffService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
      req.branchId,
      allowedBranchIds,
      req.userRole ?? null,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.ensureTenant();
    return this.staffService.remove(this.tenantContext.getSchemaName()!, id);
  }
}
