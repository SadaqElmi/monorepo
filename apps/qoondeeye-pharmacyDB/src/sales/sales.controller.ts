import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import type { Request } from 'express';

@Controller('sales')
export class SalesController {
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

  @Get()
  findAll(@Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.salesService.findAll(
      this.tenantContext.getSchemaName()!,
      allowedBranchIds,
    );
  }

  @Get('by-receipt')
  findByReceipt(@Query('number') number: string, @Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    const n = number?.trim();
    if (!n) {
      throw new BadRequestException('Query parameter "number" is required');
    }
    return this.salesService
      .findByReceiptNumber(
        this.tenantContext.getSchemaName()!,
        req.branchId,
        n,
        allowedBranchIds,
      )
      .then((sale) => {
        if (!sale) {
          throw new NotFoundException('No sale found for this receipt number');
        }
        return sale;
      });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.salesService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  create(@Body() dto: CreateSaleDto, @Req() req: Request) {
    this.ensureTenant();
    return this.salesService.create(
      this.tenantContext.getSchemaName()!,
      req.branchId!,
      dto,
      {
        actorUserId: req.userId,
        requestUserRole: req.userRole ?? null,
      },
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    return this.salesService.update(
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
    return this.salesService.remove(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
      { actorUserId: req.userId },
    );
  }
}
