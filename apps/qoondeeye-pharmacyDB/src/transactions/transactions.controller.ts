import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CreateSaleDto } from '../sales/dto/create-sale.dto';
import { SalesService } from '../sales/sales.service';
import { TenantContextService } from '../tenant/tenant-context.service';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly salesService: SalesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  @Post()
  create(@Body() dto: CreateSaleDto, @Req() req: FastifyRequest) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.salesService.create(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      dto,
      { actorUserId: req.userId },
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.salesService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      allowedBranchIds,
    );
  }
}
