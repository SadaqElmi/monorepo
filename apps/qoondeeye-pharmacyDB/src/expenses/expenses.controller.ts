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
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import type { FastifyRequest } from 'fastify';

@Controller('expenses')
@UseGuards(PermissionGuard)
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
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
  @RequirePermissions('view_expenses')
  findAll(@Req() req: FastifyRequest) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.expensesService.findAll(
      this.tenantContext.getSchemaName()!,
      allowedBranchIds,
    );
  }

  @Get(':id')
  @RequirePermissions('view_expenses')
  findOne(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    return this.expensesService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  @RequirePermissions('create_expense')
  create(@Body() dto: CreateExpenseDto, @Req() req: FastifyRequest) {
    this.ensureTenant();
    return this.expensesService.create(
      this.tenantContext.getSchemaName()!,
      req.branchId!,
      dto,
      { actorUserId: req.userId },
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_expense')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @Req() req: FastifyRequest,
  ) {
    this.ensureTenant();
    return this.expensesService.update(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      dto,
    );
  }

  @Delete(':id')
  @RequirePermissions('delete_expense')
  remove(@Param('id') id: string, @Req() req: FastifyRequest) {
    this.ensureTenant();
    return this.expensesService.remove(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
      { actorUserId: req.userId },
    );
  }
}
