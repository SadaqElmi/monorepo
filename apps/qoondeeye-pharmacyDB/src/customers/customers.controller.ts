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
import type { FastifyRequest } from 'fastify';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerRepaymentDto } from './dto/create-customer-repayment.dto';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';

@Controller('customers')
@UseGuards(PermissionGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  private branchIdsOrThrow(req: FastifyRequest): string[] {
    const ids = req.allowedBranchIds ?? [];
    if (!ids.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return ids;
  }

  @RequirePermissions('view_customers')
  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureTenant();
    const term = q?.trim();
    if (!term) {
      return [];
    }
    const lim = Math.min(50, Math.max(1, parseInt(limit ?? '25', 10) || 25));
    return this.customersService.search(
      this.tenantContext.getSchemaName()!,
      term,
      lim,
    );
  }

  @RequirePermissions('view_customers')
  @Get()
  findAll() {
    this.ensureTenant();
    return this.customersService.findAll(this.tenantContext.getSchemaName()!);
  }

  @Get(':id/credit-summary')
  @RequirePermissions('view_customer_credit')
  creditSummary(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    return this.customersService.creditSummary(
      this.tenantContext.getSchemaName()!,
      id,
      this.branchIdsOrThrow(req),
    );
  }

  @Get(':id/loan-history')
  @RequirePermissions('view_customer_credit')
  loanHistory(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    return this.customersService.loanHistory(
      this.tenantContext.getSchemaName()!,
      id,
      this.branchIdsOrThrow(req),
    );
  }

  @Post(':id/repayments')
  @RequirePermissions('record_customer_repayment')
  createRepayment(
    @Param('id') id: string,
    @Body() dto: CreateCustomerRepaymentDto,
    @Req() req: FastifyRequest,
  ) {
    this.ensureTenant();
    const allowed = req.allowedBranchIds ?? [];
    if (!allowed.includes(dto.branchId)) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.customersService.createRepayment(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
      req.userId,
    );
  }

  @RequirePermissions('view_customers')
  @Get(':id')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.customersService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }

  @Post()
  @RequirePermissions('create_customer')
  create(@Body() dto: CreateCustomerDto) {
    this.ensureTenant();
    return this.customersService.create(
      this.tenantContext.getSchemaName()!,
      dto,
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_customer')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    this.ensureTenant();
    return this.customersService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermissions('delete_customer')
  remove(@Param('id') id: string) {
    this.ensureTenant();
    return this.customersService.remove(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }
}
