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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { parsePagedQueryParam } from '../common/pagination.util';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import type { FastifyRequest } from 'fastify';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { UpdateSaleReturnDto } from './dto/update-sale-return.dto';
import { SaleReturnsService } from './sale-returns.service';

@Controller('sale-returns')
@UseGuards(PermissionGuard)
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
  @RequirePermissions('view_sales')
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
    const schemaName = this.tenantContext.getSchemaName()!;
    const paged = parsePagedQueryParam(page, limit);
    if (paged) {
      return this.saleReturnsService.findAllPaged(
        schemaName,
        allowedBranchIds,
        paged.skip,
        paged.limit,
      );
    }
    return this.saleReturnsService.findAll(schemaName, allowedBranchIds);
  }

  @Get(':id')
  @RequirePermissions('view_sales')
  findOne(@Param('id') id: string, @Req() req: FastifyRequest) {
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
  @RequirePermissions('refund_sale')
  create(@Body() dto: CreateSaleReturnDto, @Req() req: FastifyRequest) {
    this.ensureTenant();
    return this.saleReturnsService.create(
      this.tenantContext.getSchemaName()!,
      req.branchId!,
      dto,
      { actorUserId: req.userId },
    );
  }

  @Patch(':id')
  @RequirePermissions('refund_sale')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSaleReturnDto,
    @Req() req: FastifyRequest,
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
  @RequirePermissions('refund_sale')
  remove(@Param('id') id: string, @Req() req: FastifyRequest) {
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
