import {
  BadRequestException,
  Delete,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { UpdateSaleReturnDto } from './dto/update-sale-return.dto';
import { SaleReturnsService } from './sale-returns.service';

@Controller('sale-returns')
export class SaleReturnsController {
  constructor(
    private readonly saleReturnsService: SaleReturnsService,
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
  findAll(@Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.saleReturnsService.findAll(
      this.tenantContext.getSchemaName()!,
      allowedBranchIds,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.saleReturnsService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      allowedBranchIds,
    );
  }

  @Post()
  create(@Body() dto: CreateSaleReturnDto, @Req() req: Request) {
    this.ensureTenant();
    return this.saleReturnsService.create(
      this.tenantContext.getSchemaName()!,
      req.branchId!,
      dto,
      { actorUserId: req.userId },
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSaleReturnDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.saleReturnsService.update(
      this.tenantContext.getSchemaName()!,
      id,
      allowedBranchIds,
      dto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.saleReturnsService.remove(
      this.tenantContext.getSchemaName()!,
      id,
      allowedBranchIds,
      { actorUserId: req.userId },
    );
  }
}
