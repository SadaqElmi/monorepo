import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CreateSaleReturnDto } from '../sale-returns/dto/create-sale-return.dto';
import { SaleReturnsService } from '../sale-returns/sale-returns.service';
import { TenantContextService } from '../tenant/tenant-context.service';

@Controller('returns')
export class ReturnsController {
  constructor(
    private readonly saleReturnsService: SaleReturnsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post()
  create(@Body() dto: CreateSaleReturnDto, @Req() req: FastifyRequest) {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.saleReturnsService.create(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      dto,
    );
  }
}
