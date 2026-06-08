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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { parsePagedQueryParam } from '../common/pagination.util';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CreatePurchaseRefundDto } from './dto/create-purchase-refund.dto';
import type { FastifyRequest } from 'fastify';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';

@Controller('purchases')
@UseGuards(PermissionGuard)
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

  @RequirePermissions('view_purchases')
  @Get()
  findAll(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    const paged = parsePagedQueryParam(page, limit);
    if (paged) {
      return this.purchasesService.findAllPaged(
        this.tenantContext.getSchemaName()!,
        allowedBranchIds,
        paged.skip,
        paged.limit,
      );
    }
    return this.purchasesService.findAll(
      this.tenantContext.getSchemaName()!,
      allowedBranchIds,
    );
  }

  @RequirePermissions('view_purchases')
  @Get('line-pricing-by-product')
  linePricingByProduct(
    @Req() req: FastifyRequest,
    @Query('productId') productId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('uomId') uomId?: string,
  ) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    const schema = this.tenantContext.getSchemaName()!;
    const pid = productId?.trim();
    const sid = supplierId?.trim() || null;
    const uid = uomId?.trim() || null;
    if (pid) {
      return this.purchasesService.findLinePricingForProduct(
        schema,
        allowedBranchIds,
        pid,
        sid,
        uid,
      );
    }
    return this.purchasesService.findLinePricingByProduct(
      schema,
      allowedBranchIds,
      sid,
    );
  }

  @Post(':id/release')
  @RequirePermissions('edit_purchase')
  release(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.purchasesService.release(
      this.tenantContext.getSchemaName()!,
      id,
      allowed,
      { actorUserId: req.userId },
    );
  }

  @Post(':id/receive')
  @RequirePermissions('receive_purchase')
  receive(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.purchasesService.receive(
      this.tenantContext.getSchemaName()!,
      id,
      allowed,
      'pharmacy',
      { actorUserId: req.userId },
    );
  }

  @Post(':id/post-invoice')
  @RequirePermissions('post_purchase_invoice')
  postInvoice(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.purchasesService.postInvoice(
      this.tenantContext.getSchemaName()!,
      id,
      allowed,
      { actorUserId: req.userId },
    );
  }

  @Post(':id/close')
  @RequirePermissions('edit_purchase')
  close(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.purchasesService.close(
      this.tenantContext.getSchemaName()!,
      id,
      allowed,
      { actorUserId: req.userId },
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('edit_purchase')
  cancel(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.purchasesService.cancel(
      this.tenantContext.getSchemaName()!,
      id,
      allowed,
      { actorUserId: req.userId },
    );
  }

  @Post(':id/refunds')
  @RequirePermissions('edit_purchase')
  createRefund(
    @Param('id') id: string,
    @Body() dto: CreatePurchaseRefundDto,
    @Req() req: FastifyRequest,
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

  @RequirePermissions('view_purchases')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    return this.purchasesService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  @RequirePermissions('create_purchase')
  create(@Body() dto: CreatePurchaseDto, @Req() req: FastifyRequest) {
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
  @RequirePermissions('edit_purchase')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @Req() req: FastifyRequest,
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
  @RequirePermissions('delete_purchase')
  remove(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    return this.purchasesService.remove(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
      { actorUserId: req.userId },
    );
  }

  @Delete(':id/items')
  @RequirePermissions('edit_purchase')
  removeItems(@Param('id') id: string, @Req() req: FastifyRequest) {
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
