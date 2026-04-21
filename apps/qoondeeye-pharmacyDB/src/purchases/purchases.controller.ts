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
import { TenantContextService } from '../tenant/tenant-context.service';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CreatePurchaseRefundDto } from './dto/create-purchase-refund.dto';
import type { Request } from 'express';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly purchasesService: PurchasesService,
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
    return this.purchasesService.findAll(
      this.tenantContext.getSchemaName()!,
      allowedBranchIds,
    );
  }

  @Get('line-pricing-by-product')
  linePricingByProduct(@Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.purchasesService.findLinePricingByProduct(
      this.tenantContext.getSchemaName()!,
      allowedBranchIds,
    );
  }

  @Post(':id/refunds')
  createRefund(
    @Param('id') id: string,
    @Body() dto: CreatePurchaseRefundDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length || !req.branchId || !allowed.includes(req.branchId)) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.purchasesService.createRefund(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      id,
      allowed,
      dto,
      { actorUserId: req.userId },
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.purchasesService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  create(@Body() dto: CreatePurchaseDto, @Req() req: Request) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    const targetBranchId = dto.branchId ?? req.branchId!;
    if (!targetBranchId || !allowed.includes(targetBranchId)) {
      throw new ForbiddenException(
        'Invalid or unauthorized branch for this purchase',
      );
    }
    return this.purchasesService.create(
      this.tenantContext.getSchemaName()!,
      targetBranchId,
      dto,
      { actorUserId: req.userId },
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    return this.purchasesService.update(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      dto,
      { actorUserId: req.userId },
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.purchasesService.remove(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
      { actorUserId: req.userId },
    );
  }

  @Delete(':id/items')
  removeItems(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.purchasesService.removeItems(
      this.tenantContext.getSchemaName()!,
      id,
      allowedBranchIds,
      { actorUserId: req.userId },
    );
  }
}
