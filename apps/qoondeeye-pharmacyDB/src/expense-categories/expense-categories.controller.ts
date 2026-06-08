import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../common/security/permission.guard';
import { RequirePermissions } from '../common/security/require-permissions.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ExpenseCategoriesService } from './expense-categories.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

@Controller('expense-categories')
@UseGuards(PermissionGuard)
export class ExpenseCategoriesController {
  constructor(
    private readonly expenseCategoriesService: ExpenseCategoriesService,
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
  findAll() {
    this.ensureTenant();
    return this.expenseCategoriesService.findAll(
      this.tenantContext.getSchemaName()!,
    );
  }

  @Get(':id')
  @RequirePermissions('view_expenses')
  findOne(@Param('id') id: string) {
    this.ensureTenant();
    return this.expenseCategoriesService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }

  @Post()
  @RequirePermissions('manage_accounting_configuration')
  create(@Body() dto: CreateExpenseCategoryDto) {
    this.ensureTenant();
    return this.expenseCategoriesService.create(
      this.tenantContext.getSchemaName()!,
      dto,
    );
  }

  @Patch(':id')
  @RequirePermissions('manage_accounting_configuration')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    this.ensureTenant();
    return this.expenseCategoriesService.update(
      this.tenantContext.getSchemaName()!,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermissions('manage_accounting_configuration')
  remove(@Param('id') id: string) {
    this.ensureTenant();
    return this.expenseCategoriesService.remove(
      this.tenantContext.getSchemaName()!,
      id,
    );
  }
}
