import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateReturnVoucherDto } from './dto/create-return-voucher.dto';
import { FinalizeReturnVoucherDto } from './dto/finalize-return-voucher.dto';
import { ReturnVouchersService } from './return-vouchers.service';

@Controller(['return-vouchers', 'vouchers'])
export class ReturnVouchersController {
  constructor(
    private readonly returnVouchersService: ReturnVouchersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  @Get('by-token/:token')
  findByToken(@Param('token') token: string, @Req() req: Request) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    const decoded = decodeURIComponent(token);
    return this.returnVouchersService
      .findByToken(
        this.tenantContext.getSchemaName()!,
        req.branchId,
        decoded,
        allowed,
      )
      .then((row) => {
        if (!row) {
          throw new NotFoundException('Voucher not found');
        }
        return { ...row, barcodeValue: row.token };
      });
  }

  @Post()
  create(@Body() dto: CreateReturnVoucherDto, @Req() req: Request) {
    this.ensureTenant();
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.returnVouchersService.create(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      dto,
    );
  }

  @Post(':id/finalize')
  finalize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizeReturnVoucherDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    if (!req.branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }
    return this.returnVouchersService.finalize(
      this.tenantContext.getSchemaName()!,
      req.branchId,
      id,
      dto,
    );
  }
}
