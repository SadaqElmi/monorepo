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
import { hasGlobalBranchAccess } from '../common/security/branch-access.policy';
import { TenantContextService } from '../tenant/tenant-context.service';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
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
    return this.suppliersService.findAll(this.tenantContext.getSchemaName()!);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.suppliersService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }

  private assertSupplierMutationRole(req: Request) {
    if (!hasGlobalBranchAccess(req.userRole, req.userCanViewAllBranches)) {
      throw new ForbiddenException(
        'Only admin or owner can create or modify suppliers',
      );
    }
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateSupplierDto) {
    this.ensureTenant();
    this.assertSupplierMutationRole(req);
    return this.suppliersService.create(
      this.tenantContext.getSchemaName()!,
      dto,
    );
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    this.ensureTenant();
    this.assertSupplierMutationRole(req);
    return this.suppliersService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    this.ensureTenant();
    this.assertSupplierMutationRole(req);
    return this.suppliersService.remove(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }
}
